import { describe, expect, it } from 'vitest'
import { loadGolden } from '../helpers/golden'
import { PRESETS } from '../../src/core/presets'
import { rowsToDataset, type ClassDataset } from '../../src/core/dataset'
import { DtError } from '../../src/core/errors'
import { candidateKey } from '../../src/core/splits'
import { DEFAULT_TREE_PARAMS, fitTree } from '../../src/core/tree'
import { autoChoices, growManual, manualImportances, setChoice, tracePath } from '../../src/core/manual'

const textbook = loadGolden('textbook')
const eight = PRESETS.eight

function editEight(row: number, col: number, value: string): ClassDataset {
  const header = ['a1', 'a2', 'class']
  const rows = eight.X.map((x, i) => [String(x[0]), String(x[1]), eight.classNames[eight.y[i]]])
  rows[row][col] = value
  return rowsToDataset(header, rows, 'class')
}

describe('manual workshop tree', () => {
  it('builds the textbook eight-case tree with autoChoices', () => {
    const choices = autoChoices(eight, 'entropy')
    const { nodes, dropped } = growManual(eight, 'entropy', choices)
    expect(dropped).toEqual([])
    const splits = nodes
      .filter((n) => n.split !== null)
      .map((n) => ({ path: n.path, feature: n.split!.feature, threshold: n.split!.value }))
    expect(splits).toEqual(textbook.eightTree.splits)
    expect(nodes.map((n) => n.path)).toEqual(['', 'L', 'R', 'RL', 'RR'])
    const imp = manualImportances(nodes, 2)
    expect(imp[0]).toBeCloseTo(0.575, 4)
    expect(imp[1]).toBeCloseTo(0.425, 4)
    imp.forEach((v, i) => expect(Math.abs(v - textbook.eightImportances[i])).toBeLessThanOrEqual(1e-12))
    expect(tracePath(nodes, eight, [3, 2])).toEqual(['', 'R', 'RL'])
    expect(tracePath(nodes, eight, [4, 4])).toEqual(['', 'R', 'RR'])
    expect(tracePath(nodes, eight, [1, 9])).toEqual(['', 'L'])
  })

  it('fills node statistics, candidates and multiway gains', () => {
    const { nodes } = growManual(eight, 'entropy', autoChoices(eight, 'entropy'))
    const root = nodes[0]
    expect(root.rows).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(root.counts).toEqual([5, 3])
    expect(root.impurity).toBeCloseTo(0.9544340029249649, 12)
    expect(root.candidates.length).toBeGreaterThan(0)
    expect(root.multiway).toEqual([null, null])
    expect(nodes[1].split).toBeNull()
    expect(nodes[1].counts).toEqual([4, 0])
    const weather = PRESETS.weather
    const w = growManual(weather, 'entropy', {}).nodes
    expect(w).toHaveLength(1)
    expect(w[0].multiway).toHaveLength(4)
    expect(w[0].multiway.every((g) => typeof g === 'number')).toBe(true)
  })

  it('agrees with fitTree on the numeric eight preset', () => {
    const { nodes } = growManual(eight, 'entropy', autoChoices(eight, 'entropy'))
    const tree = fitTree(eight.X, eight.y, 2, { ...DEFAULT_TREE_PARAMS, criterion: 'entropy' })
    expect(nodes).toHaveLength(tree.childrenLeft.length)
    nodes.forEach((n, i) => {
      expect(n.split === null ? -2 : n.split.feature).toBe(tree.feature[i])
      expect(n.split === null ? -2 : n.split.value).toBe(tree.threshold[i])
      expect(n.counts).toEqual(tree.value[i].map((p) => Math.round(p * tree.nNodeSamples[i])))
    })
  })

  it('applies a user-chosen non-best split', () => {
    const { nodes, dropped } = growManual(eight, 'entropy', { '': '1:threshold:1.5' })
    expect(dropped).toEqual([])
    const root = nodes[0]
    expect(root.split).not.toBeNull()
    expect(root.split!.isBest).toBe(false)
    expect(root.split!.gain).toBeCloseTo(0.0924, 4)
    expect(nodes.map((n) => n.path)).toEqual(['', 'L', 'R'])
    expect(nodes[1].counts).toEqual([1, 0])
    expect(nodes[2].counts).toEqual([4, 3])
  })

  it('drops descendant choices when an ancestor changes', () => {
    const choices = autoChoices(eight, 'entropy')
    expect(choices).toEqual({ '': '0:threshold:2.5', R: '1:threshold:2.5' })
    const changed = setChoice(choices, '', '1:threshold:2.5')
    expect(changed).toEqual({ '': '1:threshold:2.5' })
    expect(Object.keys(changed).some((p) => p.startsWith('R'))).toBe(false)
    expect(choices).toEqual({ '': '0:threshold:2.5', R: '1:threshold:2.5' }) // not mutated
    expect(setChoice(choices, 'R', null)).toEqual({ '': '0:threshold:2.5' })
    expect(setChoice({ '': 'a', L: 'b', LR: 'c', R: 'd' }, 'L', null)).toEqual({ '': 'a', R: 'd' })
  })

  it('keeps all choices when the criterion changes', () => {
    const choices = autoChoices(eight, 'entropy')
    for (const criterion of ['gini', 'misclass'] as const) {
      const { nodes, dropped } = growManual(eight, criterion, choices)
      expect(dropped).toEqual([])
      expect(nodes.filter((n) => n.split).map((n) => [n.path, candidateKey(n.split!)])).toEqual([
        ['', '0:threshold:2.5'],
        ['R', '1:threshold:2.5'],
      ])
    }
  })

  it('reports choices that disappear after editing the table', () => {
    const choices = autoChoices(eight, 'entropy')
    const edited = editEight(4, 1, '3') // case 5: a2 2 -> 3
    const { nodes, dropped } = growManual(edited, 'entropy', choices)
    expect(dropped).toEqual(['R'])
    expect(nodes.map((n) => n.path)).toEqual(['', 'L', 'R'])
    expect(candidateKey(nodes[0].split!)).toBe('0:threshold:2.5')
    expect(nodes[2].split).toBeNull()
  })

  it('reports orphaned and malformed choice paths as dropped', () => {
    const { dropped } = growManual(eight, 'entropy', { '': '0:threshold:2.5', LR: '1:threshold:2.5', X: 'y' })
    expect(dropped).toEqual(['LR', 'X'])
  })

  it('splits at zero gain like sklearn and stops at pure nodes', () => {
    const xor = rowsToDataset(
      ['x1', 'x2', 'c'],
      [
        ['0', '0', 'a'],
        ['0', '1', 'b'],
        ['1', '0', 'b'],
        ['1', '1', 'a'],
      ],
      'c',
    )
    const choices = autoChoices(xor, 'gini')
    const { nodes } = growManual(xor, 'gini', choices)
    expect(nodes[0].split!.gain).toBe(0)
    expect(nodes).toHaveLength(7)
    expect(nodes.filter((n) => n.split === null).every((n) => n.counts.filter((c) => c > 0).length === 1)).toBe(true)
  })

  it('completes a partial manual tree with autoChoices', () => {
    const choices = autoChoices(eight, 'entropy', { '': '1:threshold:1.5' })
    expect(choices['']).toBe('1:threshold:1.5')
    const { nodes, dropped } = growManual(eight, 'entropy', choices)
    expect(dropped).toEqual([])
    expect(nodes.filter((n) => n.split === null).every((n) => n.counts.filter((c) => c > 0).length === 1 || n.candidates.length === 0)).toBe(true)
  })

  it('leaves a mixed leaf without candidates', () => {
    const dup = rowsToDataset(
      ['x', 'c'],
      [
        ['1', 'a'],
        ['1', 'b'],
      ],
      'c',
    )
    expect(autoChoices(dup, 'gini')).toEqual({})
    const { nodes } = growManual(dup, 'gini', {})
    expect(nodes).toHaveLength(1)
    expect(nodes[0].candidates.length).toBe(0)
    expect(nodes[0].counts).toEqual([1, 1])
    expect(manualImportances(nodes, 1)).toEqual([0])
  })

  it('rejects a feature vector of the wrong length', () => {
    const { nodes } = growManual(eight, 'entropy', {})
    try {
      tracePath(nodes, eight, [1])
      throw new Error('expected DtError')
    } catch (e) {
      expect(e).toBeInstanceOf(DtError)
      expect((e as DtError).code).toBe('BAD_PARAM')
    }
  })
})
