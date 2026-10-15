/**
 * sklearn-compatible CART classifier (Spec 3.3): reproduces scikit-learn 1.5.0's
 * DecisionTreeClassifier (DepthFirstTreeBuilder + BestSplitter) `tree_` arrays.
 *
 * Arithmetic deliberately follows sklearn's evaluation order (float32 inputs, float64 sums,
 * child impurities, generic proxy `-wR*I_R - wL*I_L`), so this module does not reuse impurity.ts.
 */
import { DtError } from './errors'
import { mdi } from './importance'
import { pruneTree } from './prune'
import { createRng } from './rng'

export interface TreeParams {
  criterion: 'entropy' | 'gini'
  maxDepth: number | null
  minSamplesSplit: number
  minSamplesLeaf: number
  minImpurityDecrease: number
  ccpAlpha: number
  maxFeatures: number | null
}

export const DEFAULT_TREE_PARAMS: TreeParams = {
  criterion: 'gini',
  maxDepth: null,
  minSamplesSplit: 2,
  minSamplesLeaf: 1,
  minImpurityDecrease: 0,
  ccpAlpha: 0,
  maxFeatures: null,
}

/** Arrays like sklearn's `tree_` in preorder; leaves have `feature = threshold = -2` and children -1. */
export interface Tree {
  nClasses: number
  nFeatures: number
  childrenLeft: number[]
  childrenRight: number[]
  feature: number[]
  threshold: number[]
  nNodeSamples: number[]
  weightedNNodeSamples: number[]
  /** Weighted class proportions per node (sklearn >= 1.4). */
  value: number[][]
  impurity: number[]
  depth: number[]
}

export type TieOracle = (nodeId: number) => { feature: number; threshold: number }

export interface FitOptions {
  sampleWeight?: number[]
  seed?: number
  tieOracle?: TieOracle
}

const TREE_LEAF = -1
const TREE_UNDEFINED = -2
/** np.finfo(np.float64).eps: sklearn's slack for pure nodes and min_impurity_decrease. */
const EPSILON = 2.220446049250313e-16
/** sklearn's FEATURE_THRESHOLD (float32 1e-7). */
const FEATURE_THRESHOLD = Math.fround(1e-7)
/** Relative tolerance of the tie set in oracle mode. */
const TIE_RTOL = 1e-12

/** Gini of class sums `counts` with total weight `w`, in sklearn's evaluation order. */
function giniOf(counts: Float64Array, w: number): number {
  let sq = 0
  for (let k = 0; k < counts.length; k++) sq += counts[k] * counts[k]
  return 1 - sq / (w * w)
}

/** Entropy in bits of class sums `counts` with total weight `w`, in sklearn's evaluation order. */
function entropyOf(counts: Float64Array, w: number): number {
  let h = 0
  for (let k = 0; k < counts.length; k++) {
    const c = counts[k]
    if (c > 0) {
      const p = c / w
      h -= p * (Math.log(p) / Math.LN2)
    }
  }
  return h
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1
}

function badParam(param: string): DtError {
  return new DtError('BAD_PARAM', { param })
}

function validateParams(p: TreeParams, nFeatures: number): void {
  if (p.criterion !== 'gini' && p.criterion !== 'entropy') throw badParam('criterion')
  if (p.maxDepth !== null && !isPositiveInt(p.maxDepth)) throw badParam('maxDepth')
  if (!isPositiveInt(p.minSamplesSplit) || p.minSamplesSplit < 2) throw badParam('minSamplesSplit')
  if (!isPositiveInt(p.minSamplesLeaf)) throw badParam('minSamplesLeaf')
  if (!Number.isFinite(p.minImpurityDecrease) || p.minImpurityDecrease < 0) throw badParam('minImpurityDecrease')
  if (!Number.isFinite(p.ccpAlpha) || p.ccpAlpha < 0) throw badParam('ccpAlpha')
  if (p.maxFeatures !== null && (!isPositiveInt(p.maxFeatures) || p.maxFeatures > nFeatures)) {
    throw badParam('maxFeatures')
  }
}

interface Split {
  feature: number
  threshold: number
  proxy: number
}

interface StackRecord {
  rows: number[]
  depth: number
  parent: number
  isLeft: boolean
  impurity: number
}

/**
 * Fit a CART classifier like sklearn's DecisionTreeClassifier (Spec 3.3).
 * With `ccpAlpha > 0` the grown tree is pruned like sklearn (`pruneTree`).
 * Ties between candidates: features in index order, thresholds ascending, strict proxy comparison
 * (first wins). With `tieOracle`, nodes whose proxy maximum is attained more than once (relative
 * 1e-12) take the oracle's split if it is in that argmax set, otherwise `DtError('TIE_ORACLE')`.
 */
export function fitTree(
  X: number[][],
  y: number[],
  nClasses: number,
  params: TreeParams,
  opts: FitOptions = {},
): Tree {
  if (X.length === 0) throw new DtError('EMPTY_DATA')
  const nFeatures = X[0].length
  if (!isPositiveInt(nFeatures)) throw badParam('X')
  if (!isPositiveInt(nClasses)) throw badParam('nClasses')
  validateParams(params, nFeatures)
  if (y.length !== X.length) throw badParam('y')
  const sw = opts.sampleWeight
  if (sw !== undefined && sw.length !== X.length) throw badParam('sampleWeight')

  // float32 feature columns (sklearn casts X to float32)
  const cols: Float32Array[] = Array.from({ length: nFeatures }, () => new Float32Array(X.length))
  const rootRows: number[] = []
  const weight = new Float64Array(X.length)
  for (let i = 0; i < X.length; i++) {
    const row = X[i]
    if (row.length !== nFeatures) throw badParam('X')
    for (let j = 0; j < nFeatures; j++) {
      const v = row[j]
      if (Number.isNaN(v)) throw new DtError('MISSING_VALUES', { row: i, feature: j })
      const f = Math.fround(v)
      if (!Number.isFinite(f)) throw badParam('X')
      cols[j][i] = f
    }
    const c = y[i]
    if (!Number.isInteger(c) || c < 0 || c >= nClasses) throw badParam('y')
    const w = sw === undefined ? 1 : sw[i]
    if (!Number.isFinite(w) || w < 0) throw badParam('sampleWeight')
    weight[i] = w
    if (w > 0) rootRows.push(i) // sklearn only works with positively weighted samples
  }
  if (rootRows.length === 0) throw new DtError('EMPTY_DATA')

  const { criterion, minSamplesLeaf, minSamplesSplit, minImpurityDecrease } = params
  const maxDepth = params.maxDepth ?? Number.POSITIVE_INFINITY
  const imp = criterion === 'gini' ? giniOf : entropyOf
  const rng = createRng(opts.seed ?? 0)
  const oracle = opts.tieOracle

  const tree: Tree = {
    nClasses,
    nFeatures,
    childrenLeft: [],
    childrenRight: [],
    feature: [],
    threshold: [],
    nNodeSamples: [],
    weightedNNodeSamples: [],
    value: [],
    impurity: [],
    depth: [],
  }

  let totalWeight = 0
  for (const i of rootRows) totalWeight += weight[i]

  // scratch buffers
  const left = new Float64Array(nClasses)
  const right = new Float64Array(nClasses)
  const perm = new Array<number>(nFeatures)

  /** Class sums and total weight of `rows`, summed in row order. */
  function sums(rows: number[]): { counts: Float64Array; w: number } {
    const counts = new Float64Array(nClasses)
    let w = 0
    for (const i of rows) {
      counts[y[i]] += weight[i]
      w += weight[i]
    }
    return { counts, w }
  }

  /**
   * Best split of a node (BestSplitter). Returns null when no feature is non-constant or no position
   * leaves both children with at least `minSamplesLeaf` rows.
   */
  function bestSplit(rows: number[], total: Float64Array, wNode: number, nodeId: number): Split | null {
    const n = rows.length
    let best: Split | null = null
    const all: Split[] | null = oracle ? [] : null

    for (let j = 0; j < nFeatures; j++) perm[j] = j
    const k = params.maxFeatures ?? nFeatures
    let nonConstant = 0
    for (let i = 0; i < nFeatures && nonConstant < k; i++) {
      if (params.maxFeatures !== null) {
        // partial Fisher-Yates: draw without replacement
        const r = i + rng.int(nFeatures - i)
        const tmp = perm[i]
        perm[i] = perm[r]
        perm[r] = tmp
      }
      const f = perm[i]
      const col = cols[f]
      const sorted = rows.slice().sort((a, b) => col[a] - col[b])
      if (col[sorted[n - 1]] <= Math.fround(col[sorted[0]] + FEATURE_THRESHOLD)) continue // constant
      nonConstant++

      left.fill(0)
      let wLeft = 0
      for (let p = 1; p < n; p++) {
        const moved = sorted[p - 1]
        left[y[moved]] += weight[moved]
        wLeft += weight[moved]
        const a = col[moved]
        const b = col[sorted[p]]
        if (b <= Math.fround(a + FEATURE_THRESHOLD)) continue
        if (p < minSamplesLeaf || n - p < minSamplesLeaf) continue
        for (let c = 0; c < nClasses; c++) right[c] = total[c] - left[c]
        const wRight = wNode - wLeft
        const proxy = -wRight * imp(right, wRight) - wLeft * imp(left, wLeft)
        if (all === null && best !== null && !(proxy > best.proxy)) continue
        let t = a / 2 + b / 2
        if (t === b || t === Number.POSITIVE_INFINITY || t === Number.NEGATIVE_INFINITY) t = a
        const cand: Split = { feature: f, threshold: t, proxy }
        if (all !== null) all.push(cand)
        if (best === null || proxy > best.proxy) best = cand
      }
    }

    if (best === null || all === null || oracle === undefined) return best
    const pmax = best.proxy
    const tol = pmax === 0 ? TIE_RTOL : TIE_RTOL * Math.abs(pmax)
    const ties = all.filter((c) => Math.abs(c.proxy - pmax) <= tol)
    if (ties.length < 2) return best
    const o = oracle(nodeId)
    const hit = ties.find((c) => c.feature === o.feature && Math.abs(c.threshold - o.threshold) <= TIE_RTOL)
    if (hit === undefined) throw new DtError('TIE_ORACLE', { nodeId })
    return hit
  }

  const rootSums = sums(rootRows)
  const stack: StackRecord[] = [
    { rows: rootRows, depth: 0, parent: -1, isLeft: false, impurity: imp(rootSums.counts, rootSums.w) },
  ]

  while (stack.length > 0) {
    const rec = stack.pop() as StackRecord
    const { rows, depth, impurity } = rec
    const n = rows.length
    const { counts, w: wNode } = sums(rows)
    const nodeId = tree.childrenLeft.length

    let isLeaf = depth >= maxDepth || n < minSamplesSplit || n < 2 * minSamplesLeaf || impurity <= EPSILON
    let split: Split | null = null
    let leftRows: number[] = []
    let rightRows: number[] = []
    let impLeft = 0
    let impRight = 0
    if (!isLeaf) {
      split = bestSplit(rows, counts, wNode, nodeId)
      if (split === null) {
        isLeaf = true
      } else {
        const col = cols[split.feature]
        for (const i of rows) (col[i] <= split.threshold ? leftRows : rightRows).push(i)
        // children impurities as sklearn: sum_right = sum_total - sum_left, w_right = w - w_left
        left.fill(0)
        let wLeft = 0
        for (const i of leftRows) {
          left[y[i]] += weight[i]
          wLeft += weight[i]
        }
        for (let c = 0; c < nClasses; c++) right[c] = counts[c] - left[c]
        const wRight = wNode - wLeft
        impLeft = imp(left, wLeft)
        impRight = imp(right, wRight)
        const improvement =
          (wNode / totalWeight) * (impurity - (wRight / wNode) * impRight - (wLeft / wNode) * impLeft)
        if (improvement + EPSILON < minImpurityDecrease) isLeaf = true
      }
    }

    if (rec.parent >= 0) {
      if (rec.isLeft) tree.childrenLeft[rec.parent] = nodeId
      else tree.childrenRight[rec.parent] = nodeId
    }
    tree.childrenLeft.push(TREE_LEAF)
    tree.childrenRight.push(TREE_LEAF)
    tree.feature.push(isLeaf ? TREE_UNDEFINED : (split as Split).feature)
    tree.threshold.push(isLeaf ? TREE_UNDEFINED : (split as Split).threshold)
    tree.nNodeSamples.push(n)
    tree.weightedNNodeSamples.push(wNode)
    tree.value.push(Array.from(counts, (c) => c / wNode))
    tree.impurity.push(impurity)
    tree.depth.push(depth)

    if (!isLeaf) {
      // right first, so the left subtree is numbered next (preorder)
      stack.push({ rows: rightRows, depth: depth + 1, parent: nodeId, isLeft: false, impurity: impRight })
      stack.push({ rows: leftRows, depth: depth + 1, parent: nodeId, isLeft: true, impurity: impLeft })
    }
  }
  // sklearn prunes the fully grown tree afterwards (`_prune_tree`); ccpAlpha 0 keeps it unchanged
  return pruneTree(tree, params.ccpAlpha)
}

/** Leaf index reached by `x`; features are cast to float32 like sklearn's `apply`. */
export function applyLeaf(tree: Tree, x: number[]): number {
  if (x.length !== tree.nFeatures) throw badParam('x')
  let node = 0
  while (tree.childrenLeft[node] !== TREE_LEAF) {
    node =
      Math.fround(x[tree.feature[node]]) <= tree.threshold[node] ? tree.childrenLeft[node] : tree.childrenRight[node]
  }
  return node
}

/** Class probabilities: leaf value normalised to sum 1 (sklearn's predict_proba). */
export function predictProba(tree: Tree, x: number[]): number[] {
  const v = tree.value[applyLeaf(tree, x)]
  let s = 0
  for (const p of v) s += p
  const norm = s === 0 ? 1 : s
  return v.map((p) => p / norm)
}

/** Most probable class; on equal probabilities the smallest class code. */
export function predict(tree: Tree, x: number[]): number {
  const p = predictProba(tree, x)
  let best = 0
  for (let c = 1; c < p.length; c++) if (p[c] > p[best]) best = c
  return best
}

/** MDI like sklearn's `feature_importances_`: weighted impurity decreases per feature, normalised to 1. */
export function featureImportances(tree: Tree): number[] {
  const W = tree.weightedNNodeSamples[0]
  const contribs: { feature: number; globalGain: number }[] = []
  for (let t = 0; t < tree.childrenLeft.length; t++) {
    const l = tree.childrenLeft[t]
    if (l === TREE_LEAF) continue
    const r = tree.childrenRight[t]
    const decrease =
      tree.weightedNNodeSamples[t] * tree.impurity[t] -
      tree.weightedNNodeSamples[l] * tree.impurity[l] -
      tree.weightedNNodeSamples[r] * tree.impurity[r]
    contribs.push({ feature: tree.feature[t], globalGain: decrease / W })
  }
  return mdi(contribs, tree.nFeatures)
}

export function nLeaves(tree: Tree): number {
  let n = 0
  for (const l of tree.childrenLeft) if (l === TREE_LEAF) n++
  return n
}

export function maxDepthOf(tree: Tree): number {
  let d = 0
  for (const v of tree.depth) if (v > d) d = v
  return d
}
