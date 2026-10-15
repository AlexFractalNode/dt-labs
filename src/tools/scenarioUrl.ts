/**
 * Writing the live address of a tool view (onboarding). Kept apart from src/urlState.ts because the scenario
 * registry imports `buildHash` from there; both functions use `history.replaceState`, which fires no `hashchange`
 * and so never touches the route ref (no view re-init, no scenario action).
 */
import { scenarioById, type ToolId } from './scenarios'

function liveParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '')
}

function replaceHash(hash: string): void {
  history.replaceState(history.state, '', hash)
}

/**
 * Replaces the live address with `#/<tool>?<query>`, keeping `lang` of the live address and `scenario` only when
 * that id exists and belongs to `tool`. Without `window`/`history` it does nothing (the view still works).
 */
export function writeToolQuery(tool: ToolId, query: Record<string, string>): void {
  if (typeof window === 'undefined') return
  try {
    const live = liveParams()
    const next = new URLSearchParams(query)
    const l = live.get('lang')
    if (l) next.set('lang', l)
    const id = live.get('scenario')
    if (id !== null && scenarioById(id)?.tool === tool) next.set('scenario', id)
    const qs = next.toString()
    replaceHash(`#/${tool}${qs ? `?${qs}` : ''}`)
  } catch {
    /* history unavailable: the view still works */
  }
}

/** Removes `scenario` from the live address (replaceState); the path and all other parameters stay. */
export function removeScenarioParam(): void {
  if (typeof window === 'undefined') return
  try {
    const body = window.location.hash.replace(/^#/, '')
    const q = body.indexOf('?')
    if (q < 0) return
    const params = new URLSearchParams(body.slice(q + 1))
    if (!params.has('scenario')) return
    params.delete('scenario')
    const qs = params.toString()
    replaceHash(`#${body.slice(0, q)}${qs ? `?${qs}` : ''}`)
  } catch {
    /* history unavailable: the box still closes */
  }
}
