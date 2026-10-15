/** URL state of the Forest Lab (`#/forest`): data preset and generator, B, max_features (1 or 2), bootstrap, tree limits. */
import { formatDepth, formatNumber, parseBool, parseDepth, parseEnum, parseNumber, type Query } from '../queryParams'

export const FOREST_PRESETS = ['xor', 'moons', 'circles', 'diagonal'] as const
const MAX_FEATURES = ['1', '2'] as const

export interface ForestState {
  preset: (typeof FOREST_PRESETS)[number]
  n: number
  noise: number
  seed: number
  B: number
  mf: 1 | 2
  bootstrap: boolean
  /** null = unbounded */
  depth: number | null
  leaf: number
}

export const DEFAULT_FOREST_STATE: ForestState = {
  preset: 'moons',
  n: 200,
  noise: 0.3,
  seed: 1,
  B: 50,
  mf: 1,
  bootstrap: true,
  depth: null,
  leaf: 1,
}

export function parseForestQuery(q: Query): { state: ForestState; problems: string[] } {
  const problems: string[] = []
  const d = DEFAULT_FOREST_STATE
  const state: ForestState = {
    preset: parseEnum(q, 'preset', FOREST_PRESETS, d.preset, problems),
    n: parseNumber(q, 'n', { min: 2, max: 1000, integer: true }, d.n, problems),
    noise: parseNumber(q, 'noise', { min: 0, max: 1 }, d.noise, problems),
    seed: parseNumber(q, 'seed', { min: 0, max: 9999, integer: true }, d.seed, problems),
    B: parseNumber(q, 'B', { min: 1, max: 300, integer: true }, d.B, problems),
    mf: Number(parseEnum(q, 'mf', MAX_FEATURES, String(d.mf) as '1' | '2', problems)) as 1 | 2,
    bootstrap: parseBool(q, 'bootstrap', d.bootstrap, problems),
    depth: parseDepth(q, d.depth, problems),
    leaf: parseNumber(q, 'leaf', { min: 1, max: 50, integer: true }, d.leaf, problems),
  }
  return { state, problems }
}

/** Query of `state` without the parameters that equal their default. */
export function toForestQuery(state: ForestState): Query {
  const d = DEFAULT_FOREST_STATE
  const out: Query = {}
  if (state.preset !== d.preset) out.preset = state.preset
  if (state.n !== d.n) out.n = formatNumber(state.n)
  if (state.noise !== d.noise) out.noise = formatNumber(state.noise)
  if (state.seed !== d.seed) out.seed = formatNumber(state.seed)
  if (state.B !== d.B) out.B = formatNumber(state.B)
  if (state.mf !== d.mf) out.mf = String(state.mf)
  if (state.bootstrap !== d.bootstrap) out.bootstrap = state.bootstrap ? '1' : '0'
  if (state.depth !== d.depth) out.depth = formatDepth(state.depth)
  if (state.leaf !== d.leaf) out.leaf = formatNumber(state.leaf)
  return out
}

/** Numbers of trees at which the OOB accuracy is evaluated. */
const OOB_STEP_CANDIDATES = [1, 2, 5, 10, 20, 50, 100, 200, 300]

/** The OOB steps up to `B`, with `B` itself as the last one. */
export function oobSteps(B: number): number[] {
  const steps = OOB_STEP_CANDIDATES.filter((s) => s <= B)
  if (steps[steps.length - 1] !== B) steps.push(B)
  return steps
}
