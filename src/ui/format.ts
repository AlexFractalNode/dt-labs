/** Language-dependent number formatting shared by the tool views (display only, no model math). */
import type { Lang } from '../i18n'

/** Fixed number of decimals ("0,923" in German, "0.923" in English). */
export function fmt(lang: Lang, v: number, digits = 3): string {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)
}

/** Threshold or count with as many decimals as needed (max 6). */
export function fmtValue(lang: Lang, v: number): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 6 }).format(v)
}
