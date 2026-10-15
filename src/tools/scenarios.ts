/**
 * Scenario registry (onboarding): ready-made tool states with a short explanation. Pure data and helpers, no
 * framework. The texts live in i18n (`scenario.<id>.*`); every number in them is proven by
 * tests/core/scenarioClaims.test.ts.
 */
import { buildHash } from '../urlState'
import { parseComplexityQuery, toComplexityQuery } from './complexity/state'
import { parseForestQuery, toForestQuery } from './forest/state'
import { parseSplitsQuery, toSplitsQuery } from './splits/state'

export type ToolId = 'splits' | 'complexity' | 'forest'
/** One-off start action of a view after the scenario state has been applied. */
export type ScenarioAction = 'voteExample' | 'measureVariance'

export interface Scenario {
  id: string
  tool: ToolId
  /** Complete tool state in the normalized URL-query format of the tool's `to*Query` (defaults omitted). */
  query: Record<string, string>
  action?: ScenarioAction
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 's1', tool: 'splits', query: { preset: 'speed' } },
  { id: 's2', tool: 'splits', query: { grow: 'auto' } },
  { id: 's3', tool: 'splits', query: { preset: 'weather', criterion: 'misclass' } },
  { id: 'c1', tool: 'complexity', query: { seed: '2' } },
  { id: 'c2', tool: 'complexity', query: { seed: '2', depth: '3' } },
  { id: 'c3', tool: 'complexity', query: { preset: 'eight', criterion: 'entropy', alpha: '0.45' } },
  { id: 'f1', tool: 'forest', query: { B: '100' } },
  { id: 'f2', tool: 'forest', query: {}, action: 'voteExample' },
  { id: 'f3', tool: 'forest', query: { bootstrap: '0', mf: '2' }, action: 'measureVariance' },
]

export function scenariosFor(tool: ToolId): Scenario[] {
  return SCENARIOS.filter((s) => s.tool === tool)
}

export function scenarioById(id: string): Scenario | null {
  return SCENARIOS.find((s) => s.id === id) ?? null
}

/**
 * The scenario named by `q.scenario`: missing -> `null` without problem; unknown id or one of another tool ->
 * `null` with `url.problem.scenario`.
 */
export function parseScenarioParam(tool: ToolId, q: Record<string, string>): { scenario: Scenario | null; problems: string[] } {
  if (!Object.prototype.hasOwnProperty.call(q, 'scenario')) return { scenario: null, problems: [] }
  const s = scenarioById(q.scenario)
  if (s === null || s.tool !== tool) return { scenario: null, problems: ['url.problem.scenario'] }
  return { scenario: s, problems: [] }
}

/** `to*Query(parse*Query(q).state)`: the query without defaults, unknown parameters (`scenario`, `lang`) dropped. */
export function normalizeToolQuery(tool: ToolId, q: Record<string, string>): Record<string, string> {
  if (tool === 'splits') return toSplitsQuery(parseSplitsQuery(q).state)
  if (tool === 'complexity') return toComplexityQuery(parseComplexityQuery(q).state)
  return toForestQuery(parseForestQuery(q).state)
}

/** Whether the normalized current state differs from the normalized scenario query. */
export function isDeviated(s: Scenario, current: Record<string, string>): boolean {
  const a = normalizeToolQuery(s.tool, current)
  const b = normalizeToolQuery(s.tool, s.query)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (a[k] !== b[k]) return true
  return false
}

/** Address that applies the scenario (`#/<tool>?<query>&scenario=<id>`), keeping the language when given. */
export function scenarioHref(s: Scenario, lang?: string): string {
  return buildHash(s.tool, { ...s.query, scenario: s.id, ...(lang ? { lang } : {}) })
}
