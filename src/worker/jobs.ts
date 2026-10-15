/**
 * Long-running computations that run off the main thread. `runJob` is pure and synchronous: the worker calls it,
 * and the tests call it directly. Progress is `(done, total)` with `done` counting finished units (curve values,
 * trees, replicates) and ending at `total`.
 */
import { validationCurve } from '../core/cv'
import {
  fitForest,
  forestProba,
  oob,
  oobCurve,
  type ForestParams,
} from '../core/forest'
import type { Bounds, GeneratorName } from '../core/generators'
import { leafRegions, probaGrid, type Region } from '../core/regions'
import type { Tree, TreeParams } from '../core/tree'
import { measureVariance } from '../core/variance'

export type DtJob =
  | {
      kind: 'validationCurve'
      X: number[][]
      y: number[]
      nClasses: number
      base: TreeParams
      param: 'maxDepth' | 'ccpAlpha'
      values: (number | null)[]
      k: number
    }
  | {
      kind: 'forest'
      X: number[][]
      y: number[]
      nClasses: number
      params: ForestParams
      grid: { bounds: Bounds; G: number }
      /** Numbers of trees B at which the OOB accuracy is evaluated (each 1 <= B <= nEstimators). */
      oobSteps: number[]
      /** How many of the first trees get their leaf regions and bootstrap counts in `gallery`. */
      galleryCount: number
    }
  | {
      kind: 'variance'
      gen: { name: GeneratorName; n: number; noise: number }
      xStar: number[]
      params: ForestParams
      replicates: number
    }

export interface ForestResult {
  /** All fitted trees (the views need them for click-to-inspect votes). */
  trees: Tree[]
  /** Averaged class probabilities of the forest on the G x G grid (layout of `probaGrid`: row 0 = lowest y). */
  proba: Float64Array
  oobCurve: ReturnType<typeof oobCurve>
  oob: ReturnType<typeof oob>
  /** First `galleryCount` trees: leaf rectangles over the grid bounds and the bootstrap draw count per row. */
  gallery: { regions: Region[]; counts: number[] }[]
}

export interface ResultMap {
  validationCurve: ReturnType<typeof validationCurve>
  forest: ForestResult
  variance: ReturnType<typeof measureVariance>
}

export type ResultOf<J extends DtJob> = ResultMap[J['kind']]

export type ProgressFn = (done: number, total: number) => void

function runForest(job: Extract<DtJob, { kind: 'forest' }>, onProgress: ProgressFn): ForestResult {
  const { X, y, nClasses, params, grid } = job
  const B = params.nEstimators
  const forest = fitForest(X, y, nClasses, params, { onTree: (i) => onProgress(i + 1, B) })
  const proba = probaGrid((x) => forestProba(forest, x), grid.bounds, grid.G, nClasses)
  const shown = Math.max(0, Math.min(job.galleryCount, forest.trees.length))
  const gallery = forest.trees.slice(0, shown).map((tree, i) => ({
    regions: leafRegions(tree, grid.bounds),
    counts: Array.from(forest.counts[i]),
  }))
  const curve = oobCurve(forest, X, y, job.oobSteps)
  // The views always end the steps at B, so the last point already is the full-forest OOB evaluation.
  const last = curve[curve.length - 1]
  const full =
    last !== undefined && last.B === forest.trees.length
      ? { score: last.score, covered: X.length - last.uncovered, uncovered: last.uncovered }
      : oob(forest, X, y)
  return { trees: forest.trees, proba, oobCurve: curve, oob: full, gallery }
}

export function runJob<J extends DtJob>(job: J, onProgress: ProgressFn): ResultOf<J>
export function runJob(job: DtJob, onProgress: ProgressFn): ResultMap[DtJob['kind']] {
  switch (job.kind) {
    case 'validationCurve':
      return validationCurve(job.X, job.y, job.nClasses, job.base, job.param, job.values, job.k, (i) =>
        onProgress(i + 1, job.values.length),
      )
    case 'forest':
      return runForest(job, onProgress)
    case 'variance':
      return measureVariance(job.gen, job.xStar, job.params, job.replicates, (r) =>
        onProgress(r + 1, job.replicates),
      )
  }
}
