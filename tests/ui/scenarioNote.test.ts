// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import ScenarioNote from '../../src/ui/ScenarioNote.vue'
import ScenarioBar from '../../src/ui/ScenarioBar.vue'
import ScenarioArea from '../../src/ui/ScenarioArea.vue'
import type { ScenarioApi } from '../../src/tools/useScenario'
import { scenarioById, type Scenario } from '../../src/tools/scenarios'
import { setLang } from '../../src/i18n'
import de from '../../src/i18n/de'
import en from '../../src/i18n/en'

setLang('de')
const s1 = scenarioById('s1') as Scenario

describe('ScenarioNote', () => {
  it('renders title and the three sections when ready', () => {
    const w = mount(ScenarioNote, { props: { scenario: s1, deviated: false } })
    const root = w.find('[data-verify-unit="scenario-note"]')
    expect(root.attributes('data-verify-state')).toBe('ready')
    expect(root.attributes('data-verify-deviated')).toBe('false')
    expect(root.attributes('hidden')).toBeUndefined()
    const text = w.text()
    expect(text).toContain(de.scenario.s1.title)
    expect(text).toContain(de.scenario.noteSee)
    expect(text).toContain(de.scenario.s1.see)
    expect(text).toContain(de.scenario.noteWatch)
    expect(text).toContain(de.scenario.s1.watch)
    expect(text).toContain(de.scenario.noteNext)
    expect(text).toContain(de.scenario.s1.next)
    expect(w.find('[data-action="restore"]').exists()).toBe(false)
    // the box itself is no live region; a permanent sibling outside it announces only the title
    expect(root.find('[role="status"]').exists()).toBe(false)
    expect(root.attributes('aria-live')).toBeUndefined()
    const live = w.find('[role="status"]')
    expect(live.attributes('aria-live')).toBe('polite')
    expect(live.attributes('aria-atomic')).toBe('true')
    expect(live.classes()).toContain('sr-only')
    expect(live.text()).toBe(de.scenario.s1.title)
  })

  it('shows the deviation hint with a restore button', async () => {
    const w = mount(ScenarioNote, { props: { scenario: s1, deviated: true } })
    expect(w.find('[data-verify-unit="scenario-note"]').attributes('data-verify-deviated')).toBe('true')
    expect(w.text()).toContain(de.scenario.changed)
    expect(w.find('[role="status"]').text()).toBe(`${de.scenario.s1.title} ${de.scenario.changed}`)
    const restore = w.find('[data-action="restore"]')
    expect(restore.text()).toBe(de.scenario.restore)
    await restore.trigger('click')
    expect(w.emitted('restore')).toHaveLength(1)
  })

  it('emits close from the × button', async () => {
    const w = mount(ScenarioNote, { props: { scenario: s1, deviated: false } })
    const close = w.find('[data-action="close"]')
    expect(close.attributes('aria-label')).toBe(de.scenario.close)
    await close.trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('keeps an empty, hidden root and the live region without a scenario', () => {
    const w = mount(ScenarioNote, { props: { scenario: null, deviated: false } })
    const root = w.find('[data-verify-unit="scenario-note"]')
    expect(root.exists()).toBe(true)
    expect(root.attributes('data-verify-state')).toBe('empty')
    expect(root.attributes('hidden')).toBeDefined()
    const live = w.find('[role="status"]')
    expect(live.exists()).toBe(true)
    expect(live.text()).toBe('')
    expect(root.find('[role="status"]').exists()).toBe(false)
    expect(w.find('h3').exists()).toBe(false)
  })

  it('updates the announcement when a scenario arrives or the user deviates', async () => {
    const w = mount(ScenarioNote, { props: { scenario: null, deviated: false } })
    const live = w.find('[role="status"]')
    await w.setProps({ scenario: s1 })
    expect(w.find('[role="status"]').element).toBe(live.element)
    expect(live.text()).toBe(de.scenario.s1.title)
    expect(w.find('[data-verify-unit="scenario-note"]').attributes('hidden')).toBeUndefined()
    await w.setProps({ deviated: true })
    expect(live.text()).toBe(`${de.scenario.s1.title} ${de.scenario.changed}`)
  })

  it('keeps the announcement on a language toggle and re-announces on a new scenario', async () => {
    setLang('de')
    const w = mount(ScenarioNote, { props: { scenario: s1, deviated: false } })
    const live = w.find('[role="status"]')
    expect(live.text()).toBe(de.scenario.s1.title)
    setLang('en')
    await w.vm.$nextTick()
    expect(w.find('h3').text()).toBe(en.scenario.s1.title) // the box follows the language
    expect(live.text()).toBe(de.scenario.s1.title) // the live region does not announce again
    await w.setProps({ scenario: scenarioById('s2') as Scenario })
    expect(live.text()).toBe(en.scenario.s2.title)
    setLang('de')
  })
})

describe('ScenarioArea focus', () => {
  function fakeApi(deviatedNow: boolean) {
    const active = shallowRef<Scenario | null>(scenarioById('s2') as Scenario)
    const deviated = shallowRef(deviatedNow)
    const api: ScenarioApi = {
      active,
      deviated: computed(() => active.value !== null && deviated.value),
      problems: shallowRef([]),
      apply: vi.fn(),
      dismiss: vi.fn(() => {
        active.value = null
      }),
      restore: vi.fn(() => {
        deviated.value = false
      }),
    }
    return api
  }

  it('moves the focus from the closed note to the card of that scenario', async () => {
    const w = mount(ScenarioArea, { props: { tool: 'splits', scenario: fakeApi(false) }, attachTo: document.body })
    ;(w.find('[data-action="close"]').element as HTMLElement).focus()
    await w.find('[data-action="close"]').trigger('click')
    await w.vm.$nextTick()
    expect(document.activeElement).toBe(w.find('button[data-scenario="s2"]').element)
    w.unmount()
  })

  it('moves the focus to the note title after restore removed the button', async () => {
    const w = mount(ScenarioArea, { props: { tool: 'splits', scenario: fakeApi(true) }, attachTo: document.body })
    ;(w.find('[data-action="restore"]').element as HTMLElement).focus()
    await w.find('[data-action="restore"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('[data-action="restore"]').exists()).toBe(false)
    const title = w.find('h3.note-title')
    expect(title.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(title.element)
    w.unmount()
  })
})

describe('ScenarioBar', () => {
  it('renders the three scenarios of the tool as pressed/unpressed buttons', async () => {
    const w = mount(ScenarioBar, { props: { tool: 'splits', activeId: 's2' } })
    const root = w.find('[data-verify-unit="scenario-bar"]')
    expect(root.attributes('data-verify-state')).toBe('ready')
    expect(root.attributes('data-verify-count')).toBe('3')
    expect(root.attributes('role')).toBe('group')
    expect(root.attributes('aria-label')).toBe(de.scenario.barLabel)
    const cards = w.findAll('button[data-scenario]')
    expect(cards.map((c) => c.attributes('data-scenario'))).toEqual(['s1', 's2', 's3'])
    expect(cards.map((c) => c.attributes('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(cards[0].text()).toContain(de.scenario.s1.title)
    expect(cards[0].text()).toContain(de.scenario.s1.short)
    await cards[2].trigger('click')
    expect(w.emitted('apply')).toEqual([[scenarioById('s3')]])
  })
})
