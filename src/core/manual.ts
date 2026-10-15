/**
 * Manual tree of the split workshop (Spec 4.1): a tree grown from user choices (candidate keys per
 * node path). Paths are '' for the root, then 'L'/'R' appended per level; nodes come in preorder.
 * The candidate set of a node depends only on feature values, so changing the criterion keeps all
 * choices; only gains are recomputed. Split math lives in splits.ts, MDI in importance.ts.
 */
import type { ClassDataset } from './dataset'
import { DtError } from './errors'
import { mdi } from './importance'
import { impurity, type Criterion } from './impurity'
import { bestCandidate, candidateKey, candidates, goesLeft, multiwayGain, type Candidate } from './splits'

export interface ManualNode {
  /** '' root, then 'L'/'R' per level. */
  path: string
  rows: number[]
  /** Class counts in `classNames` order. */
  counts: number[]
  impurity: number
  split: Candidate | null
  candidates: Candidate[]
  /** ID3 multiway gain per feature (null for numeric features); comparison only. */
  multiway: (number | null)[]
}

/** Picks the split of a node (or null for a leaf) from its path, candidates and class counts. */
type Chooser = (path: string, cands: Candidate[], counts: number[]) => Candidate | null

function countClasses(ds: ClassDataset, rows: number[]): number[] {
  const counts = new Array<number>(ds.classNames.length).fill(0)
  for (const r of rows) counts[ds.y[r]]++
  return counts
}

function isPure(counts: number[]): boolean {
  let nonZero = 0
  for (const c of counts) if (c > 0) nonZero++
  return nonZero <= 1
}

function grow(ds: ClassDataset, criterion: Criterion, choose: Chooser): ManualNode[] {
  const nTotal = ds.y.length
  const nodes: ManualNode[] = []
  const stack: { path: string; rows: number[] }[] = [{ path: '', rows: ds.y.map((_, i) => i) }]
  while (stack.length > 0) {
    const { path, rows } = stack.pop() as { path: string; rows: number[] }
    const counts = countClasses(ds, rows)
    const cands = candidates(ds, rows, criterion, nTotal)
    const split = choose(path, cands, counts)
    nodes.push({
      path,
      rows,
      counts,
      impurity: impurity(criterion, counts),
      split,
      candidates: cands,
      multiway: ds.features.map((_, j) => multiwayGain(ds, rows, j, criterion)),
    })
    if (split !== null) {
      const left: number[] = []
      const right: number[] = []
      for (const r of rows) (goesLeft(split, ds.X[r][split.feature]) ? left : right).push(r)
      // right first, so the left subtree comes next (preorder)
      stack.push({ path: path + 'R', rows: right })
      stack.push({ path: path + 'L', rows: left })
    }
  }
  return nodes
}

function findKey(cands: Candidate[], key: string): Candidate | null {
  return cands.find((c) => candidateKey(c) === key) ?? null
}

/**
 * Grows the tree from `choices` (path -> candidate key). A node without a choice is a leaf. Choices
 * that do not exist in their node, and choices for paths that are not reached, are ignored and
 * reported in `dropped` (preorder, i.e. sorted paths).
 */
export function growManual(
  ds: ClassDataset,
  criterion: Criterion,
  choices: Record<string, string>,
): { nodes: ManualNode[]; dropped: string[] } {
  const applied = new Set<string>()
  const nodes = grow(ds, criterion, (path, cands) => {
    const key = choices[path]
    if (key === undefined) return null
    const c = findKey(cands, key)
    if (c !== null) applied.add(path)
    return c
  })
  const dropped = Object.keys(choices)
    .filter((p) => !applied.has(p))
    .sort()
  return { nodes, dropped }
}

/**
 * Greedy completion ("whole tree"): keeps the existing choices of `from` that still exist and
 * splits every other impure node with `bestCandidate` until it is pure or has no candidate.
 * Splits with gain 0 are made, like sklearn.
 */
export function autoChoices(
  ds: ClassDataset,
  criterion: Criterion,
  from: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {}
  grow(ds, criterion, (path, cands, counts) => {
    const key = from[path]
    let c = key === undefined ? null : findKey(cands, key)
    if (c === null && !isPure(counts)) c = bestCandidate(cands)
    if (c !== null) out[path] = candidateKey(c)
    return c
  })
  return out
}

/** Sets (or with `key === null` removes) the choice at `path` and removes all choices below it. */
export function setChoice(choices: Record<string, string>, path: string, key: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [p, k] of Object.entries(choices)) {
    if (p !== path && !p.startsWith(path)) out[p] = k
  }
  if (key !== null) out[path] = key
  return out
}

/** MDI of the manual tree: global gains of the applied splits per feature, normalised to 1. */
export function manualImportances(nodes: ManualNode[], nFeatures: number): number[] {
  const contribs: { feature: number; globalGain: number }[] = []
  for (const n of nodes) if (n.split !== null) contribs.push({ feature: n.split.feature, globalGain: n.split.globalGain })
  return mdi(contribs, nFeatures)
}

/** Paths of the nodes visited by the case `x` (numeric values / category codes), root first. */
export function tracePath(nodes: ManualNode[], ds: ClassDataset, x: number[]): string[] {
  if (x.length !== ds.features.length || x.some((v) => !Number.isFinite(v))) {
    throw new DtError('BAD_PARAM', { param: 'x' })
  }
  const byPath = new Map(nodes.map((n) => [n.path, n]))
  const out: string[] = []
  let node = byPath.get('')
  while (node !== undefined) {
    out.push(node.path)
    if (node.split === null) break
    node = byPath.get(node.path + (goesLeft(node.split, x[node.split.feature]) ? 'L' : 'R'))
  }
  return out
}
