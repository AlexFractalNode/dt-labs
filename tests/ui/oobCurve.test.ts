// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OobCurve from '../../src/tools/forest/OobCurve.vue'

const base = { state: 'ready' as const, bootstrap: true, points: [{ B: 5, score: 0.9, uncovered: 1 }], n: 20 }

describe('OobCurve CV reference', () => {
  it('names the real reason when a class has too few cases', () => {
    const w = mount(OobCurve, { props: { ...base, cv: { state: 'error', code: 'TOO_FEW_PER_CLASS' } } })
    expect(w.get('[data-card="cv"]').text()).toContain('weniger als 2')
    expect(w.attributes('data-verify-cv-error')).toBe('TOO_FEW_PER_CLASS')
  })

  it('does not blame the class counts for other errors', () => {
    const w = mount(OobCurve, { props: { ...base, cv: { state: 'error', code: 'BAD_PARAM' } } })
    expect(w.get('[data-card="cv"]').text()).not.toContain('weniger als 2')
    expect(w.get('[data-card="cv"]').text()).toContain('Für diese Einstellungen ist keine CV möglich')
    expect(w.attributes('data-verify-cv-error')).toBe('BAD_PARAM')
  })
})
