import { describe, expect, it } from 'vitest'
import { validationCurve } from '../../src/core/cv'
import { generate } from '../../src/core/generators'
import { measureVariance } from '../../src/core/variance'
import { DEFAULT_TREE_PARAMS } from '../../src/core/tree'
import type { ForestParams } from '../../src/core/forest'
import { runJob, type DtJob } from '../../src/worker/jobs'

const data = generate('moons', 120, 0.3, 1)
const forestParams = (B: number, bootstrap = true): ForestParams => ({
  nEstimators: B,
  maxFeatures: 1,
  bootstrap,
  tree: { criterion: 'gini', maxDepth: null, minSamplesSplit: 2, minSamplesLeaf: 1, minImpurityDecrease: 0 },
  seed: 3,
})

describe('runJob', () => {
  it('runs a validation curve job and reports progress', () => {
    const values = [1, 2, 3, null]
    const job: DtJob = {
      kind: 'validationCurve',
      X: data.X,
      y: data.y,
      nClasses: 2,
      base: DEFAULT_TREE_PARAMS,
      param: 'maxDepth',
      values,
      k: 5,
    }
    const seen: [number, number][] = []
    const res = runJob(job, (done, total) => seen.push([done, total]))
    expect(res).toEqual(validationCurve(data.X, data.y, 2, DEFAULT_TREE_PARAMS, 'maxDepth', values, 5))
    expect(seen.length).toBe(values.length)
    expect(seen.every(([, t]) => t === values.length)).toBe(true)
    for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThan(seen[i - 1][0])
    expect(seen[seen.length - 1][0]).toBe(values.length)
  })

  it('returns trees in a forest job', () => {
    const B = 7
    const G = 10
    const seen: number[] = []
    const res = runJob(
      {
        kind: 'forest',
        X: data.X,
        y: data.y,
        nClasses: 2,
        params: forestParams(B),
        grid: { bounds: data.bounds, G },
        oobSteps: [1, 4, B],
        galleryCount: 3,
      },
      (done, total) => {
        expect(total).toBe(B)
        seen.push(done)
      },
    )
    expect(res.trees.length).toBe(B)
    expect(res.proba).toBeInstanceOf(Float64Array)
    expect(res.proba.length).toBe(G * G * 2)
    for (let c = 0; c < G * G; c++) expect(res.proba[2 * c] + res.proba[2 * c + 1]).toBeCloseTo(1, 12)
    expect(res.oobCurve.map((p) => p.B)).toEqual([1, 4, B])
    expect(res.oob.covered + res.oob.uncovered).toBe(data.X.length)
    // the full-forest evaluation is taken from the last curve point (no second OOB pass)
    const last = res.oobCurve[res.oobCurve.length - 1]
    expect(res.oob).toEqual({ score: last.score, covered: data.X.length - last.uncovered, uncovered: last.uncovered })
    expect(res.gallery.length).toBe(3)
    expect(res.gallery[0].counts.length).toBe(data.X.length)
    expect(res.gallery[0].regions.length).toBeGreaterThan(1)
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('caps the gallery at the number of trees and leaves the OOB score empty without bootstrap', () => {
    const res = runJob(
      {
        kind: 'forest',
        X: data.X,
        y: data.y,
        nClasses: 2,
        params: forestParams(2, false),
        grid: { bounds: data.bounds, G: 4 },
        oobSteps: [2],
        galleryCount: 12,
      },
      () => {},
    )
    expect(res.gallery.length).toBe(2)
    expect(res.oobCurve[0].score).toBeNull()
    // steps that do not end at B fall back to evaluating the whole forest
    expect(res.oob.score).toBeNull()
    expect(res.oob.uncovered).toBe(data.X.length)
  })

  it('runs a variance job like measureVariance', () => {
    const gen = { name: 'moons' as const, n: 60, noise: 0.3 }
    const p = forestParams(3)
    const seen: [number, number][] = []
    const res = runJob({ kind: 'variance', gen, xStar: [0.5, 0.25], params: p, replicates: 4 }, (d, t) =>
      seen.push([d, t]),
    )
    expect(res).toEqual(measureVariance(gen, [0.5, 0.25], p, 4))
    expect(seen).toEqual([1, 2, 3, 4].map((d) => [d, 4]))
  })
})
