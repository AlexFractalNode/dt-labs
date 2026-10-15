/**
 * Minimal cost-complexity pruning like scikit-learn 1.5.0's `_cost_complexity_prune` (Spec 3.3):
 * `r_node = w * imp / W` in exactly this order, one branch (smallest effective alpha, strict `<` in
 * preorder, so the lowest node id wins ties) collapsed per iteration, incremental updates of the
 * ancestors' branch impurities and leaf counts, one path entry per iteration.
 */
import { DtError } from './errors'
import type { Tree } from './tree'

const TREE_LEAF = -1
const TREE_UNDEFINED = -2

export interface CcpPath {
  /** Effective alpha per iteration; starts with 0 (unpruned tree), equal alphas may repeat. */
  alphas: number[]
  /** Total leaf impurity `sum w_leaf * imp_leaf / W` of the subtree after each iteration. */
  impurities: number[]
  /** Number of leaves of the subtree after each iteration. */
  leaves: number[]
}

/**
 * Runs sklearn's weakest-link loop. `stop(alpha)` is asked before each collapse (sklearn's
 * `controller.stop_pruning`); returns the path entries recorded and the final leaf mask.
 */
function weakestLink(tree: Tree, stop: (alpha: number) => boolean): { path: CcpPath; isLeaf: Uint8Array } {
  const n = tree.childrenLeft.length
  const left = tree.childrenLeft
  const right = tree.childrenRight
  const W = tree.weightedNNodeSamples[0]

  const parent = new Int32Array(n).fill(TREE_UNDEFINED)
  const isLeaf = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (left[i] === TREE_LEAF) isLeaf[i] = 1
    else {
      parent[left[i]] = i
      parent[right[i]] = i
    }
  }

  const rNode = new Float64Array(n)
  for (let i = 0; i < n; i++) rNode[i] = (tree.weightedNNodeSamples[i] * tree.impurity[i]) / W

  // sklearn pushes the leaves in index order onto a stack, so they are accumulated in reverse order
  const rBranch = new Float64Array(n)
  const nLeaves = new Int32Array(n)
  for (let leaf = n - 1; leaf >= 0; leaf--) {
    if (!isLeaf[leaf]) continue
    rBranch[leaf] = rNode[leaf]
    nLeaves[leaf] = 1
    const r = rNode[leaf]
    for (let p = parent[leaf]; p !== TREE_UNDEFINED; p = parent[p]) {
      rBranch[p] += r
      nLeaves[p] += 1
    }
  }

  const candidate = new Uint8Array(n)
  const inSubtree = new Uint8Array(n).fill(1)
  for (let i = 0; i < n; i++) candidate[i] = left[i] !== TREE_LEAF ? 1 : 0

  const path: CcpPath = { alphas: [0], impurities: [rBranch[0]], leaves: [nLeaves[0]] }
  while (candidate[0]) {
    let alpha = Number.MAX_VALUE
    let pruned = -1
    for (let i = 0; i < n; i++) {
      if (!candidate[i]) continue
      const a = (rNode[i] - rBranch[i]) / (nLeaves[i] - 1)
      if (a < alpha) {
        alpha = a
        pruned = i
      }
    }
    if (pruned < 0 || stop(alpha)) break

    // the branch's descendants leave the subtree; the branch root becomes a leaf
    const stack = [pruned]
    while (stack.length > 0) {
      const v = stack.pop() as number
      if (!inSubtree[v]) continue
      candidate[v] = 0
      isLeaf[v] = 0
      inSubtree[v] = 0
      if (left[v] !== TREE_LEAF) stack.push(left[v], right[v])
    }
    isLeaf[pruned] = 1
    inSubtree[pruned] = 1

    const nPrunedLeaves = nLeaves[pruned] - 1
    nLeaves[pruned] = 1 // sklearn stores 0 here; the node is no longer a candidate, 1 keeps `leaves` exact
    const rDiff = rNode[pruned] - rBranch[pruned]
    rBranch[pruned] = rNode[pruned]
    for (let p = parent[pruned]; p !== TREE_UNDEFINED; p = parent[p]) {
      nLeaves[p] -= nPrunedLeaves
      rBranch[p] += rDiff
    }

    path.alphas.push(alpha)
    path.impurities.push(rBranch[0])
    path.leaves.push(nLeaves[0])
  }
  return { path, isLeaf }
}

/** Minimal cost-complexity pruning path of `tree` (sklearn's `cost_complexity_pruning_path`). */
export function costComplexityPath(tree: Tree): CcpPath {
  return weakestLink(tree, () => false).path
}

/**
 * Subtree of `tree` for `ccp_alpha = alpha` like sklearn: collapses weakest links while their
 * effective alpha is `<= alpha`; the result is renumbered in preorder. `alpha === 0` returns `tree`.
 */
export function pruneTree(tree: Tree, alpha: number): Tree {
  if (!Number.isFinite(alpha) || alpha < 0) throw new DtError('BAD_PARAM', { param: 'ccpAlpha' })
  if (alpha === 0) return tree
  const { isLeaf } = weakestLink(tree, (a) => alpha < a)

  const out: Tree = {
    nClasses: tree.nClasses,
    nFeatures: tree.nFeatures,
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
  const stack: { orig: number; parent: number; isLeft: boolean }[] = [{ orig: 0, parent: -1, isLeft: false }]
  while (stack.length > 0) {
    const { orig, parent, isLeft } = stack.pop() as { orig: number; parent: number; isLeft: boolean }
    const id = out.childrenLeft.length
    if (parent >= 0) {
      if (isLeft) out.childrenLeft[parent] = id
      else out.childrenRight[parent] = id
    }
    const leaf = isLeaf[orig] === 1
    out.childrenLeft.push(TREE_LEAF)
    out.childrenRight.push(TREE_LEAF)
    out.feature.push(leaf ? TREE_UNDEFINED : tree.feature[orig])
    out.threshold.push(leaf ? TREE_UNDEFINED : tree.threshold[orig])
    out.nNodeSamples.push(tree.nNodeSamples[orig])
    out.weightedNNodeSamples.push(tree.weightedNNodeSamples[orig])
    out.value.push(tree.value[orig].slice())
    out.impurity.push(tree.impurity[orig])
    out.depth.push(tree.depth[orig])
    if (!leaf) {
      // right first, so the left subtree is numbered next (preorder)
      stack.push({ orig: tree.childrenRight[orig], parent: id, isLeft: false })
      stack.push({ orig: tree.childrenLeft[orig], parent: id, isLeft: true })
    }
  }
  return out
}
