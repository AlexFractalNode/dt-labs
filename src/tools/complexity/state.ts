/**
 * URL state of the Complexity Lab (`#/complexity`). With `preset=eight` the data is fixed, so the views ignore
 * `n`, `noise` and `seed`; they are still parsed and kept so a link round-trips unchanged.
 */
import { formatDepth, formatNumber, parseDepth, parseEnum, parseNumber, type Query } from '../queryParams'

export const COMPLEXITY_PRESETS = ['eight', 'xor', 'moons', 'circles', 'diagonal'] as const
export const COMPLEXITY_CRITERIA = ['gini', 'entropy'] as const
export const COMPLEXITY_CURVES = ['maxDepth', 'ccpAlpha'] as const

export interface ComplexityState {
  preset: (typeof COMPLEXITY_PRESETS)[number]
  n: number
  noise: number
  seed: number
  criterion: (typeof COMPLEXITY_CRITERIA)[number]
  /** null = unbounded */
  depth: number | null
  split: number
  leaf: number
  mid: number
  alpha: number
  curve: (typeof COMPLEXITY_CURVES)[number]
}

export const DEFAULT_COMPLEXITY_STATE: ComplexityState = {
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
}

export function parseComplexityQuery(q: Query): { state: ComplexityState; problems: string[] } {
  const problems: string[] = []
  const d = DEFAULT_COMPLEXITY_STATE
  const state: ComplexityState = {
    preset: parseEnum(q, 'preset', COMPLEXITY_PRESETS, d.preset, problems),
    n: parseNumber(q, 'n', { min: 2, max: 1000, integer: true }, d.n, problems),
    noise: parseNumber(q, 'noise', { min: 0, max: 1 }, d.noise, problems),
    seed: parseNumber(q, 'seed', { min: 0, max: 9999, integer: true }, d.seed, problems),
    criterion: parseEnum(q, 'criterion', COMPLEXITY_CRITERIA, d.criterion, problems),
    depth: parseDepth(q, d.depth, problems),
    split: parseNumber(q, 'split', { min: 2, max: 100, integer: true }, d.split, problems),
    leaf: parseNumber(q, 'leaf', { min: 1, max: 50, integer: true }, d.leaf, problems),
    mid: parseNumber(q, 'mid', { min: 0, max: 0.05 }, d.mid, problems),
    alpha: parseNumber(q, 'alpha', { min: 0, max: 1 }, d.alpha, problems),
    curve: parseEnum(q, 'curve', COMPLEXITY_CURVES, d.curve, problems),
  }
  return { state, problems }
}

/** Query of `state` without the parameters that equal their default. */
export function toComplexityQuery(state: ComplexityState): Query {
  const d = DEFAULT_COMPLEXITY_STATE
  const out: Query = {}
  if (state.preset !== d.preset) out.preset = state.preset
  if (state.n !== d.n) out.n = formatNumber(state.n)
  if (state.noise !== d.noise) out.noise = formatNumber(state.noise)
  if (state.seed !== d.seed) out.seed = formatNumber(state.seed)
  if (state.criterion !== d.criterion) out.criterion = state.criterion
  if (state.depth !== d.depth) out.depth = formatDepth(state.depth)
  if (state.split !== d.split) out.split = formatNumber(state.split)
  if (state.leaf !== d.leaf) out.leaf = formatNumber(state.leaf)
  if (state.mid !== d.mid) out.mid = formatNumber(state.mid)
  if (state.alpha !== d.alpha) out.alpha = formatNumber(state.alpha)
  if (state.curve !== d.curve) out.curve = state.curve
  return out
}
