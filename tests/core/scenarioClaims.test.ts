/**
 * Every number in a scenario text is proven here against the core, using exactly the state stored in the registry.
 */
import { describe, expect, it } from 'vitest'
import { chooseK, crossValidate, validationCurve } from '../../src/core/cv'
import { aggregate, fitForest, oob, oobCurve, type ForestParams } from '../../src/core/forest'
import { generate } from '../../src/core/generators'
import { autoChoices, growManual, manualImportances } from '../../src/core/manual'
import { PRESETS } from '../../src/core/presets'
import { costComplexityPath, pruneTree } from '../../src/core/prune'
import { candidateKey, candidates, type Candidate } from '../../src/core/splits'
import { DEFAULT_TREE_PARAMS, fitTree, nLeaves, predict, type TreeParams } from '../../src/core/tree'
import { measureVariance } from '../../src/core/variance'
import { parseComplexityQuery } from '../../src/tools/complexity/state'
import { parseForestQuery } from '../../src/tools/forest/state'
import { scenarioById } from '../../src/tools/scenarios'
import { parseSplitsQuery } from '../../src/tools/splits/state'

function splitsOf(id: string) {
  const { state, problems } = parseSplitsQuery(scenarioById(id)!.query)
  expect(problems).toEqual([])
  return { state, ds: PRESETS[state.preset] }
}

function rootCandidates(id: string): { cands: Candidate[]; names: string[] } {
  const { state, ds } = splitsOf(id)
  const rows = ds.y.map((_, i) => i)
  return { cands: candidates(ds, rows, state.criterion, ds.y.length), names: ds.features.map((f) => f.name) }
}

function bestGainOf(cands: Candidate[], feature: number): number {
  return Math.max(...cands.filter((c) => c.feature === feature).map((c) => c.gain))
}

describe('splits scenarios', () => {
  it('s1: Speed_Limit gives 1 bit, Grade 0.311, Bumpiness 0', () => {
    const { cands, names } = rootCandidates('s1')
    expect(splitsOf('s1').state.criterion).toBe('entropy')
    expect(names).toEqual(['Grade', 'Bumpiness', 'Speed_Limit'])
    const limit = cands.filter((c) => c.feature === 2)
    expect(bestGainOf(cands, 2)).toBeCloseTo(1, 12)
    const yes = limit.find((c) => c.kind === 'category' && c.value === 0)!
    expect(candidateKey(yes)).toBe('2:category:0')
    expect(Math.abs(yes.gain - 1)).toBeLessThan(1e-12)
    expect(bestGainOf(cands, 0)).toBeCloseTo(0.311, 3)
    expect(Math.abs(bestGainOf(cands, 1))).toBeLessThan(1e-12)
    // both children are pure after the Speed_Limit split
    const best = cands.find((c) => c.isBest)!
    expect(best.feature).toBe(2)
    expect(best.left.filter((c) => c > 0)).toHaveLength(1)
    expect(best.right.filter((c) => c > 0)).toHaveLength(1)
  })

  it('s2: tie a1/a2 at 0.549, right child 0.811 local / 0.406 global, MDI 0.575 / 0.425', () => {
    const { state, ds } = splitsOf('s2')
    expect(state.grow).toBe('auto')
    expect(state.criterion).toBe('entropy')
    const choices = autoChoices(ds, state.criterion)
    const { nodes } = growManual(ds, state.criterion, choices)
    const root = nodes.find((n) => n.path === '')!
    const ties = root.candidates.filter((c) => c.isTie)
    expect([...new Set(ties.map((c) => c.feature))].sort()).toEqual([0, 1])
    for (const c of ties) {
      expect(c.gain).toBeCloseTo(0.549, 3)
      expect(c.value).toBe(2.5)
    }
    expect(root.split!.feature).toBe(0)
    const right = nodes.find((n) => n.path === 'R')!
    expect(right.counts).toEqual([1, 3])
    expect(right.rows.length * 2).toBe(ds.y.length) // the right child holds half of the data
    expect(right.split!.gain).toBeCloseTo(0.811, 3)
    expect(right.split!.globalGain).toBeCloseTo(0.406, 3)
    const imp = manualImportances(nodes, ds.features.length)
    expect(imp[0]).toBeCloseTo(0.575, 3)
    expect(imp[1]).toBeCloseTo(0.425, 3)
  })

  it('s3: misclassification gives gain 0 for 6 of 8 questions, best 0.071 is a tie; entropy and gini prefer overcast', () => {
    const { state, ds } = splitsOf('s3')
    expect(state.criterion).toBe('misclass')
    const rows = ds.y.map((_, i) => i)
    const mis = candidates(ds, rows, 'misclass', ds.y.length)
    expect(mis).toHaveLength(8)
    const zero = mis.filter((c) => Math.abs(c.gain) < 1e-12)
    expect(zero).toHaveLength(6)
    expect(zero.map(candidateKey)).toContain('0:category:1')
    const max = Math.max(...mis.map((c) => c.gain))
    expect(max).toBeCloseTo(0.071, 3)
    const top = mis.filter((c) => Math.abs(c.gain - max) < 1e-12)
    expect(top.map(candidateKey).sort()).toEqual(['0:category:0', '2:category:0'])
    expect(
      mis
        .filter((c) => c.isTie)
        .map(candidateKey)
        .sort(),
    ).toEqual(['0:category:0', '2:category:0'])

    const overcastKey = '0:category:1'
    for (const [crit, value] of [
      ['entropy', 0.226],
      ['gini', 0.102],
    ] as const) {
      const best = candidates(ds, rows, crit, ds.y.length).find((c) => c.isBest)!
      expect(candidateKey(best), crit).toBe(overcastKey)
      expect(best.gain, crit).toBeCloseTo(value, 3)
    }
    // overcast gives a pure child of four "yes"
    const overcast = mis.find((c) => candidateKey(c) === overcastKey)!
    expect(overcast.nLeft).toBe(4)
    expect(overcast.left.filter((c) => c > 0)).toHaveLength(1)
  })
})

function complexityOf(id: string) {
  const { state, problems } = parseComplexityQuery(scenarioById(id)!.query)
  expect(problems).toEqual([])
  return { state, problems }
}

function momentsOf(id: string) {
  const { state } = complexityOf(id)
  expect(state.preset).toBe('moons')
  const g = generate('moons', state.n, state.noise, state.seed)
  const params: TreeParams = {
    ...DEFAULT_TREE_PARAMS,
    criterion: state.criterion,
    maxDepth: state.depth,
    minSamplesSplit: state.split,
    minSamplesLeaf: state.leaf,
    minImpurityDecrease: state.mid,
    ccpAlpha: 0,
  }
  return { state, g, params, k: chooseK(g.y, 2) }
}

describe('complexity scenarios', () => {
  it('c1: unbounded tree has 30 leaves, training 100 %, CV 0.835; the curve peaks at depth 3 with 0.880', () => {
    const { state, g, params, k } = momentsOf('c1')
    expect(state.depth).toBeNull()
    expect(state.curve).toBe('maxDepth')
    const tree = fitTree(g.X, g.y, 2, params)
    expect(nLeaves(tree)).toBe(30)
    const cv = crossValidate(g.X, g.y, 2, params, k)
    expect(k).toBe(5)
    expect(cv.trainMean).toBe(1)
    expect(cv.mean).toBeCloseTo(0.835, 3)
    const depths = Array.from({ length: 20 }, (_, i) => i + 1)
    const curve = validationCurve(g.X, g.y, 2, { ...params, ccpAlpha: state.alpha }, 'maxDepth', depths, k)
    const maxCv = Math.max(...curve.map((p) => p.cvMean))
    const peak = curve.filter((p) => Math.abs(p.cvMean - maxCv) < 1e-12)
    expect(peak.map((p) => p.value)).toEqual([3])
    expect(maxCv).toBeCloseTo(0.88, 3)
    expect(maxCv).toBeGreaterThan(cv.mean)
    // below the peak the curve is lower, and training keeps rising with depth
    for (const p of curve) if (p.value !== 3) expect(p.cvMean).toBeLessThan(maxCv)
    expect(curve[19].trainMean).toBeGreaterThan(curve[2].trainMean)
  })

  it('c2: depth 3 lifts CV to 0.880 and training drops below 100 %', () => {
    const { state, g, params, k } = momentsOf('c2')
    expect(state.depth).toBe(3)
    const full = fitTree(g.X, g.y, 2, { ...params, maxDepth: null })
    const shallow = fitTree(g.X, g.y, 2, params)
    expect(nLeaves(shallow)).toBeLessThan(nLeaves(full))
    const cv = crossValidate(g.X, g.y, 2, params, k)
    expect(cv.mean).toBeCloseTo(0.88, 3)
    expect(cv.trainMean).toBeLessThan(1)
    expect(nLeaves(shallow)).toBeLessThanOrEqual(8)
    for (const depth of [2, 4]) {
      expect(crossValidate(g.X, g.y, 2, { ...params, maxDepth: depth }, k).mean, `depth ${depth}`).toBeLessThan(cv.mean)
    }
  })

  it('c3: critical alphas 0.41 and 0.55; at 0.45 two leaves and case 5 is wrong', () => {
    const { state } = complexityOf('c3')
    expect(state.preset).toBe('eight')
    expect(state.criterion).toBe('entropy')
    expect(state.alpha).toBe(0.45)
    const ds = PRESETS.eight
    const full = fitTree(ds.X, ds.y, 2, { ...DEFAULT_TREE_PARAMS, criterion: 'entropy' })
    const distinct = [...new Set(costComplexityPath(full).alphas)]
    expect(distinct).toHaveLength(3)
    expect(distinct[0]).toBe(0)
    expect(distinct[1]).toBeCloseTo(0.406, 3)
    expect(distinct[2]).toBeCloseTo(0.549, 3)
    expect(distinct.slice(1).map((a) => a.toFixed(2))).toEqual(['0.41', '0.55'])
    const pruned = pruneTree(full, state.alpha)
    expect(nLeaves(pruned)).toBe(2)
    expect(predict(pruned, ds.X[4])).toBe(1)
    expect(ds.y[4]).toBe(0)
    // the suggested alternatives keep more (0.2) or less (0.6) of the tree
    expect(nLeaves(pruneTree(full, 0.2))).toBeGreaterThan(2)
    expect(nLeaves(pruneTree(full, 0.6))).toBe(1)
    // between the critical values the tree stays the same
    expect(nLeaves(pruneTree(full, 0.41))).toBe(2)
    expect(nLeaves(pruneTree(full, 0.5))).toBe(2)
  })
})

/** The three trees of the vote example panel (ForestView), class-1 probabilities 0.51 / 0.51 / 0.01. */
const EXAMPLE_PROBAS = [
  [0.49, 0.51],
  [0.49, 0.51],
  [0.99, 0.01],
]

function forestOf(id: string) {
  const { state, problems } = parseForestQuery(scenarioById(id)!.query)
  expect(problems).toEqual([])
  expect(state.preset).toBe('moons')
  const g = generate('moons', state.n, state.noise, state.seed)
  const params: ForestParams = {
    nEstimators: state.B,
    maxFeatures: state.mf === 1 ? 1 : null,
    bootstrap: state.bootstrap,
    tree: {
      criterion: DEFAULT_TREE_PARAMS.criterion,
      maxDepth: state.depth,
      minSamplesSplit: DEFAULT_TREE_PARAMS.minSamplesSplit,
      minSamplesLeaf: state.leaf,
      minImpurityDecrease: DEFAULT_TREE_PARAMS.minImpurityDecrease,
    },
    seed: state.seed,
  }
  return { state, g, params }
}

describe('forest scenarios', () => {
  it('f1: OOB rises from 0.82 (1 tree) to 0.89 (100) and varies by at most 0.02 from B = 20', () => {
    const { state, g, params } = forestOf('f1')
    expect(state.B).toBe(100)
    expect(state.seed).toBe(1)
    expect(params.maxFeatures).toBe(1)
    expect(params.bootstrap).toBe(true)
    const forest = fitForest(g.X, g.y, 2, params)
    const curve = oobCurve(forest, g.X, g.y, [1, 20, 50, 100])
    const at = (b: number) => curve.find((p) => p.B === b)!.score as number
    expect(at(1)).toBeCloseTo(0.82, 2)
    expect(at(100)).toBeCloseTo(0.89, 2)
    const late = [at(20), at(50), at(100)]
    expect(Math.max(...late) - Math.min(...late)).toBeLessThanOrEqual(0.02)
  })

  it('f2: hard vote says 1, averaging (0.343) says 0', () => {
    expect(EXAMPLE_PROBAS.map((p) => p[1])).toEqual([0.51, 0.51, 0.01])
    const r = aggregate(EXAMPLE_PROBAS)
    expect(r.hardClass).toBe(1)
    expect(r.meanClass).toBe(0)
    expect(r.mean[1]).toBeCloseTo(0.343, 3)
    expect(scenarioById('f2')!.query).toEqual({})
  })

  it('f3: identical trees, rho = 1, forest variance equals single-tree variance, OOB unavailable', () => {
    const { state, g, params } = forestOf('f3')
    expect(state.bootstrap).toBe(false)
    expect(state.mf).toBe(2)
    expect(state.B).toBe(50)
    expect(params.maxFeatures).toBeNull()
    const b = g.bounds
    const xStar = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]
    expect(xStar).toEqual([0.5, 0.25])
    const v = measureVariance({ name: 'moons', n: state.n, noise: state.noise }, xStar, params, 40)
    expect(v.sigma2).toBeGreaterThan(0)
    expect(v.rho).not.toBeNull()
    expect(v.rho as number).toBeGreaterThanOrEqual(0.999)
    expect(Math.abs(v.varMeasured - v.sigma2)).toBeLessThanOrEqual(1e-9)
    const forest = fitForest(g.X, g.y, 2, params)
    expect(oob(forest, g.X, g.y).score).toBeNull()
    for (const tree of forest.trees) expect(tree).toEqual(forest.trees[0]) // all trees identical
    // more trees do not lower the variance of the forest
    const few = measureVariance({ name: 'moons', n: state.n, noise: state.noise }, xStar, { ...params, nEstimators: 5 }, 40)
    expect(Math.abs(few.varMeasured - v.varMeasured)).toBeLessThanOrEqual(1e-9)
    // switching on randomness (bootstrap, or one feature per split) lowers rho and the variance of the forest
    for (const change of [{ bootstrap: true }, { maxFeatures: 1 }]) {
      const m = measureVariance({ name: 'moons', n: state.n, noise: state.noise }, xStar, { ...params, ...change }, 40)
      expect(m.rho as number, JSON.stringify(change)).toBeLessThan(0.999)
      expect(m.varMeasured, JSON.stringify(change)).toBeLessThan(m.sigma2)
      expect(m.varMeasured, JSON.stringify(change)).toBeLessThan(v.varMeasured) // below the scenario's own forest variance
    }
  })
})
