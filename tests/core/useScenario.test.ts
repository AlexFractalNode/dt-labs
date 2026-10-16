// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, watch, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

/*
 * Browsers never fire `hashchange` for history.replaceState; happy-dom does (asynchronously). Emulate the browser:
 * a capture listener registered before any router listener swallows the event that follows a replaceState call that
 * changed the hash.
 */
let swallow = 0
const nativeReplaceState = history.replaceState.bind(history)
history.replaceState = (state: unknown, unused: string, url?: string | URL | null) => {
  const before = window.location.hash
  nativeReplaceState(state, unused, url)
  if (window.location.hash !== before) swallow++
}
window.addEventListener(
  'hashchange',
  (e) => {
    if (swallow > 0) {
      swallow--
      e.stopImmediatePropagation()
    }
  },
  true,
)

/** Lets happy-dom deliver pending hashchange events and Vue flush its queues. */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 30))
  await nextTick()
  await nextTick()
}

async function setHash(hash: string): Promise<void> {
  window.location.hash = hash
  await settle()
}

type UseScenario = typeof import('../../src/tools/useScenario')
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  await setHash('#/')
  swallow = 0
  vi.resetModules()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

interface Harness {
  mod: UseScenario
  api: ReturnType<UseScenario['useScenario']>
  calls: string[]
  current: Ref<Record<string, string>>
}

/**
 * Mounts a stand-in view for `tool`: it adopts the route state in its own route watcher (registered AFTER
 * useScenario, the unfavourable order) and logs actions together with the state adopted at that moment.
 */
async function mountView(tool: 'splits' | 'forest', hash: string): Promise<Harness> {
  await setHash(hash)
  const mod: UseScenario = await import('../../src/tools/useScenario')
  const { useRoute } = await import('../../src/router')
  const calls: string[] = []
  const current = ref<Record<string, string>>({})
  let api!: Harness['api']
  const View = defineComponent({
    setup() {
      const route = useRoute()
      const adopted = ref('')
      const adopt = () => {
        adopted.value = route.value.params.toString()
      }
      api = mod.useScenario(tool, () => current.value, {
        voteExample: () => calls.push(`voteExample@${adopted.value}`),
        measureVariance: () => calls.push(`measureVariance@${adopted.value}`),
      })
      adopt()
      watch(() => route.value, adopt)
      return () => h('div')
    },
  })
  wrapper = mount(View)
  await settle()
  return { mod, api, calls, current }
}

describe('useScenario', () => {
  it('runs the action once after setup, after the view adopted the address', async () => {
    const { api, calls } = await mountView('forest', '#/forest?scenario=f2')
    expect(api.active.value?.id).toBe('f2')
    expect(api.problems.value).toEqual([])
    expect(calls).toEqual(['voteExample@scenario=f2'])
  })

  it('does not run the action again after writeToolQuery or removeScenarioParam', async () => {
    const { calls } = await mountView('forest', '#/forest?scenario=f2')
    const { writeToolQuery, removeScenarioParam } = await import('../../src/tools/scenarioUrl')
    writeToolQuery('forest', { B: '50' })
    await settle()
    expect(window.location.hash).toBe('#/forest?B=50&scenario=f2')
    removeScenarioParam()
    await settle()
    expect(window.location.hash).toBe('#/forest?B=50')
    expect(calls).toHaveLength(1)
  })

  it('re-runs the action when applying the identical address (refreshRoute)', async () => {
    const { api, calls } = await mountView('forest', '#/forest?scenario=f2')
    api.apply(api.active.value!)
    await settle()
    expect(window.location.hash).toBe('#/forest?scenario=f2')
    expect(calls).toEqual(['voteExample@scenario=f2', 'voteExample@scenario=f2'])
    api.restore()
    await settle()
    expect(calls).toHaveLength(3)
  })

  it('treats a reordered address as identical and keeps lang', async () => {
    const { api, calls } = await mountView('forest', '#/forest?scenario=f3&lang=en&mf=2&bootstrap=0')
    expect(calls).toHaveLength(1)
    api.restore()
    await settle()
    expect(window.location.hash).toBe('#/forest?scenario=f3&lang=en&mf=2&bootstrap=0')
    expect(calls).toHaveLength(2)
  })

  it('navigates to another scenario and runs its action once', async () => {
    const { mod, api, calls } = await mountView('forest', '#/forest?scenario=f2&lang=en')
    const { scenarioById } = await import('../../src/tools/scenarios')
    api.apply(scenarioById('f3')!)
    await settle()
    expect(window.location.hash).toBe('#/forest?bootstrap=0&mf=2&scenario=f3&lang=en')
    expect(api.active.value?.id).toBe('f3')
    expect(calls).toEqual(['voteExample@scenario=f2&lang=en', 'measureVariance@bootstrap=0&mf=2&scenario=f3&lang=en'])
    // applying from outside the view (help drawer) behaves the same
    mod.applyScenario(scenarioById('f2')!)
    await settle()
    expect(calls).toHaveLength(3)
    expect(calls[2]).toBe('voteExample@scenario=f2&lang=en')
  })

  it('runs the action once when the address changes on the same route', async () => {
    const { api, calls } = await mountView('forest', '#/forest')
    expect(api.active.value).toBeNull()
    expect(calls).toEqual([])
    await setHash('#/forest?scenario=f2')
    expect(api.active.value?.id).toBe('f2')
    expect(calls).toEqual(['voteExample@scenario=f2'])
  })

  it('dismiss clears active and scenario stays out of later writes', async () => {
    const { api, calls } = await mountView('forest', '#/forest?B=100&scenario=f1')
    expect(api.active.value?.id).toBe('f1')
    api.dismiss()
    expect(api.active.value).toBeNull()
    expect(window.location.hash).toBe('#/forest?B=100')
    const { writeToolQuery } = await import('../../src/tools/scenarioUrl')
    writeToolQuery('forest', { B: '20' })
    await settle()
    expect(window.location.hash).toBe('#/forest?B=20')
    expect(api.active.value).toBeNull()
    expect(calls).toEqual([])
  })

  it('reports an unknown or foreign scenario and runs nothing', async () => {
    const { api, calls } = await mountView('forest', '#/forest?scenario=zz')
    expect(api.active.value).toBeNull()
    expect(api.problems.value).toEqual(['url.problem.scenario'])
    await setHash('#/forest?scenario=s1')
    expect(api.active.value).toBeNull()
    expect(api.problems.value).toEqual(['url.problem.scenario'])
    await setHash('#/forest?scenario=f2')
    expect(api.problems.value).toEqual([])
    expect(calls).toEqual(['voteExample@scenario=f2'])
  })

  it('reports deviation from the scenario query', async () => {
    const { api, current } = await mountView('splits', '#/splits?preset=speed&scenario=s1')
    current.value = { preset: 'speed' }
    expect(api.deviated.value).toBe(false)
    current.value = { preset: 'speed', criterion: 'gini' }
    expect(api.deviated.value).toBe(true)
    api.dismiss()
    expect(api.deviated.value).toBe(false)
  })
})
