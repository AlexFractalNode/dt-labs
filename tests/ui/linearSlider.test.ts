// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LinearSlider from '../../src/ui/LinearSlider.vue'

describe('LinearSlider', () => {
  it('exposes the formatted value as aria-valuetext', () => {
    const w = mount(LinearSlider, {
      props: { modelValue: 20, min: 1, max: 20, step: 1, label: 'Tiefe', format: (v: number) => (v >= 20 ? 'unbegrenzt' : String(v)) },
    })
    expect(w.find('input').attributes('aria-valuetext')).toBe('unbegrenzt')
    expect(w.find('output').text()).toBe('unbegrenzt')
  })

  it('falls back to the plain number without a formatter', () => {
    const w = mount(LinearSlider, { props: { modelValue: 5, min: 1, max: 20, step: 1, label: 'x' } })
    expect(w.find('input').attributes('aria-valuetext')).toBe('5')
  })
})
