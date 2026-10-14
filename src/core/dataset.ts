/**
 * Classification datasets: conversion of a parsed table (or editor rows) into numeric codes.
 * Categories are coded 0..m-1 in order of first appearance, classes in sklearn `classes_` order.
 */
import { DtError } from './errors'
import { parseCsv, type Table } from './csv'

export interface Feature {
  name: string
  kind: 'numeric' | 'categorical'
  /** Category names by code (categorical features only). */
  categories?: string[]
}

export interface ClassDataset {
  features: Feature[]
  X: number[][]
  y: number[]
  classNames: string[]
}

export interface DatasetLimits {
  maxBytes?: number
  maxRows?: number
  maxFeatures?: number
}

const DEFAULT_MAX_BYTES = 1_000_000
const DEFAULT_MAX_ROWS = 200
const DEFAULT_MAX_FEATURES = 8

/** Same set of missing markers as the CSV parser (after trimming). */
const MISSING = /^(na|n\/a|nan|null|\?)$/i
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const DECIMAL_COMMA = /^-?\d+,\d+$/

type Cell = number | string | null | undefined

/** Text cell -> number if it reads as a finite number (decimal comma allowed), else trimmed text. */
function parseTextCell(raw: string): number | string {
  const s = raw.trim()
  const n = DECIMAL_COMMA.test(s) ? Number(s.replace(',', '.')) : NUMBER.test(s) ? Number(s) : NaN
  return Number.isFinite(n) ? n : s
}

/** The single place that decides what "missing" means: null/undefined, empty, NA/? ... after trimming. */
function isMissing(cell: Cell): boolean {
  if (cell === null || cell === undefined) return true
  if (typeof cell === 'number') return !Number.isFinite(cell)
  const s = cell.trim()
  return s === '' || MISSING.test(s)
}

/** Plain code-point order (like numpy sorting of str), unlike the UTF-16 order of Array.prototype.sort. */
function compareCodePoints(a: string, b: string): number {
  const ia = a[Symbol.iterator]()
  const ib = b[Symbol.iterator]()
  for (;;) {
    const ca = ia.next()
    const cb = ib.next()
    if (ca.done || cb.done) return ca.done === cb.done ? 0 : ca.done ? -1 : 1
    const d = ca.value.codePointAt(0)! - cb.value.codePointAt(0)!
    if (d !== 0) return d
  }
}

/**
 * Shared conversion used by fromTable and rowsToDataset. Order of checks: target, EMPTY_DATA (< 2 rows),
 * CSV_LIMIT (rows, features), MISSING_VALUES (first offending cell, row-major), SINGLE_CLASS.
 */
function build(columns: string[], cells: Cell[][], target: string, opts?: DatasetLimits): ClassDataset {
  const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS
  const maxFeatures = opts?.maxFeatures ?? DEFAULT_MAX_FEATURES
  const t = columns.indexOf(target)
  if (t < 0) throw new DtError('BAD_PARAM', { target })
  if (columns.length < 2) throw new DtError('EMPTY_DATA', { reason: 'noFeatures' })
  if (cells.length < 2) throw new DtError('EMPTY_DATA', { rows: cells.length })
  if (cells.length > maxRows) throw new DtError('CSV_LIMIT', { rows: cells.length, maxRows })
  const nFeatures = columns.length - 1
  if (nFeatures > maxFeatures) throw new DtError('CSV_LIMIT', { features: nFeatures, maxFeatures })

  const data: (number | string)[][] = cells.map((row, i) =>
    columns.map((name, j) => {
      const cell = row[j]
      if (isMissing(cell)) throw new DtError('MISSING_VALUES', { row: i + 1, column: name })
      return typeof cell === 'string' ? parseTextCell(cell) : (cell as number)
    }),
  )

  const features: Feature[] = []
  const columnCodes: number[][] = []
  for (let j = 0; j < columns.length; j++) {
    if (j === t) continue
    const col = data.map((r) => r[j])
    if (col.every((v) => typeof v === 'number')) {
      features.push({ name: columns[j], kind: 'numeric' })
      columnCodes.push(col as number[])
    } else {
      const categories: string[] = []
      const index = new Map<string, number>()
      columnCodes.push(
        col.map((v) => {
          const key = String(v)
          let code = index.get(key)
          if (code === undefined) {
            code = categories.length
            index.set(key, code)
            categories.push(key)
          }
          return code
        }),
      )
      features.push({ name: columns[j], kind: 'categorical', categories })
    }
  }
  const X = data.map((_, i) => columnCodes.map((c) => c[i]))

  const labels = data.map((r) => r[t])
  const names = [...new Set(labels.map(String))]
  if (labels.every((v) => typeof v === 'number')) names.sort((a, b) => Number(a) - Number(b))
  else names.sort(compareCodePoints)
  if (names.length < 2) throw new DtError('SINGLE_CLASS', { classes: names.length })
  const code = new Map(names.map((n, k) => [n, k]))
  const y = labels.map((v) => code.get(String(v))!)
  return { features, X, y, classNames: names }
}

/** Dataset from a parsed table; the target column is addressed by header name. */
export function fromTable(t: Table, target: string, opts?: DatasetLimits): ClassDataset {
  return build(t.columns, t.rows, target, opts)
}

/** Parses CSV text (max `maxBytes` UTF-8 bytes, checked before parsing) into a dataset. */
export function fromCsvText(text: string, target: string, opts?: DatasetLimits): ClassDataset {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES
  const bytes = new TextEncoder().encode(text).length
  if (bytes > maxBytes) throw new DtError('CSV_LIMIT', { bytes, maxBytes })
  return fromTable(parseCsv(text), target, opts)
}

/** Dataset from the table editor's text cells; same rules and limits as `fromTable`. */
export function rowsToDataset(header: string[], rows: string[][], target: string, opts?: DatasetLimits): ClassDataset {
  return build(header, rows, target, opts)
}

/** Editor rows: one string per feature (category name or number), followed by the class name. */
export function datasetToRows(ds: ClassDataset): string[][] {
  return ds.X.map((row, i) => [
    ...row.map((v, j) => {
      const f = ds.features[j]
      return f.kind === 'categorical' ? f.categories![v] : String(v)
    }),
    ds.classNames[ds.y[i]],
  ])
}
