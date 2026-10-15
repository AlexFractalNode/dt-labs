/** Decision regions of a 2-feature tree (feature 0 = x, feature 1 = y) for the 2-D teaching plots. */
import { DtError } from './errors'
import type { Bounds } from './generators'
import type { Tree } from './tree'

export type { Bounds }

export interface Region {
  x0: number
  x1: number
  y0: number
  y1: number
  proba: number[]
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Leaf rectangles of `tree` inside `b` in preorder (left subtree first). An internal node splits its
 * box at `threshold` (left = value <= threshold, i.e. lower side); thresholds outside the box are
 * clamped, which can yield zero-width boxes, so the areas always sum to the area of `b`.
 * `proba` is the leaf's normalised class distribution (as `predictProba`).
 */
export function leafRegions(tree: Tree, b: Bounds): Region[] {
  if (tree.nFeatures < 2) throw new DtError('BAD_PARAM', { param: 'tree' })
  const out: Region[] = []
  const stack: { node: number; box: Bounds }[] = [{ node: 0, box: b }]
  while (stack.length > 0) {
    const { node, box } = stack.pop()!
    const left = tree.childrenLeft[node]
    if (left === -1) {
      const v = tree.value[node]
      let s = 0
      for (const p of v) s += p
      const norm = s === 0 ? 1 : s
      out.push({ ...box, proba: v.map((p) => p / norm) })
      continue
    }
    const f = tree.feature[node]
    if (f !== 0 && f !== 1) throw new DtError('BAD_PARAM', { param: 'feature' })
    const t = tree.threshold[node]
    // push right first so the left subtree is emitted first
    if (f === 0) {
      const m = clamp(t, box.x0, box.x1)
      stack.push({ node: tree.childrenRight[node], box: { ...box, x0: m } })
      stack.push({ node: left, box: { ...box, x1: m } })
    } else {
      const m = clamp(t, box.y0, box.y1)
      stack.push({ node: tree.childrenRight[node], box: { ...box, y0: m } })
      stack.push({ node: left, box: { ...box, y1: m } })
    }
  }
  return out
}

/**
 * Class probabilities on a G x G grid of cell centres. Row-major: cell (row r, column c) starts at
 * `(r * G + c) * nClasses`; row 0 is the lowest y (starting at b.y0), column 0 the lowest x.
 */
export function probaGrid(
  probaAt: (x: number[]) => number[],
  b: Bounds,
  G: number,
  nClasses: number,
): Float64Array {
  if (!Number.isInteger(G) || G < 1) throw new DtError('BAD_PARAM', { param: 'G' })
  const out = new Float64Array(G * G * nClasses)
  const dx = (b.x1 - b.x0) / G
  const dy = (b.y1 - b.y0) / G
  for (let r = 0; r < G; r++) {
    const y = b.y0 + (r + 0.5) * dy
    for (let c = 0; c < G; c++) {
      const p = probaAt([b.x0 + (c + 0.5) * dx, y])
      if (p.length !== nClasses) throw new DtError('BAD_PARAM', { param: 'nClasses' })
      out.set(p, (r * G + c) * nClasses)
    }
  }
  return out
}
