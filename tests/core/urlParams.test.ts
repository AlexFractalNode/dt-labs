import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMPLEXITY_STATE,
  parseComplexityQuery,
  toComplexityQuery,
  type ComplexityState,
} from '../../src/tools/complexity/state'
import {
  DEFAULT_FOREST_STATE,
  parseForestQuery,
  toForestQuery,
  type ForestState,
} from '../../src/tools/forest/state'
import {
  DEFAULT_SPLITS_STATE,
  parseSplitsQuery,
  toSplitsQuery,
  type SplitsState,
} from '../../src/tools/splits/state'
import de from '../../src/i18n/de'

describe('URL query parsing', () => {
  it('returns the defaults and no problems for an empty query', () => {
    expect(parseSplitsQuery({})).toEqual({ state: DEFAULT_SPLITS_STATE, problems: [] })
    expect(parseComplexityQuery({})).toEqual({ state: DEFAULT_COMPLEXITY_STATE, problems: [] })
    expect(parseForestQuery({})).toEqual({ state: DEFAULT_FOREST_STATE, problems: [] })
  })

  it('uses the documented defaults', () => {
    expect(DEFAULT_SPLITS_STATE).toEqual({ preset: 'eight', criterion: 'entropy', grow: 'none' })
    expect(DEFAULT_COMPLEXITY_STATE).toEqual({
      preset: 'moons',
      n: 200,
      noise: 0.3,
      seed: 1,
      criterion: 'gini',
      depth: null,
      split: 2,
      leaf: 1,
      mid: 0,
      alpha: 0,
      curve: 'maxDepth',
    })
    expect(DEFAULT_FOREST_STATE).toEqual({
      preset: 'moons',
      n: 200,
      noise: 0.3,
      seed: 1,
      B: 50,
      mf: 1,
      bootstrap: true,
      depth: null,
      leaf: 1,
    })
  })

  it('clamps and defaults invalid query values', () => {
    const r = parseComplexityQuery({ preset: 'foo', depth: '-3', leaf: 'abc', alpha: '9' })
    expect(r.state.preset).toBe('moons')
    expect(r.state.depth).toBe(1)
    expect(r.state.leaf).toBe(1)
    expect(r.state.alpha).toBe(1)
    expect(r.problems.length).toBe(4)

    const f = parseForestQuery({ B: '99999' })
    expect(f.state.B).toBe(300)
    expect(f.problems.length).toBe(1)
  })

  it('rounds integers (reporting a problem) and accepts plain decimals', () => {
    const r = parseComplexityQuery({ n: '250.6', seed: '7', noise: '0.05', mid: '0.025' })
    expect(r.state).toMatchObject({ n: 251, seed: 7, noise: 0.05, mid: 0.025 })
    expect(r.problems).toEqual(['url.problem.n'])
  })

  it('treats empty, non-decimal and non-finite numbers as unreadable', () => {
    const r = parseComplexityQuery({ n: '', noise: 'NaN', seed: '1e3', split: 'Infinity', depth: 'deep' })
    expect(r.state).toMatchObject({ n: 200, noise: 0.3, seed: 1, split: 2, depth: null })
    expect(r.problems.length).toBe(5)
  })

  it('reads depth=none as unbounded and clamps depth to 1..20', () => {
    expect(parseComplexityQuery({ depth: 'none' })).toEqual({
      state: { ...DEFAULT_COMPLEXITY_STATE, depth: null },
      problems: [],
    })
    expect(parseComplexityQuery({ depth: '99' }).state.depth).toBe(20)
    expect(parseForestQuery({ depth: '0' }).state.depth).toBe(1)
  })

  it('validates enums and booleans and ignores unknown parameters', () => {
    const f = parseForestQuery({ mf: '3', bootstrap: 'yes', preset: 'eight', lang: 'en', foo: 'bar' })
    expect(f.state).toEqual(DEFAULT_FOREST_STATE)
    expect(f.problems.sort()).toEqual(['url.problem.bootstrap', 'url.problem.mf', 'url.problem.preset'])
    const s = parseSplitsQuery({ preset: 'weather', criterion: 'misclass', grow: 'auto' })
    expect(s).toEqual({ state: { preset: 'weather', criterion: 'misclass', grow: 'auto' }, problems: [] })
    expect(parseSplitsQuery({ preset: 'moons', grow: 'x' }).problems.length).toBe(2)
  })

  it('has an i18n message for every reported problem key', () => {
    const problem = (de as unknown as { url: { problem: Record<string, string> } }).url.problem
    const bad = {
      preset: 'x', criterion: 'x', grow: 'x', n: 'x', noise: 'x', seed: 'x', depth: 'x', split: 'x',
      leaf: 'x', mid: 'x', alpha: 'x', curve: 'x', B: 'x', mf: 'x', bootstrap: 'x',
    }
    const keys = [
      ...parseSplitsQuery(bad).problems,
      ...parseComplexityQuery(bad).problems,
      ...parseForestQuery(bad).problems,
    ]
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) {
      expect(k.startsWith('url.problem.')).toBe(true)
      expect(problem[k.slice('url.problem.'.length)], k).toBeTruthy()
    }
  })

  it('round-trips states', () => {
    const splits: SplitsState = { preset: 'weather', criterion: 'gini', grow: 'auto' }
    const complexity: ComplexityState = {
      preset: 'circles',
      n: 333,
      noise: 0.45,
      seed: 42,
      criterion: 'entropy',
      depth: 7,
      split: 10,
      leaf: 4,
      mid: 0.0125,
      alpha: 0.2,
      curve: 'ccpAlpha',
    }
    const forest: ForestState = {
      preset: 'xor',
      n: 80,
      noise: 0.15,
      seed: 9,
      B: 120,
      mf: 2,
      bootstrap: false,
      depth: 5,
      leaf: 3,
    }
    for (const s of [DEFAULT_SPLITS_STATE, splits]) {
      expect(parseSplitsQuery(toSplitsQuery(s))).toEqual({ state: s, problems: [] })
    }
    for (const s of [DEFAULT_COMPLEXITY_STATE, complexity, { ...DEFAULT_COMPLEXITY_STATE, preset: 'eight' as const }]) {
      expect(parseComplexityQuery(toComplexityQuery(s))).toEqual({ state: s, problems: [] })
    }
    for (const s of [DEFAULT_FOREST_STATE, forest]) {
      expect(parseForestQuery(toForestQuery(s))).toEqual({ state: s, problems: [] })
    }
    expect(toSplitsQuery(DEFAULT_SPLITS_STATE)).toEqual({})
    expect(toComplexityQuery(DEFAULT_COMPLEXITY_STATE)).toEqual({})
    expect(toForestQuery(DEFAULT_FOREST_STATE)).toEqual({})
  })

  it('omits defaults and writes plain decimals, depth=none and 0/1 booleans', () => {
    expect(toComplexityQuery({ ...DEFAULT_COMPLEXITY_STATE, alpha: 0.0000001, depth: 3, curve: 'ccpAlpha' })).toEqual({
      alpha: '0.0000001',
      depth: '3',
      curve: 'ccpAlpha',
    })
    expect(toForestQuery({ ...DEFAULT_FOREST_STATE, bootstrap: false, mf: 2 })).toEqual({ bootstrap: '0', mf: '2' })
    expect(toForestQuery({ ...DEFAULT_FOREST_STATE, depth: 4 })).toEqual({ depth: '4' })
  })
})
