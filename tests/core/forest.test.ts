import { describe, expect, it } from 'vitest'
import { loadGolden } from '../helpers/golden'
import { expectTreeEquals, oracleFrom } from '../helpers/treeCompare'
import { DtError } from '../../src/core/errors'
import {
  aggregate,
  fitForest,
  forestProba,
  hardVote,
  oob,
  oobCurve,
  treeProbas,
  type ForestParams,
} from '../../src/core/forest'
import { generate } from '../../src/core/generators'
import { DEFAULT_TREE_PARAMS, predictProba } from '../../src/core/tree'
import { ensembleVariance, measureVariance } from '../../src/core/variance'

const golden = loadGolden('forest')
const TOL = 1e-12

const { maxFeatures: _mf, ccpAlpha: _ccp, ...BASE_TREE } = DEFAULT_TREE_PARAMS

function params(over: Partial<ForestParams> = {}): ForestParams {
  return { nEstimators: 10, maxFeatures: 1, bootstrap: true, tree: { ...BASE_TREE }, seed: 1, ...over }
}

function expectDtError(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(DtError)
    expect((e as DtError).code).toBe(code)
    return
  }
  throw new Error(`expected DtError ${code}`)
}

describe('fitForest against sklearn (exact)', () => {
  it('rebuilds all 25 sklearn trees with exported counts and tie oracles', () => {
    const ex = golden.exact
    expect(ex.trees).toHaveLength(25)
    const f = fitForest(ex.X, ex.y, ex.nClasses, ex.params, {
      bootstrapCounts: ex.bootstrapCounts,
      tieOracles: ex.trees.map(oracleFrom),
    })
    expect(f.trees).toHaveLength(25)
    f.trees.forEach((t, i) => {
      expect(Array.from(f.counts[i]), `counts ${i}`).toEqual(ex.bootstrapCounts[i])
      expectTreeEquals(t, ex.trees[i])
    })
    ex.grid.forEach((x: number[], g: number) => {
      const p = forestProba(f, x)
      p.forEach((v, c) => {
        if (!(Math.abs(v - ex.gridProba[g][c]) <= TOL)) throw new Error(`gridProba[${g}][${c}]: ${v} vs ${ex.gridProba[g][c]}`)
      })
    })
    const o = oob(f, ex.X, ex.y)
    expect(o.uncovered).toBe(0)
    expect(o.covered).toBe(200)
    expect(Math.abs((o.score as number) - ex.oobScore)).toBeLessThanOrEqual(TOL)
  })

  it('stays within the sklearn OOB band for max_features=1', () => {
    const st = golden.stat
    const scores: number[] = []
    for (let s = 0; s < st.seeds; s++) {
      const f = fitForest(st.X, st.y, 2, { ...st.params, seed: s })
      const o = oob(f, st.X, st.y)
      expect(o.score).not.toBeNull()
      scores.push(o.score as number)
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length
    expect(Math.abs(mean - st.oobMean)).toBeLessThanOrEqual(0.02)
  }, 60_000)
})

describe('aggregation', () => {
  it('averages probabilities, not votes', () => {
    const a = aggregate([
      [0.49, 0.51],
      [0.49, 0.51],
      [0.99, 0.01],
    ])
    expect(Math.abs(a.mean[1] - 1.03 / 3)).toBeLessThanOrEqual(TOL)
    expect(a.meanClass).toBe(0)
    expect(a.hardClass).toBe(1)
  })

  it('breaks ties towards the smallest class code', () => {
    const a = aggregate([
      [0, 1],
      [1, 0],
    ])
    expect(a.mean).toEqual([0.5, 0.5])
    expect(a.meanClass).toBe(0)
    expect(a.hardClass).toBe(0)
    // a tree whose own probabilities tie votes for the smallest code
    expect(aggregate([[0.5, 0.5]]).hardClass).toBe(0)
    expect(aggregate([[0.2, 0.4, 0.4], [0.1, 0.1, 0.8], [0.3, 0.6, 0.1]]).hardClass).toBe(1)
  })

  it('rejects an empty or ragged ensemble', () => {
    expectDtError(() => aggregate([]), 'BAD_PARAM')
    expectDtError(() => aggregate([[1, 0], [1]]), 'BAD_PARAM')
  })

  it('forestProba and hardVote use the per-tree probabilities', () => {
    const { X, y } = generate('moons', 60, 0.3, 4)
    const f = fitForest(X, y, 2, params())
    const x = [0.5, 0.25]
    const probas = treeProbas(f, x)
    expect(probas).toEqual(f.trees.map((t) => predictProba(t, x)))
    expect(forestProba(f, x)).toEqual(aggregate(probas).mean)
    expect(hardVote(f, x)).toBe(aggregate(probas).hardClass)
  })
})

describe('bootstrap and OOB', () => {
  it('draws reproducible bootstrap counts per tree', () => {
    const { X, y } = generate('moons', 80, 0.3, 2)
    const a = fitForest(X, y, 2, params({ seed: 5 }))
    const b = fitForest(X, y, 2, params({ seed: 5 }))
    const c = fitForest(X, y, 2, params({ seed: 6 }))
    expect(a.counts.map((k) => Array.from(k))).toEqual(b.counts.map((k) => Array.from(k)))
    expect(a.counts.map((k) => Array.from(k))).not.toEqual(c.counts.map((k) => Array.from(k)))
    for (const k of a.counts) expect(k.reduce((s, v) => s + v, 0)).toBe(80)
    expect(a.trees.map((t) => t.threshold)).toEqual(b.trees.map((t) => t.threshold))
  })

  it('reports uncovered rows instead of counting them as class 0', () => {
    const { X, y } = generate('moons', 50, 0.3, 1)
    const f = fitForest(X, y, 2, params({ nEstimators: 2 }))
    const o = oob(f, X, y)
    expect(o.uncovered).toBeGreaterThan(0)
    expect(o.covered + o.uncovered).toBe(50)
    let hits = 0
    let covered = 0
    for (let r = 0; r < 50; r++) {
      const probas = f.trees.filter((_, i) => f.counts[i][r] === 0).map((t) => predictProba(t, X[r]))
      if (probas.length === 0) continue
      covered++
      if (aggregate(probas).meanClass === y[r]) hits++
    }
    expect(o.covered).toBe(covered)
    expect(o.score).toBe(hits / covered)
  })

  it('has no OOB score without bootstrap', () => {
    const { X, y } = generate('moons', 50, 0.3, 1)
    const f = fitForest(X, y, 2, params({ bootstrap: false, maxFeatures: null, nEstimators: 3 }))
    for (const k of f.counts) expect(Array.from(k).every((v) => v === 1)).toBe(true)
    // without bootstrap and with all features, every tree is the same tree
    expect(f.trees[1]).toEqual(f.trees[0])
    const o = oob(f, X, y)
    expect(o.score).toBeNull()
    expect(o.covered).toBe(0)
    expect(o.uncovered).toBe(50)
    expect(oobCurve(f, X, y, [1, 3])).toEqual([
      { B: 1, score: null, uncovered: 50 },
      { B: 3, score: null, uncovered: 50 },
    ])
  })

  it('oobCurve evaluates the first B trees', () => {
    const { X, y } = generate('moons', 60, 0.3, 3)
    const f = fitForest(X, y, 2, params({ nEstimators: 8 }))
    const curve = oobCurve(f, X, y, [8, 1, 4])
    expect(curve.map((c) => c.B)).toEqual([8, 1, 4])
    const full = oob(f, X, y)
    expect(curve[0]).toEqual({ B: 8, score: full.score, uncovered: full.uncovered })
    const first4 = { trees: f.trees.slice(0, 4), counts: f.counts.slice(0, 4) }
    const o4 = oob(first4, X, y)
    expect(curve[2]).toEqual({ B: 4, score: o4.score, uncovered: o4.uncovered })
    expectDtError(() => oobCurve(f, X, y, [0]), 'BAD_PARAM')
    expectDtError(() => oobCurve(f, X, y, [9]), 'BAD_PARAM')
  })

  it('reports progress per tree and validates its inputs', () => {
    const { X, y } = generate('moons', 30, 0.3, 1)
    const seen: number[] = []
    fitForest(X, y, 2, params({ nEstimators: 3 }), { onTree: (i) => seen.push(i) })
    expect(seen).toEqual([0, 1, 2])
    expectDtError(() => fitForest(X, y, 2, params({ nEstimators: 0 })), 'BAD_PARAM')
    expectDtError(() => fitForest(X, y, 2, params({ nEstimators: 2 }), { bootstrapCounts: [[1]] }), 'BAD_PARAM')
    expectDtError(
      () => fitForest(X, y, 2, params({ nEstimators: 1, bootstrap: false }), { bootstrapCounts: [Array(30).fill(1)] }),
      'BAD_PARAM',
    )
    expectDtError(() => fitForest(X, y, 2, params({ nEstimators: 2 }), { tieOracles: [] }), 'BAD_PARAM')
  })
})

describe('ensemble variance', () => {
  it('follows rho*sigma2 + (1 - rho)*sigma2/B', () => {
    expect(ensembleVariance(1, 0.2, 10)).toBeCloseTo(0.28, 12)
    expect(ensembleVariance(1, 0.2, 100)).toBeCloseTo(0.208, 12)
    expect(ensembleVariance(0.5, 1, 7)).toBeCloseTo(0.5, 12)
    expectDtError(() => ensembleVariance(-1, 0.2, 10), 'BAD_PARAM')
    expectDtError(() => ensembleVariance(1, 1.5, 10), 'BAD_PARAM')
    expectDtError(() => ensembleVariance(1, 0.2, 0), 'BAD_PARAM')
  })

  it('measures variance close to the formula', () => {
    const steps: number[] = []
    const m = measureVariance(
      { name: 'moons', n: 200, noise: 0.3 },
      [0.5, 0.25],
      { nEstimators: 10, maxFeatures: 1, bootstrap: true, tree: { ...BASE_TREE }, seed: 1 },
      40,
      (i) => steps.push(i),
    )
    expect(steps).toHaveLength(40)
    expect(m.sigma2).toBeGreaterThan(0)
    expect(m.rho).not.toBeNull()
    expect(m.rho as number).toBeGreaterThanOrEqual(-1)
    expect(m.rho as number).toBeLessThanOrEqual(1)
    expect(m.varFormula).not.toBeNull()
    expect(Math.abs(m.varMeasured - (m.varFormula as number)) / (m.varFormula as number)).toBeLessThanOrEqual(0.1)
  }, 60_000)

  it('reports no spread in a pure region', () => {
    const m = measureVariance(
      { name: 'moons', n: 200, noise: 0.3 },
      [-3, 3],
      { nEstimators: 10, maxFeatures: 1, bootstrap: true, tree: { ...BASE_TREE, maxDepth: null }, seed: 1 },
      20,
    )
    expect(m.sigma2).toBe(0)
    expect(m.varMeasured).toBe(0)
    expect(m.rho).toBeNull()
    expect(m.varFormula).toBeNull()
    for (const v of Object.values(m)) expect(Number.isNaN(v)).toBe(false)
  }, 60_000)

  it('validates the measurement inputs', () => {
    const p = params({ nEstimators: 2 })
    expectDtError(() => measureVariance({ name: 'moons', n: 50, noise: 0.3 }, [0, 0], p, 1), 'BAD_PARAM')
    expectDtError(() => measureVariance({ name: 'moons', n: 50, noise: 0.3 }, [0], p, 5), 'BAD_PARAM')
  })
})
