/** Display helpers of the split workshop: language-dependent numbers and question texts (no split math). */
import type { ClassDataset } from '../../core/dataset'
import type { Candidate } from '../../core/splits'
import type { Lang } from '../../i18n'
import { fmtValue } from '../../ui/format'

// fmt / fmtValue moved to src/ui/format.ts (shared with the complexity lab); re-exported for the split views.
export { fmt, fmtValue } from '../../ui/format'

const POINT_DECIMAL = /^-?\d+\.\d+$/
const COMMA_DECIMAL = /^-?\d+,\d+$/

/** Editor cells are stored canonically (decimal point); German shows a decimal comma. */
export function displayCell(s: string, lang: Lang): string {
  return lang === 'de' && POINT_DECIMAL.test(s) ? s.replace('.', ',') : s
}

/** Typed cell text -> canonical text: trimmed, decimal comma turned into a point. */
export function normalizeCell(s: string): string {
  const v = s.trim()
  return COMMA_DECIMAL.test(v) ? v.replace(',', '.') : v
}

/** Number as typed by a user (point or comma) or NaN. */
export function parseTyped(s: string): number {
  const v = normalizeCell(s)
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : Number.NaN
}

/** Machine-readable gain for the verification contract: '.' and exactly 6 decimals. */
export function gainAttr(v: number): string {
  return v.toFixed(6)
}

/** "a2 ≤ 2,5" / "outlook = sunny" (plain text; user names are never rendered as markup). */
export function questionText(ds: ClassDataset, c: Pick<Candidate, 'feature' | 'kind' | 'value'>, lang: Lang): string {
  const f = ds.features[c.feature]
  return c.kind === 'threshold' ? `${f.name} ≤ ${fmtValue(lang, c.value)}` : `${f.name} = ${f.categories?.[c.value] ?? c.value}`
}

/** Index of the largest count (first one on ties). */
export function majority(counts: number[]): number {
  let best = 0
  counts.forEach((c, i) => {
    if (c > counts[best]) best = i
  })
  return best
}
