import type { MessageKey } from './i18n'

export type Route = 'home' | 'splits' | 'complexity' | 'forest'

const ROUTES: readonly Route[] = ['home', 'splits', 'complexity', 'forest']

export function parseHash(hash: string): {
  route: Route
  params: URLSearchParams
  unknownRoute: boolean
} {
  const body = hash.replace(/^#/, '')
  const qIndex = body.indexOf('?')
  const path = qIndex >= 0 ? body.slice(0, qIndex) : body
  const params = new URLSearchParams(qIndex >= 0 ? body.slice(qIndex + 1) : '')
  const name = path.replace(/^\/+/, '').replace(/\/+$/, '')
  if (name === '') return { route: 'home', params, unknownRoute: false }
  if ((ROUTES as readonly string[]).includes(name)) {
    return { route: name as Route, params, unknownRoute: false }
  }
  return { route: 'home', params, unknownRoute: true }
}

export function buildHash(route: Route, params?: Record<string, string>): string {
  const path = route === 'home' ? '#/' : `#/${route}`
  const qs = params ? new URLSearchParams(params).toString() : ''
  return qs ? `${path}?${qs}` : path
}

/** Problems in the parsed URL that warrant a notice; empty when the URL is fine. */
export function urlProblems(state: {
  route: Route
  params: URLSearchParams
  unknownRoute: boolean
}): MessageKey[] {
  return state.unknownRoute ? ['notice.invalidUrl'] : []
}
