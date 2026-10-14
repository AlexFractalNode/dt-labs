/**
 * Split candidates of one node (Spec 3.2): numeric thresholds at plain midpoints (a + b) / 2 of
 * adjacent distinct values (left = `x <= t`), categorical "== code" (left = yes) for categories
 * present in the node. The float32 variant used by sklearn lives only in `tree.ts`.
 */
import type { ClassDataset } from './dataset'
import { impurity, type Criterion } from './impurity'

export interface Candidate {
  feature: number
  kind: 'threshold' | 'category'
  /** Threshold (kind 'threshold') or category code (kind 'category'). */
  value: number
  /** Class counts per side in `classNames` order. */
  left: number[]
  right: number[]
  nLeft: number
  nRight: number
  /** Weighted child impurity `n_L/n * I(L) + n_R/n * I(R)`. */
  childImpurity: number
  /** Local decrease `I(parent) - childImpurity`. */
  gain: number
  /** `(n_node / nTotal) * gain`. */
  globalGain: number
  isBest: boolean
  isTie: boolean
}

const TIE_TOLERANCE = 1e-12

function sum(counts: number[]): number {
  let n = 0
  for (const c of counts) n += c
  return n
}

function countClasses(ds: ClassDataset, rows: number[]): number[] {
  const counts = new Array<number>(ds.classNames.length).fill(0)
  for (const r of rows) counts[ds.y[r]]++
  return counts
}

function distinctSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

export function candidates(ds: ClassDataset, rows: number[], criterion: Criterion, nTotal: number): Candidate[] {
  const n = rows.length
  if (n === 0) return []
  const parent = countClasses(ds, rows)
  const parentImpurity = impurity(criterion, parent)
  const out: Candidate[] = []

  const push = (feature: number, kind: Candidate['kind'], value: number, goesLeft: (r: number) => boolean) => {
    const leftRows: number[] = []
    const rightRows: number[] = []
    for (const r of rows) (goesLeft(r) ? leftRows : rightRows).push(r)
    const left = countClasses(ds, leftRows)
    const right = countClasses(ds, rightRows)
    const nLeft = leftRows.length
    const nRight = rightRows.length
    const childImpurity = (nLeft / n) * impurity(criterion, left) + (nRight / n) * impurity(criterion, right)
    const gain = parentImpurity - childImpurity
    out.push({
      feature,
      kind,
      value,
      left,
      right,
      nLeft,
      nRight,
      childImpurity,
      gain,
      globalGain: (n / nTotal) * gain,
      isBest: false,
      isTie: false,
    })
  }

  ds.features.forEach((f, j) => {
    const values = distinctSorted(rows.map((r) => ds.X[r][j]))
    if (values.length < 2) return
    if (f.kind === 'numeric') {
      for (let i = 0; i + 1 < values.length; i++) {
        const t = (values[i] + values[i + 1]) / 2
        push(j, 'threshold', t, (r) => ds.X[r][j] <= t)
      }
    } else {
      const codes = values.length === 2 ? values.slice(0, 1) : values
      for (const c of codes) push(j, 'category', c, (r) => ds.X[r][j] === c)
    }
  })

  if (out.length > 0) {
    let bestGain = -Infinity
    for (const c of out) if (c.gain > bestGain) bestGain = c.gain
    const near = out.filter((c) => Math.abs(c.gain - bestGain) <= TIE_TOLERANCE)
    near[0].isBest = true
    if (near.length >= 2) for (const c of near) c.isTie = true
  }
  return out
}

export function bestCandidate(cands: Candidate[]): Candidate | null {
  return cands.find((c) => c.isBest) ?? null
}

/** ID3 gain with one child per category present; null for numeric features. Comparison only. */
export function multiwayGain(ds: ClassDataset, rows: number[], feature: number, criterion: Criterion): number | null {
  if (ds.features[feature].kind !== 'categorical') return null
  const n = rows.length
  if (n === 0) return 0
  const byCode = new Map<number, number[]>()
  for (const r of rows) {
    const code = ds.X[r][feature]
    const list = byCode.get(code)
    if (list) list.push(r)
    else byCode.set(code, [r])
  }
  let rest = 0
  for (const code of [...byCode.keys()].sort((a, b) => a - b)) {
    const counts = countClasses(ds, byCode.get(code)!)
    rest += (sum(counts) / n) * impurity(criterion, counts)
  }
  return impurity(criterion, countClasses(ds, rows)) - rest
}

export function candidateKey(c: Candidate): string {
  return `${c.feature}:${c.kind}:${c.value}`
}
