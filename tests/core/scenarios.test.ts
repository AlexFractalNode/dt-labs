import { describe, expect, it } from 'vitest'
import de from '../../src/i18n/de'
import en from '../../src/i18n/en'
import { parseComplexityQuery } from '../../src/tools/complexity/state'
import { parseForestQuery } from '../../src/tools/forest/state'
import {
  SCENARIOS,
  isDeviated,
  normalizeToolQuery,
  parseScenarioParam,
  scenarioById,
  scenarioHref,
  scenariosFor,
  type ToolId,
} from '../../src/tools/scenarios'
import { parseSplitsQuery } from '../../src/tools/splits/state'

const TOOLS: ToolId[] = ['splits', 'complexity', 'forest']

function parseProblems(tool: ToolId, q: Record<string, string>): string[] {
  if (tool === 'splits') return parseSplitsQuery(q).problems
  if (tool === 'complexity') return parseComplexityQuery(q).problems
  return parseForestQuery(q).problems
}

function lookup(cat: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], cat)
}

describe('scenario registry', () => {
  it('has nine scenarios with unique ids, three per tool', () => {
    expect(SCENARIOS).toHaveLength(9)
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(9)
    for (const tool of TOOLS) expect(scenariosFor(tool)).toHaveLength(3)
    expect(SCENARIOS.map((s) => s.id)).toEqual(['s1', 's2', 's3', 'c1', 'c2', 'c3', 'f1', 'f2', 'f3'])
    expect(scenarioById('c2')?.tool).toBe('complexity')
    expect(scenarioById('nope')).toBeNull()
  })

  it('stores normalized queries that parse without problems', () => {
    for (const s of SCENARIOS) {
      expect(parseProblems(s.tool, s.query), s.id).toEqual([])
      expect(normalizeToolQuery(s.tool, s.query), s.id).toEqual(s.query)
    }
  })

  it('allows actions only on the forest', () => {
    for (const s of SCENARIOS) if (s.action !== undefined) expect(s.tool, s.id).toBe('forest')
    expect(scenarioById('f2')?.action).toBe('voteExample')
    expect(scenarioById('f3')?.action).toBe('measureVariance')
    expect(scenarioById('f1')?.action).toBeUndefined()
  })

  it('parses the scenario parameter', () => {
    expect(parseScenarioParam('splits', { scenario: 's2' })).toEqual({ scenario: scenarioById('s2'), problems: [] })
    expect(parseScenarioParam('splits', {})).toEqual({ scenario: null, problems: [] })
    expect(parseScenarioParam('splits', { scenario: 'f2' })).toEqual({ scenario: null, problems: ['url.problem.scenario'] })
    expect(parseScenarioParam('forest', { scenario: 'xyz' })).toEqual({ scenario: null, problems: ['url.problem.scenario'] })
  })

  it('detects deviation independent of defaults and order', () => {
    const s2 = scenarioById('s2')!
    expect(isDeviated(s2, { grow: 'auto' })).toBe(false)
    expect(isDeviated(s2, { grow: 'auto', preset: 'eight' })).toBe(false)
    expect(isDeviated(s2, { grow: 'auto', criterion: 'gini' })).toBe(true)
    expect(isDeviated(s2, { grow: 'auto', scenario: 's2', lang: 'en' })).toBe(false)
    expect(isDeviated(s2, {})).toBe(true)
    const c3 = scenarioById('c3')!
    expect(isDeviated(c3, { alpha: '0.45', criterion: 'entropy', preset: 'eight' })).toBe(false)
    expect(isDeviated(c3, { alpha: '0.450', criterion: 'entropy', preset: 'eight' })).toBe(false)
    expect(isDeviated(c3, { alpha: '0.5', criterion: 'entropy', preset: 'eight' })).toBe(true)
  })

  it('builds scenario links', () => {
    expect(scenarioHref(scenarioById('s2')!)).toBe('#/splits?grow=auto&scenario=s2')
    expect(scenarioHref(scenarioById('s2')!, 'en')).toBe('#/splits?grow=auto&scenario=s2&lang=en')
    expect(scenarioHref(scenarioById('f2')!)).toBe('#/forest?scenario=f2')
  })

  it('has every scenario text in both languages', () => {
    const keys = [
      ...SCENARIOS.flatMap((s) => ['title', 'short', 'see', 'watch', 'next'].map((f) => `scenario.${s.id}.${f}`)),
      ...['barLabel', 'noteSee', 'noteWatch', 'noteNext', 'changed', 'restore', 'close'].map((f) => `scenario.${f}`),
      'url.problem.scenario',
    ]
    for (const cat of [de, en]) {
      for (const k of keys) {
        const v = lookup(cat, k)
        expect(typeof v, k).toBe('string')
        expect((v as string).length, k).toBeGreaterThan(0)
      }
    }
  })
})
