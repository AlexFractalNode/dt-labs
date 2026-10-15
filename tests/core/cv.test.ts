import { describe, expect, it } from 'vitest'
import { loadGolden } from '../helpers/golden'
import { DtError } from '../../src/core/errors'
import { accuracy, chooseK, crossValidate, stratifiedKFold, validationCurve } from '../../src/core/cv'
import { generate } from '../../src/core/generators'
import { DEFAULT_TREE_PARAMS } from '../../src/core/tree'

const golden = loadGolden('cv')
const TOL = 1e-12

function expectAllClose(actual: number[], expected: number[], what: string): void {
  expect(actual.length, what).toBe(expected.length)
  actual.forEach((a, i) => {
    if (!(Math.abs(a - expected[i]) <= TOL)) throw new Error(`${what}[${i}]: got ${a}, expected ${expected[i]}`)
  })
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
const std = (a: number[]) => {
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length)
}

describe('stratifiedKFold', () => {
  it.each(golden.folds as { y: number[]; k: number; testFolds: number[] }[])(
    'matches StratifiedKFold test folds',
    ({ y, k, testFolds }) => {
      expect(stratifiedKFold(y, k)).toEqual(testFolds)
    },
  )

  it('rejects k below 2 or above n', () => {
    expect(() => stratifiedKFold([0, 1, 0, 1], 1)).toThrow(DtError)
    expect(() => stratifiedKFold([0, 1], 3)).toThrow(DtError)
  })
})

describe('chooseK', () => {
  it('chooses k from the smallest class', () => {
    expect(chooseK([0, 0, 0, 0, 0, 1, 1, 1], 2)).toBe(3)
    expect(chooseK(Array.from({ length: 40 }, (_, i) => i % 2), 2)).toBe(5)
    let err: unknown
    try {
      chooseK([0, 0, 0, 1], 2)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DtError)
    expect((err as DtError).code).toBe('TOO_FEW_PER_CLASS')
    expect((err as DtError).details?.cls).toBe(1)
  })
})

describe('accuracy', () => {
  it('is the fraction of matches', () => {
    expect(accuracy([0, 1, 1, 0], [0, 1, 0, 0])).toBe(0.75)
  })
})

describe('crossValidate', () => {
  it('matches cross_validate fold scores', () => {
    const c = golden.cvScore
    const r = crossValidate(c.X, c.y, 3, { ...DEFAULT_TREE_PARAMS, ...c.params }, c.k)
    expectAllClose(r.foldScores, c.foldScores, 'foldScores')
    expectAllClose(r.trainScores, c.trainScores, 'trainScores')
    expect(Math.abs(r.mean - mean(c.foldScores))).toBeLessThanOrEqual(TOL)
    expect(Math.abs(r.std - std(c.foldScores))).toBeLessThanOrEqual(TOL)
    expect(Math.abs(r.trainMean - mean(c.trainScores))).toBeLessThanOrEqual(TOL)
  })

  it('deep trees overfit moons on average', () => {
    let trainSum = 0
    let deepSum = 0
    let shallowSum = 0
    for (let s = 1; s <= 5; s++) {
      const { X, y } = generate('moons', 200, 0.3, s)
      const k = chooseK(y, 2)
      const deep = crossValidate(X, y, 2, DEFAULT_TREE_PARAMS, k)
      const shallow = crossValidate(X, y, 2, { ...DEFAULT_TREE_PARAMS, maxDepth: 4 }, k)
      trainSum += deep.trainMean
      deepSum += deep.mean
      shallowSum += shallow.mean
    }
    expect(trainSum / 5).toBe(1)
    expect(deepSum / 5).toBeLessThan(shallowSum / 5)
  })
})

describe('validationCurve', () => {
  it('matches sklearn validation_curve for depths 1-4', () => {
    const v = golden.validationCurve
    const steps: number[] = []
    const rows = validationCurve(
      v.X,
      v.y,
      3,
      { ...DEFAULT_TREE_PARAMS, ...v.base },
      'maxDepth',
      v.values,
      v.k,
      (i) => steps.push(i),
    )
    expect(rows.length).toBe(v.values.length)
    expect(steps).toEqual([0, 1, 2, 3])
    rows.forEach((r, i) => {
      expect(r.value).toBe(v.values[i])
      expect(Math.abs(r.trainMean - mean(v.train[i]))).toBeLessThanOrEqual(TOL)
      expect(Math.abs(r.cvMean - mean(v.test[i]))).toBeLessThanOrEqual(TOL)
      expect(Math.abs(r.cvStd - std(v.test[i]))).toBeLessThanOrEqual(TOL)
    })
  })

  it('sweeps ccpAlpha and treats null maxDepth as unbounded', () => {
    const { X, y } = generate('moons', 120, 0.3, 3)
    const rows = validationCurve(X, y, 2, DEFAULT_TREE_PARAMS, 'ccpAlpha', [0, 0.05], 4)
    expect(rows[0].trainMean).toBe(1)
    expect(rows[1].trainMean).toBeLessThan(1)
    const unb = validationCurve(X, y, 2, DEFAULT_TREE_PARAMS, 'maxDepth', [null], 4)
    expect(unb[0].value).toBeNull()
    expect(unb[0].trainMean).toBe(1)
  })

  it('rejects a null ccpAlpha', () => {
    const { X, y } = generate('moons', 20, 0.1, 1)
    expect(() => validationCurve(X, y, 2, DEFAULT_TREE_PARAMS, 'ccpAlpha', [null], 2)).toThrow(DtError)
  })
})
