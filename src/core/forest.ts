/**
 * Random forest on top of the sklearn-compatible CART core (Spec 3.5).
 *
 * Tree i draws its bootstrap counts from its own mulberry32 stream seeded with `p.seed * 7919 + i`
 * (n draws of `rng.int(n)` with replacement) and is fitted with the same seed, which drives the
 * `maxFeatures` feature draws inside `fitTree`. Bootstrap counts enter the tree as sample weights,
 * exactly as sklearn's RandomForestClassifier does (rows drawn 0 times are left out of that tree).
 * Golden tests can pass the counts (and tie oracles) exported from sklearn instead.
 */
import { DtError } from './errors'
import { createRng } from './rng'
import { fitTree, predictProba, type TieOracle, type Tree, type TreeParams } from './tree'

export interface ForestParams {
  nEstimators: number
  maxFeatures: number | null
  bootstrap: boolean
  tree: Omit<TreeParams, 'maxFeatures' | 'ccpAlpha'>
  seed: number
}

export interface Forest {
  trees: Tree[]
  /** Per tree: how often each training row was drawn (all 1 without bootstrap). */
  counts: Uint16Array[]
}

export interface ForestFitOptions {
  bootstrapCounts?: number[][]
  tieOracles?: TieOracle[]
  onTree?: (i: number) => void
}

/** Seed multiplier between forest seed and per-tree seed (`p.seed * 7919 + i`). */
const TREE_SEED_STRIDE = 7919

function badParam(param: string): DtError {
  return new DtError('BAD_PARAM', { param })
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1
}

/** Seed of tree `i` for both its bootstrap draw and its `maxFeatures` draws. */
export function treeSeed(seed: number, i: number): number {
  return seed * TREE_SEED_STRIDE + i
}

/** Bootstrap counts of one tree: n draws with replacement from its own RNG stream. */
function drawCounts(n: number, seed: number): Uint16Array {
  const rng = createRng(seed)
  const counts = new Uint16Array(n)
  for (let k = 0; k < n; k++) counts[rng.int(n)]++
  return counts
}

function toCounts(raw: number[], n: number): Uint16Array {
  if (!Array.isArray(raw) || raw.length !== n) throw badParam('bootstrapCounts')
  const out = new Uint16Array(n)
  for (let k = 0; k < n; k++) {
    const v = raw[k]
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw badParam('bootstrapCounts')
    out[k] = v
  }
  return out
}

/** Fit `p.nEstimators` CART trees on bootstrap samples (or on all rows without bootstrap). */
export function fitForest(
  X: number[][],
  y: number[],
  nClasses: number,
  p: ForestParams,
  opts: ForestFitOptions = {},
): Forest {
  const n = X.length
  if (n === 0) throw new DtError('EMPTY_DATA')
  if (y.length !== n) throw badParam('y')
  if (!isPositiveInt(p.nEstimators)) throw badParam('nEstimators')
  if (typeof p.bootstrap !== 'boolean') throw badParam('bootstrap')
  if (!Number.isInteger(p.seed)) throw badParam('seed')
  if (n > 0xffff) throw badParam('X') // counts are stored as Uint16
  const { bootstrapCounts, tieOracles, onTree } = opts
  if (bootstrapCounts !== undefined) {
    if (!p.bootstrap) throw badParam('bootstrapCounts')
    if (bootstrapCounts.length !== p.nEstimators) throw badParam('bootstrapCounts')
  }
  if (tieOracles !== undefined && tieOracles.length !== p.nEstimators) throw badParam('tieOracles')

  const treeParams: TreeParams = { ...p.tree, maxFeatures: p.maxFeatures, ccpAlpha: 0 }
  const trees: Tree[] = []
  const counts: Uint16Array[] = []
  for (let i = 0; i < p.nEstimators; i++) {
    const seed = treeSeed(p.seed, i)
    let c: Uint16Array
    if (bootstrapCounts !== undefined) c = toCounts(bootstrapCounts[i], n)
    else if (p.bootstrap) c = drawCounts(n, seed)
    else c = new Uint16Array(n).fill(1)
    trees.push(
      fitTree(X, y, nClasses, treeParams, { sampleWeight: Array.from(c), seed, tieOracle: tieOracles?.[i] }),
    )
    counts.push(c)
    onTree?.(i)
  }
  return { trees, counts }
}

/** Index of the largest entry; on equal values the smallest index (smallest class code). */
function argmaxFirst(v: ArrayLike<number>): number {
  let best = 0
  for (let c = 1; c < v.length; c++) if (v[c] > v[best]) best = c
  return best
}

/**
 * The single place of the ensemble rules (Spec 3.5): `mean` = average of the tree probabilities
 * (sklearn's predict_proba), `meanClass` = its argmax, `hardClass` = majority of the trees' own
 * argmax classes. All ties go to the smallest class code.
 */
export function aggregate(treeProbas: number[][]): { mean: number[]; meanClass: number; hardClass: number } {
  const B = treeProbas.length
  if (B === 0) throw badParam('treeProbas')
  const k = treeProbas[0].length
  if (k === 0) throw badParam('treeProbas')
  const sum = new Array<number>(k).fill(0)
  const votes = new Array<number>(k).fill(0)
  for (const p of treeProbas) {
    if (p.length !== k) throw badParam('treeProbas')
    for (let c = 0; c < k; c++) sum[c] += p[c]
    votes[argmaxFirst(p)]++
  }
  const mean = sum.map((s) => s / B)
  return { mean, meanClass: argmaxFirst(mean), hardClass: argmaxFirst(votes) }
}

/** Class probabilities of every tree at `x`, in tree order. */
export function treeProbas(f: Forest, x: number[]): number[][] {
  return f.trees.map((t) => predictProba(t, x))
}

/** Averaged tree probabilities (sklearn's RandomForestClassifier.predict_proba). */
export function forestProba(f: Forest, x: number[]): number[] {
  return aggregate(treeProbas(f, x)).mean
}

/** Majority vote of the tree classes (ties → smallest class code). */
export function hardVote(f: Forest, x: number[]): number {
  return aggregate(treeProbas(f, x)).hardClass
}

function checkData(f: Forest, X: number[][], y: number[]): void {
  if (f.trees.length === 0 || f.counts.length !== f.trees.length) throw badParam('forest')
  if (X.length === 0 || y.length !== X.length) throw badParam('y')
  for (const c of f.counts) if (c.length !== X.length) throw badParam('X')
}

/**
 * OOB accuracy after each requested number of trees B (the first B trees). Per row the
 * probabilities of the trees that did not draw it are averaged (via `aggregate`); the score is
 * taken over covered rows only and `uncovered` counts rows no tree left out. Score null if no row
 * is covered (always so without bootstrap, where every count is 1).
 */
export function oobCurve(
  f: Forest,
  X: number[][],
  y: number[],
  steps: number[],
): { B: number; score: number | null; uncovered: number }[] {
  checkData(f, X, y)
  const nTrees = f.trees.length
  for (const s of steps) if (!Number.isInteger(s) || s < 1 || s > nTrees) throw badParam('steps')
  const maxB = steps.reduce((m, s) => Math.max(m, s), 0)
  const n = X.length
  // per row: OOB tree probabilities in tree order
  const perRow: number[][][] = Array.from({ length: n }, () => [])
  const byB = new Map<number, { score: number | null; uncovered: number }>()
  const wanted = new Set(steps)
  for (let b = 1; b <= maxB; b++) {
    const tree = f.trees[b - 1]
    const c = f.counts[b - 1]
    for (let r = 0; r < n; r++) if (c[r] === 0) perRow[r].push(predictProba(tree, X[r]))
    if (!wanted.has(b)) continue
    let covered = 0
    let hits = 0
    for (let r = 0; r < n; r++) {
      if (perRow[r].length === 0) continue
      covered++
      if (aggregate(perRow[r]).meanClass === y[r]) hits++
    }
    byB.set(b, { score: covered === 0 ? null : hits / covered, uncovered: n - covered })
  }
  return steps.map((B) => ({ B, ...(byB.get(B) as { score: number | null; uncovered: number }) }))
}

/** OOB accuracy of the whole forest over covered rows, with covered/uncovered row counts. */
export function oob(f: Forest, X: number[][], y: number[]): { score: number | null; covered: number; uncovered: number } {
  const [{ score, uncovered }] = oobCurve(f, X, y, [f.trees.length])
  return { score, covered: X.length - uncovered, uncovered }
}
