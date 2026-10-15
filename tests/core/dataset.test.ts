import { describe, expect, it } from 'vitest'
import { loadGolden } from '../helpers/golden'
import { DtError } from '../../src/core/errors'
import { checkTableLimits, datasetToRows, fromCsvText, fromTable, rowsToDataset } from '../../src/core/dataset'
import { PRESETS } from '../../src/core/presets'

function codeOf(fn: () => unknown): DtError {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(DtError)
    return e as DtError
  }
  throw new Error('expected DtError, nothing thrown')
}

describe('dataset', () => {
  it('presets match the textbook golden', () => {
    const g = loadGolden('textbook')
    for (const name of ['speed', 'eight', 'weather'] as const) {
      const { features, X, y, classNames } = g[name]
      expect(PRESETS[name]).toEqual({ features, X, y, classNames })
    }
  })

  it('round-trips presets through datasetToRows and rowsToDataset', () => {
    for (const ds of Object.values(PRESETS)) {
      const header = [...ds.features.map((f) => f.name), 'target']
      expect(rowsToDataset(header, datasetToRows(ds), 'target')).toEqual(ds)
    }
  })

  it('builds a dataset from a German Excel CSV', () => {
    const ds = fromCsvText('\uFEFFWetter;Temp;Klasse\nsonnig;21,5;ja\nRegen;12;nein\n', 'Klasse')
    expect(ds.features[0].kind).toBe('categorical')
    expect(ds.features[1].kind).toBe('numeric')
    expect(ds.X[0][1]).toBe(21.5)
    expect(ds.classNames).toEqual(['ja', 'nein'])
  })

  it('sorts numeric class labels numerically', () => {
    const ds = fromCsvText('a;c\n1;10\n2;2\n3;10\n', 'c')
    expect(ds.classNames).toEqual(['2', '10'])
    expect(ds.y).toEqual([1, 0, 1])
  })

  it('sorts text class labels by code point', () => {
    const ds = fromCsvText('a;c\n1;b\n2;B\n3;a\n', 'c')
    expect(ds.classNames).toEqual(['B', 'a', 'b'])
  })

  it('treats a mixed-type column as categorical', () => {
    const ds = fromCsvText('v;c\n1;a\n2;b\nx;a\n', 'c')
    expect(ds.features[0].kind).toBe('categorical')
    expect(ds.features[0].categories).toEqual(['1', '2', 'x'])
    expect(ds.X.map((r) => r[0])).toEqual([0, 1, 2])
  })

  it('keeps categories in order of first appearance', () => {
    const ds = fromCsvText('f;c\nz;a\nm;b\nz;a\n', 'c')
    expect(ds.features[0].categories).toEqual(['z', 'm'])
  })

  it('allows the target in any column', () => {
    const ds = fromCsvText('c;f\na;1\nb;2\n', 'c')
    expect(ds.features.map((f) => f.name)).toEqual(['f'])
    expect(ds.classNames).toEqual(['a', 'b'])
  })

  it('rejects degenerate input with a code', () => {
    expect(codeOf(() => fromCsvText('a;c\n1;x\n', 'c')).code).toBe('EMPTY_DATA')
    expect(codeOf(() => fromCsvText('a;c\n1;x\n2;x\n', 'c')).code).toBe('SINGLE_CLASS')

    for (const cell of ['', 'NA', '?', ' ']) {
      const e = codeOf(() => fromCsvText(`a;b;c\n1;2;x\n3;${cell};y\n`, 'c'))
      expect(e.code).toBe('MISSING_VALUES')
      expect(e.details).toMatchObject({ row: 2, column: 'b' })
    }
    // missing target label
    const t = codeOf(() => fromCsvText('a;c\n1;x\n2;y\n3;?\n', 'c'))
    expect(t.code).toBe('MISSING_VALUES')
    expect(t.details).toMatchObject({ row: 3, column: 'c' })

    const rows = Array.from({ length: 201 }, (_, i) => `${i};${i % 2 ? 'a' : 'b'}`).join('\n')
    const big = codeOf(() => fromCsvText(`a;c\n${rows}\n`, 'c'))
    expect(big.code).toBe('CSV_LIMIT')
    expect(big.details).toMatchObject({ rows: 201 })
    expect(fromCsvText(`a;c\n${rows.split('\n').slice(0, 200).join('\n')}\n`, 'c').X).toHaveLength(200)

    const nine = `${Array.from({ length: 9 }, (_, i) => `f${i}`).join(';')};c\n${'1;'.repeat(9)}x\n${'2;'.repeat(9)}y\n`
    const wide = codeOf(() => fromCsvText(nine, 'c'))
    expect(wide.code).toBe('CSV_LIMIT')
    expect(wide.details).toMatchObject({ features: 9 })

    expect(codeOf(() => fromCsvText('a;c\n1;x\n2;y\n', 'nope')).code).toBe('BAD_PARAM')
  })

  it('rejects more than six classes with CSV_LIMIT (details.classes)', () => {
    const csv = (k: number) => ['a;c', ...Array.from({ length: k }, (_, i) => `${i};k${i}`), ''].join('\n')
    expect(fromCsvText(csv(6), 'c').classNames).toHaveLength(6)
    const e = codeOf(() => fromCsvText(csv(7), 'c'))
    expect(e.code).toBe('CSV_LIMIT')
    expect(e.details).toMatchObject({ classes: 7, maxClasses: 6 })
    const rows = Array.from({ length: 7 }, (_, i) => [String(i), `k${i}`])
    expect(codeOf(() => rowsToDataset(['a', 'c'], rows, 'c')).details).toMatchObject({ classes: 7 })
  })

  it('checkTableLimits reports rows and features before any dataset is built', () => {
    expect(() => checkTableLimits(3, 200)).not.toThrow()
    const rowsErr = codeOf(() => checkTableLimits(3, 201))
    expect(rowsErr.code).toBe('CSV_LIMIT')
    expect(rowsErr.details).toMatchObject({ rows: 201, maxRows: 200 })
    expect(codeOf(() => checkTableLimits(10, 5)).details).toMatchObject({ features: 9, maxFeatures: 8 })
  })

  it('rejects text above maxBytes before parsing', () => {
    // 600k two-byte characters = 1.2 MB in UTF-8 but only 600k UTF-16 units; the text is not valid CSV.
    const e = codeOf(() => fromCsvText('é'.repeat(600_000), 'c'))
    expect(e.code).toBe('CSV_LIMIT')
    expect(e.details).toMatchObject({ bytes: 1_200_000 })
    expect(codeOf(() => fromCsvText('a;c\n1;x\n2;y\n', 'c', { maxBytes: 5 })).code).toBe('CSV_LIMIT')
  })

  it('keeps a constant column', () => {
    const ds = fromCsvText('k;a;c\n7;1;x\n7;2;y\n', 'c')
    expect(ds.features[0]).toEqual({ name: 'k', kind: 'numeric' })
    expect(ds.X.map((r) => r[0])).toEqual([7, 7])
  })

  it('applies the same rules in rowsToDataset as in fromTable', () => {
    const fromRows = rowsToDataset(['Wetter', 'Temp', 'Klasse'], [['sonnig', '21,5', 'ja'], ['Regen', ' 12 ', 'nein']], 'Klasse')
    const fromTab = fromTable(
      { columns: ['Wetter', 'Temp', 'Klasse'], rows: [['sonnig', 21.5, 'ja'], ['Regen', 12, 'nein']] },
      'Klasse',
    )
    expect(fromRows).toEqual(fromTab)
    const e = codeOf(() => rowsToDataset(['a', 'c'], [['1', 'x'], ['', 'y']], 'c'))
    expect(e.code).toBe('MISSING_VALUES')
    expect(e.details).toMatchObject({ row: 2, column: 'a' })
    expect(codeOf(() => rowsToDataset(['a', 'c'], [['1', 'x']], 'c')).code).toBe('EMPTY_DATA')
    expect(codeOf(() => rowsToDataset(['a', 'c'], [['1', 'x'], ['2', 'x']], 'c')).code).toBe('SINGLE_CLASS')
    expect(codeOf(() => rowsToDataset(['a', 'c'], Array.from({ length: 201 }, (_, i) => [String(i), String(i % 2)]), 'c')).code).toBe('CSV_LIMIT')
  })
})
