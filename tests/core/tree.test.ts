import { describe, expect, it } from 'vitest'
import { loadGolden } from '../helpers/golden'
import { expectTreeEquals, oracleFrom } from '../helpers/treeCompare'
import { DtError } from '../../src/core/errors'
import {
  DEFAULT_TREE_PARAMS,
  applyLeaf,
  featureImportances,
  fitTree,
  maxDepthOf,
  nLeaves,
  predict,
  predictProba,
  type FitOptions,
  type Tree,
  type TreeParams,
} from '../../src/core/tree'

const cases: any[] = loadGolden('cart').cases
const TOL = 1e-12

function byName(name: string): any {
  const c = cases.find((k) => k.name === name)
  if (!c) throw new Error(`golden case ${name} missing`)
  return c
}

function paramsOf(c: any): TreeParams {
  return { ...DEFAULT_TREE_PARAMS, ...c.params }
}

function fitCase(c: any, extra: FitOptions = {}): Tree {
  return fitTree(c.X, c.y, c.nClasses, paramsOf(c), { sampleWeight: c.sampleWeight, ...extra })
}

function expectAllClose(actual: number[], expected: number[], what: string): void {
  expect(actual.length, what).toBe(expected.length)
  actual.forEach((a, i) => {
    if (!(Math.abs(a - expected[i]) <= TOL)) throw new Error(`${what}[${i}]: got ${a}, expected ${expected[i]}`)
  })
}

function expectDtError(fn: () => unknown, code: string): DtError {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(DtError)
    expect((e as DtError).code).toBe(code)
    return e as DtError
  }
  throw new Error(`expected DtError ${code}`)
}

describe('fitTree (sklearn-compatible)', () => {
  it.each(cases.filter((c) => c.tieNodes.length === 0).map((c) => [c.name, c]))(
    'matches sklearn for %s',
    (_name, c) => {
      const tree = fitCase(c)
      expectTreeEquals(tree, c.sk)
      expectAllClose(featureImportances(tree), c.sk.importances, 'importances')
      c.sk.grid.forEach((x: number[], i: number) => expectAllClose(predictProba(tree, x), c.sk.gridProba[i], `proba@${i}`))
    },
  )

  it.each(cases.filter((c) => c.tieNodes.length > 0).map((c) => [c.name, c]))(
    'matches sklearn with the tie oracle for %s',
    (_name, c) => {
      const oracle = oracleFrom(c.sk)
      const asked: number[] = []
      const tree = fitCase(c, {
        tieOracle: (nodeId) => {
          asked.push(nodeId)
          return oracle(nodeId)
        },
      })
      expect(asked.sort((a, b) => a - b)).toEqual([...c.tieNodes].sort((a: number, b: number) => a - b))
      expectTreeEquals(tree, c.sk)
      expectAllClose(featureImportances(tree), c.sk.importances, 'importances')
    },
  )

  it('documents the eight-case tie without oracle', () => {
    const c = byName('eight_rs1')
    const tree = fitCase(c)
    expect(tree.feature[0]).toBe(0)
    expect(c.sk.feature[0]).toBe(1)
    expect(nLeaves(tree)).toBe(3)
    expect(c.sk.childrenLeft.filter((l: number) => l === -1)).toHaveLength(3)
    expect(Math.abs(tree.impurity[0] - c.sk.impurity[0])).toBeLessThanOrEqual(TOL)
    const kids = (t: { childrenLeft: number[]; childrenRight: number[]; impurity: number[] }) =>
      [t.impurity[t.childrenLeft[0]], t.impurity[t.childrenRight[0]]].sort((a, b) => a - b)
    expectAllClose(kids(tree), kids(c.sk), 'root children impurities')
  })

  it('splits XOR at zero gain', () => {
    const tree = fitCase(byName('xor4'))
    expect(tree.childrenLeft).toHaveLength(7)
    expect(nLeaves(tree)).toBe(4)
    expect(maxDepthOf(tree)).toBe(2)
  })

  it('reproduces sklearn on conflicting duplicates and terminates', () => {
    const c = byName('dup_conflict')
    const tree = fitCase(c)
    expectTreeEquals(tree, c.sk)
  })

  it('honours sample weights and drops zero-weight rows', () => {
    const c = byName('circles_weighted')
    expect(c.sampleWeight.some((w: number) => w === 0)).toBe(true)
    const tree = fitCase(c)
    expectTreeEquals(tree, c.sk)
    const nPositive = c.sampleWeight.filter((w: number) => w > 0).length
    expect(tree.nNodeSamples[0]).toBe(nPositive)
    expect(tree.weightedNNodeSamples[0]).toBe(c.sampleWeight.reduce((a: number, b: number) => a + b, 0))
  })

  it('uses float32 midpoints and float32 feature threshold', () => {
    const tree = fitTree([[0.1], [0.2], [0.30000001]], [0, 1, 1], 2, DEFAULT_TREE_PARAMS)
    expect(tree.threshold[0]).toBe(0.15000000223517418)
    const eps = byName('float32_eps')
    const leaf = fitCase(eps)
    expect(leaf.childrenLeft).toEqual([-1])
    expectTreeEquals(leaf, eps.sk)
  })

  it('casts inputs to float32 in applyLeaf', () => {
    const tree = fitTree([[0.1], [0.2], [0.30000001]], [0, 1, 1], 2, DEFAULT_TREE_PARAMS)
    const t = tree.threshold[0]
    expect(t).toBe(0.15000000223517418)
    const x = 0.150000002
    expect(x <= t).toBe(true) // float64 would go left ...
    expect(Math.fround(x)).toBe(0.15000000596046448) // ... but float32 lies above the threshold
    expect(applyLeaf(tree, [x])).toBe(tree.childrenRight[0])
    expect(predict(tree, [x])).toBe(1)
    expect(predict(tree, [0.1])).toBe(0)
  })

  it('rejects an oracle split outside the argmax set', () => {
    const c = byName('eight_rs1')
    const err = expectDtError(() => fitCase(c, { tieOracle: () => ({ feature: 0, threshold: 1.5 }) }), 'TIE_ORACLE')
    expect(err.details).toEqual({ nodeId: 0 })
  })

  it('is deterministic for maxFeatures with a fixed seed', () => {
    const c = byName('moons_default')
    const p = { ...paramsOf(c), maxFeatures: 1 }
    const a = fitTree(c.X, c.y, c.nClasses, p, { seed: 5 })
    const b = fitTree(c.X, c.y, c.nClasses, p, { seed: 5 })
    expect(a).toEqual(b)
    const keys = new Set<string>()
    for (let s = 0; s < 10; s++) {
      const t = fitTree(c.X, c.y, c.nClasses, p, { seed: s })
      keys.add(JSON.stringify([t.feature, t.threshold]))
    }
    expect(keys.size).toBeGreaterThanOrEqual(2)
  })

  it('predicts the smallest class code on equal probabilities', () => {
    const tree = fitTree([[0], [0]], [1, 0], 2, DEFAULT_TREE_PARAMS)
    expect(predictProba(tree, [0])).toEqual([0.5, 0.5])
    expect(predict(tree, [0])).toBe(0)
    expect(featureImportances(tree)).toEqual([0])
  })

  it('prunes with ccpAlpha > 0 like sklearn', () => {
    const c = byName('moons_ccp002')
    expect(c.params.ccpAlpha).toBe(0.02)
    const pruned = fitCase(c)
    const full = fitCase({ ...c, params: { ...c.params, ccpAlpha: 0 } })
    expect(nLeaves(pruned)).toBeLessThan(nLeaves(full))
    expectTreeEquals(pruned, c.sk)
  })

  it('rejects bad parameters', () => {
    const X = [[0], [1]]
    const y = [0, 1]
    expectDtError(() => fitTree(X, y, 2, { ...DEFAULT_TREE_PARAMS, minSamplesLeaf: 0 }), 'BAD_PARAM')
    expectDtError(() => fitTree(X, y, 2, { ...DEFAULT_TREE_PARAMS, minSamplesSplit: 1 }), 'BAD_PARAM')
    expectDtError(() => fitTree(X, y, 2, { ...DEFAULT_TREE_PARAMS, maxDepth: 0 }), 'BAD_PARAM')
    expectDtError(() => fitTree(X, y, 2, { ...DEFAULT_TREE_PARAMS, maxFeatures: 2 }), 'BAD_PARAM')
    expectDtError(() => fitTree(X, y, 2, { ...DEFAULT_TREE_PARAMS, ccpAlpha: -0.1 }), 'BAD_PARAM')
    expectDtError(() => fitTree(X, y, 2, { ...DEFAULT_TREE_PARAMS, ccpAlpha: Number.NaN }), 'BAD_PARAM')
    expectDtError(() => fitTree(X, [0, 2], 2, DEFAULT_TREE_PARAMS), 'BAD_PARAM')
    expectDtError(() => fitTree(X, y, 2, DEFAULT_TREE_PARAMS, { sampleWeight: [1, -1] }), 'BAD_PARAM')
    expectDtError(() => fitTree([], [], 2, DEFAULT_TREE_PARAMS), 'EMPTY_DATA')
    expectDtError(() => fitTree(X, y, 2, DEFAULT_TREE_PARAMS, { sampleWeight: [0, 0] }), 'EMPTY_DATA')
  })
})
