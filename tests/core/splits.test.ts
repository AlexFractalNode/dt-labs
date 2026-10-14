import { describe, expect, it } from 'vitest'
import { loadGolden } from '../helpers/golden'
import { PRESETS } from '../../src/core/presets'
import type { ClassDataset } from '../../src/core/dataset'
import { gini, impurity, misclass, type Criterion } from '../../src/core/impurity'
import { bestCandidate, candidateKey, candidates, multiwayGain } from '../../src/core/splits'
import { mdi } from '../../src/core/importance'

const golden = loadGolden('textbook')
const TOL = 12 // toBeCloseTo digits: |a - b| < 5e-13

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

function expectMatchesGolden(actual: ReturnType<typeof candidates>, expected: any[], nTotal: number) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((c, i) => {
    const e = expected[i]
    expect(c.feature).toBe(e.feature)
    expect(c.kind).toBe(e.kind)
    expect(c.value).toBe(e.value)
    expect(c.left).toEqual(e.left)
    expect(c.right).toEqual(e.right)
    expect(c.nLeft).toBe(e.left.reduce((a: number, b: number) => a + b, 0))
    expect(c.nRight).toBe(e.right.reduce((a: number, b: number) => a + b, 0))
    expect(c.childImpurity).toBeCloseTo(e.childImpurity, TOL)
    expect(c.gain).toBeCloseTo(e.gain, TOL)
    const nNode = c.nLeft + c.nRight
    expect(c.globalGain).toBeCloseTo((nNode / nTotal) * e.gain, TOL)
  })
}

describe('splits', () => {
  it('reproduces the textbook root candidates', () => {
    for (const name of ['speed', 'eight', 'weather'] as const) {
      const ds = PRESETS[name]
      for (const criterion of ['entropy', 'gini', 'misclass'] as Criterion[]) {
        const cands = candidates(ds, range(ds.y.length), criterion, ds.y.length)
        expectMatchesGolden(cands, golden[name].rootCandidates[criterion], ds.y.length)
      }
    }
  })

  it('marks the a1/a2 tie and picks a1 <= 2.5', () => {
    const ds = PRESETS.eight
    const cands = candidates(ds, range(8), 'entropy', 8)
    const best = bestCandidate(cands)!
    expect(best.feature).toBe(0)
    expect(best.value).toBe(2.5)
    expect(best.isBest).toBe(true)
    expect(cands.filter((c) => c.isBest)).toHaveLength(1)
    const tied = cands.filter((c) => c.isTie)
    expect(tied).toHaveLength(2)
    expect(tied.map((c) => [c.feature, c.value])).toEqual([
      [0, 2.5],
      [1, 2.5],
    ])
  })

  it('computes local and global gain in the right child', () => {
    const ds = PRESETS.eight
    const cands = candidates(ds, [4, 5, 6, 7], 'entropy', 8)
    expectMatchesGolden(cands, golden.eightRightChild, 8)
    const a2 = cands.find((c) => c.feature === 1 && c.value === 2.5)!
    expect(a2.gain).toBeCloseTo(0.811278, 6)
    expect(a2.globalGain).toBeCloseTo(0.405639, 6)
    expect(bestCandidate(cands)).toBe(a2)
  })

  it('emits one candidate for two categories in a node', () => {
    const ds = PRESETS.weather
    const sunny = range(ds.y.length).filter((i) => ds.X[i][0] === 0)
    const cands = candidates(ds, sunny, 'entropy', ds.y.length)
    expectMatchesGolden(cands, golden.weatherOutlookChild, ds.y.length)
    // humidity and wind each have two categories in the node: exactly one (mirror-free) candidate
    expect(cands.filter((c) => c.feature === 2)).toHaveLength(1)
    expect(cands.filter((c) => c.feature === 3)).toHaveLength(1)
    expect(cands.some((c) => c.isTie)).toBe(false)
    expect(bestCandidate(cands)!.feature).toBe(2)
  })

  it('matches exercise values', () => {
    expect(gini([6, 4])).toBeCloseTo(0.48, TOL)
    expect(misclass([6, 4])).toBeCloseTo(0.4, TOL)
    expect(impurity('gini', [6, 4])).toBeCloseTo(golden.exercises.ex3.gini, TOL)
    expect(impurity('misclass', [6, 4])).toBeCloseTo(golden.exercises.ex3.misclass, TOL)
    for (const c of ['entropy', 'gini', 'misclass'] as Criterion[]) expect(impurity(c, [0, 0])).toBe(0)

    const gain = (parent: number[], children: number[][], c: Criterion) => {
      const n = parent.reduce((a, b) => a + b, 0)
      return (
        impurity(c, parent) -
        children.reduce((s, ch) => s + (ch.reduce((a, b) => a + b, 0) / n) * impurity(c, ch), 0)
      )
    }
    const ex4 = golden.exercises.ex4
    expect(gain([5, 5], [[5, 4], [0, 1]], 'gini')).toBeCloseTo(ex4.giniA, TOL)
    expect(gain([5, 5], [[4, 1], [1, 4]], 'gini')).toBeCloseTo(ex4.giniB, TOL)
    expect(gain([5, 5], [[5, 4], [0, 1]], 'entropy')).toBeCloseTo(ex4.entropyA, TOL)
    expect(gain([5, 5], [[4, 1], [1, 4]], 'entropy')).toBeCloseTo(ex4.entropyB, TOL)
    const ex8 = [[[2, 0], [0, 2]], [[1, 1], [1, 1]], [[2, 1], [0, 1]]].map((ch) => gain([2, 2], ch, 'entropy'))
    ex8.forEach((g, i) => expect(g).toBeCloseTo(golden.exercises.ex8[i], TOL))
  })

  it('returns ID3 multiway gains', () => {
    const ds = PRESETS.weather
    const expected: (number | null)[] = golden.weather.multiwayGain.entropy
    ds.features.forEach((_, f) => {
      expect(multiwayGain(ds, range(ds.y.length), f, 'entropy')).toBeCloseTo(expected[f] as number, TOL)
    })
    expect(multiwayGain(PRESETS.eight, range(8), 0, 'entropy')).toBeNull()
    const speed = PRESETS.speed
    golden.speed.multiwayGain.entropy.forEach((g: number, f: number) => {
      expect(multiwayGain(speed, range(4), f, 'entropy')).toBeCloseTo(g, TOL)
    })
  })

  it('yields no candidate for conflicting duplicates', () => {
    const ds: ClassDataset = {
      features: [
        { name: 'u', kind: 'numeric' },
        { name: 'v', kind: 'numeric' },
      ],
      X: [
        [1, 1],
        [1, 1],
      ],
      y: [0, 1],
      classNames: ['a', 'b'],
    }
    const cands = candidates(ds, [0, 1], 'entropy', 2)
    expect(cands).toEqual([])
    expect(bestCandidate(cands)).toBeNull()
  })

  it('builds stable candidate keys', () => {
    const c = candidates(PRESETS.eight, range(8), 'entropy', 8)[0]
    expect(candidateKey(c)).toBe(`${c.feature}:${c.kind}:${c.value}`)
  })

  it('normalises MDI and returns zeros without splits', () => {
    const m = mdi(
      [
        { feature: 0, globalGain: 0.5488 },
        { feature: 1, globalGain: 0.4056 },
      ],
      2,
    )
    expect(m[0]).toBeCloseTo(0.575, 4)
    expect(m[1]).toBeCloseTo(0.425, 4)
    expect(mdi([], 3)).toEqual([0, 0, 0])
    expect(mdi([{ feature: 1, globalGain: 0 }], 2)).toEqual([0, 0])
  })
})
