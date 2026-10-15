/** URL state of the Split Workshop (`#/splits`): `preset`, `criterion`, `grow=auto` (finished tree). */
import { parseEnum, type Query } from '../queryParams'

export const SPLITS_PRESETS = ['speed', 'eight', 'weather'] as const
export const SPLITS_CRITERIA = ['entropy', 'gini', 'misclass'] as const
export const SPLITS_GROW = ['none', 'auto'] as const

export interface SplitsState {
  preset: (typeof SPLITS_PRESETS)[number]
  criterion: (typeof SPLITS_CRITERIA)[number]
  grow: (typeof SPLITS_GROW)[number]
}

export const DEFAULT_SPLITS_STATE: SplitsState = { preset: 'eight', criterion: 'entropy', grow: 'none' }

export function parseSplitsQuery(q: Query): { state: SplitsState; problems: string[] } {
  const problems: string[] = []
  const d = DEFAULT_SPLITS_STATE
  const state: SplitsState = {
    preset: parseEnum(q, 'preset', SPLITS_PRESETS, d.preset, problems),
    criterion: parseEnum(q, 'criterion', SPLITS_CRITERIA, d.criterion, problems),
    grow: parseEnum(q, 'grow', SPLITS_GROW, d.grow, problems),
  }
  return { state, problems }
}

/** Query of `state` without the parameters that equal their default. */
export function toSplitsQuery(state: SplitsState): Query {
  const d = DEFAULT_SPLITS_STATE
  const out: Query = {}
  if (state.preset !== d.preset) out.preset = state.preset
  if (state.criterion !== d.criterion) out.criterion = state.criterion
  if (state.grow !== d.grow) out.grow = state.grow
  return out
}
