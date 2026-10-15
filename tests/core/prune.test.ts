import { describe, expect, it } from 'vitest'
import { loadGolden } from '../helpers/golden'
import { oracleFrom } from '../helpers/treeCompare'
import { DtError } from '../../src/core/errors'
import { PRESETS } from '../../src/core/presets'
import { costComplexityPath, pruneTree } from '../../src/core/prune'
import { DEFAULT_TREE_PARAMS, fitTree, nLeaves, type Tree } from '../../src/core/tree'

const cases: any[] = loadGolden('cart').cases
const textbook = loadGolden('textbook')
const TOL = 1e-12

function expectAllClose(actual: number[], expected: number[], what: string): void {
  expect(actual.length, what).toBe(expected.length)
  actual.forEach((a, i) => {
    if (!(Math.abs(a - expected[i]) <= TOL)) throw new Error(`${what}[${i}]: got ${a}, expected ${expected[i]}`)
  })
}

/** Eight-case preset with root a1 <= 2.5 (the textbook tree; resolves the root tie via the oracle). */
function eightTree(): Tree {
  const ds = PRESETS.eight
  return fitTree(ds.X, ds.y, 2, { ...DEFAULT_TREE_PARAMS, criterion: 'entropy' }, {
    tieOracle: () => ({ feature: 0, threshold: 2.5 }),
  })
}

/**
 * Hand-built symmetric tree: root (8:8, gini 0.5) with two mirrored children 7:1 / 1:7 that are
 * each split into pure leaves, so both branches are equally weak.
 */
function symmetricTree(): Tree {
  const g = 1 - (49 + 1) / 64
  return {
    nClasses: 2,
    nFeatures: 1,
    childrenLeft: [1, 2, -1, -1, 5, -1, -1],
    childrenRight: [4, 3, -1, -1, 6, -1, -1],
    feature: [0, 0, -2, -2, 0, -2, -2],
    threshold: [7.5, 6.5, -2, -2, 8.5, -2, -2],
    nNodeSamples: [16, 8, 7, 1, 8, 1, 7],
    weightedNNodeSamples: [16, 8, 7, 1, 8, 1, 7],
    value: [
      [0.5, 0.5],
      [7 / 8, 1 / 8],
      [1, 0],
      [0, 1],
      [1 / 8, 7 / 8],
      [1, 0],
      [0, 1],
    ],
    impurity: [0.5, g, 0, 0, g, 0, 0],
    depth: [0, 1, 2, 2, 1, 2, 2],
  }
}

describe('cost-complexity pruning', () => {
  it('reproduces the textbook pruning sequence', () => {
    const t = eightTree()
    expect(t.feature[0]).toBe(0)
    const path = costComplexityPath(t)
    expectAllClose(path.alphas, textbook.eightCcp.alphas, 'alphas')
    expectAllClose(path.impurities, textbook.eightCcp.impurities, 'impurities')
    expect(path.leaves).toEqual([3, 2, 1])
    expect(nLeaves(pruneTree(t, 0.2))).toBe(3)
    expect(nLeaves(pruneTree(t, 0.45))).toBe(2)
    expect(nLeaves(pruneTree(t, 0.6))).toBe(1)
    expect(pruneTree(t, 0)).toBe(t)
  })

  it('renumbers the pruned tree in preorder and keeps node statistics', () => {
    const t = eightTree()
    const p = pruneTree(t, 0.45)
    expect(p.childrenLeft).toEqual([1, -1, -1])
    expect(p.childrenRight).toEqual([2, -1, -1])
    expect(p.feature).toEqual([0, -2, -2])
    expect(p.threshold).toEqual([2.5, -2, -2])
    expect(p.nNodeSamples).toEqual([8, 4, 4])
    expect(p.value[2]).toEqual(t.value[2])
    expect(p.impurity[2]).toBe(t.impurity[2])
    expect(p.depth).toEqual([0, 1, 1])
    const root = pruneTree(t, 0.6)
    expect(root.childrenLeft).toEqual([-1])
    expect(root.feature).toEqual([-2])
    expect(root.threshold).toEqual([-2])
  })

  it.each(cases.map((c) => [c.name, c]))('matches the sklearn pruning path for %s', (_name, c) => {
    const params = { ...DEFAULT_TREE_PARAMS, ...c.params, ccpAlpha: 0 }
    const opts = c.tieNodes.length > 0 ? { tieOracle: oracleFrom(c.sk) } : {}
    const tree = fitTree(c.X, c.y, c.nClasses, params, { sampleWeight: c.sampleWeight, ...opts })
    const path = costComplexityPath(tree)
    expectAllClose(path.alphas, c.sk.ccpAlphas, 'ccpAlphas')
    expectAllClose(path.impurities, c.sk.ccpImpurities, 'ccpImpurities')
    expect(path.leaves[0]).toBe(nLeaves(tree))
    expect(path.leaves[path.leaves.length - 1]).toBe(1)
  })

  it('keeps duplicate alphas like sklearn', () => {
    const t = symmetricTree()
    const path = costComplexityPath(t)
    const g = 1 - (49 + 1) / 64
    const weak = (8 * g) / 16
    expect(path.alphas).toHaveLength(4)
    expect(path.alphas[1]).toBe(weak)
    expect(path.alphas[2]).toBe(weak)
    expect(path.leaves).toEqual([4, 3, 2, 1])
    // both equally weak branches go at once when alpha reaches their common value
    expect(nLeaves(pruneTree(t, weak))).toBe(2)
    expect(nLeaves(pruneTree(t, weak * (1 - 1e-9)))).toBe(4)
  })

  it('rejects negative or non-finite alphas', () => {
    const t = eightTree()
    for (const a of [-1e-3, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        pruneTree(t, a)
        throw new Error('expected DtError')
      } catch (e) {
        expect(e).toBeInstanceOf(DtError)
        expect((e as DtError).code).toBe('BAD_PARAM')
      }
    }
  })
})
