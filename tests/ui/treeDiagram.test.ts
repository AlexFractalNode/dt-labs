// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, provide, computed } from 'vue'
import { scaleLinear } from 'd3-scale'
import TreeDiagram from '../../src/ui/TreeDiagram.vue'
import UrlNotice from '../../src/ui/UrlNotice.vue'
import BarList from '../../src/ui/BarList.vue'
import RootSlider from '../../src/ui/RootSlider.vue'
import RegionLayer from '../../src/ui/RegionLayer.vue'
import GridLayer from '../../src/ui/GridLayer.vue'
import { PLOT_SCALES } from '../../src/ui/plotScales'
import { mixGrid, parseHexColor } from '../../src/ui/colors'
import type { DiagramNode } from '../../src/ui/treeLayout'

const nodes: DiagramNode[] = [
  { id: 0, parent: -1, side: null, title: 'x <= 1.5', detail: 'n=4', counts: [2, 2], leaf: false },
  { id: 1, parent: 0, side: 'L', title: 'class A', detail: 'n=2', counts: [2, 0], leaf: true },
  { id: 2, parent: 0, side: 'R', title: '<b>class B</b>', detail: 'n=2', counts: [0, 2], leaf: true },
]

describe('TreeDiagram', () => {
  it('emits select on node click and marks the path', async () => {
    const w = mount(TreeDiagram, { props: { nodes, focus: 0, path: [0, 2] } })
    const root = w.get('[data-verify-unit="tree"]')
    expect(root.attributes('data-verify-state')).toBe('ready')
    expect(root.attributes('data-verify-count')).toBe('3')
    const el = (id: number) => w.get(`[data-node-id="${id}"]`)
    expect(el(0).attributes('data-on-path')).toBe('true')
    expect(el(2).attributes('data-on-path')).toBe('true')
    expect(el(1).attributes('data-on-path')).toBe('false')
    expect(el(0).attributes('data-focused')).toBe('true')
    expect(el(1).attributes('data-focused')).toBe('false')
    await el(1).trigger('click')
    await el(2).trigger('keydown', { key: 'Enter' })
    expect(w.emitted('select')).toEqual([[1], [2]])
  })

  it('shows user strings as text, never as markup', () => {
    const w = mount(TreeDiagram, { props: { nodes } })
    expect(w.find('b').exists()).toBe(false)
    expect(w.text()).toContain('<b>class B</b>')
  })

  it('reports empty for no nodes and counts only visible nodes when collapsed', () => {
    const empty = mount(TreeDiagram, { props: { nodes: [] } })
    expect(empty.get('[data-verify-unit="tree"]').attributes('data-verify-state')).toBe('empty')
    expect(empty.get('[data-verify-unit="tree"]').attributes('data-verify-count')).toBe('0')
    const w = mount(TreeDiagram, { props: { nodes, collapseDepth: 0 } })
    expect(w.get('[data-verify-unit="tree"]').attributes('data-verify-count')).toBe('1')
    expect(w.get('[data-node-id="0"]').text()).toContain('+2')
  })
})

describe('UrlNotice', () => {
  it('is empty without problems and lists translated problems otherwise', () => {
    const none = mount(UrlNotice, { props: { problems: [] } })
    expect(none.get('[data-verify-unit="url-notice"]').attributes('data-verify-state')).toBe('empty')
    expect(none.get('[data-verify-unit="url-notice"]').attributes('data-verify-count')).toBe('0')
    expect(none.find('li').exists()).toBe(false)
    const w = mount(UrlNotice, { props: { problems: ['url.problem.preset', 'url.problem.alpha'] } })
    const root = w.get('[data-verify-unit="url-notice"]')
    expect(root.attributes('data-verify-state')).toBe('ready')
    expect(root.attributes('data-verify-count')).toBe('2')
    expect(w.findAll('li').length).toBe(2)
    expect(w.text()).not.toContain('url.problem')
  })
})

describe('BarList', () => {
  it('renders one bar per item with escaped labels', () => {
    const w = mount(BarList, { props: { items: [{ label: '<i>x1</i>', value: 0.75 }, { label: 'x2', value: 0.25 }] } })
    const root = w.get('[data-verify-unit="bar-list"]')
    expect(root.attributes('data-verify-count')).toBe('2')
    expect(w.find('i').exists()).toBe(false)
    expect(w.findAll('[data-bar]').length).toBe(2)
    expect(w.get('[data-bar="0"]').attributes('style')).toContain('75%')
  })
})

describe('RootSlider', () => {
  it('maps slider position p to min + (max - min) * p^2', async () => {
    const w = mount(RootSlider, { props: { modelValue: 0.25, min: 0, max: 1, label: 'alpha' } })
    const input = w.get('input')
    expect((input.element as HTMLInputElement).value).toBe('0.5')
    await input.setValue('0.5')
    await input.setValue('1')
    await input.setValue('0.4472')
    expect(w.emitted('update:modelValue')).toEqual([[0.25], [1], [0.2]])
    expect(w.get('output').text()).toBe('0.25')
  })
})

function withScales(child: ReturnType<typeof defineComponent>, props: Record<string, unknown>) {
  const Host = defineComponent({
    setup() {
      const scales = computed(() => ({
        x: scaleLinear().domain([0, 1]).range([0, 100]),
        y: scaleLinear().domain([0, 1]).range([100, 0]),
        toData: () => null,
      }))
      provide(PLOT_SCALES, scales)
      return () => h('svg', [h(child, props)])
    },
  })
  return mount(Host)
}

describe('plot layers', () => {
  it('RegionLayer draws one rectangle per region in the class colour', () => {
    const w = withScales(RegionLayer as never, {
      regions: [
        { x0: 0, x1: 0.5, y0: 0, y1: 1, proba: [1, 0] },
        { x0: 0.5, x1: 1, y0: 0, y1: 1, proba: [0.2, 0.8] },
      ],
      colors: ['#ff0000', '#0000ff'],
    })
    const rects = w.findAll('rect[data-region]')
    expect(rects.length).toBe(2)
    expect(rects[0].attributes('fill')).toBe('#ff0000')
    expect(rects[1].attributes('fill')).toBe('#0000ff')
    expect(Number(rects[0].attributes('fill-opacity'))).toBeGreaterThan(Number(rects[1].attributes('fill-opacity')))
    expect(rects[0].attributes('width')).toBe('50')
    expect(rects[0].attributes('height')).toBe('100')
  })

  it('GridLayer renders a canvas of G x G cells', () => {
    const grid = new Float64Array([1, 0, 0, 1, 0.5, 0.5, 0, 1])
    const w = withScales(GridLayer as never, { grid, G: 2, nClasses: 2, colors: ['#ff0000', '#0000ff'] })
    const canvas = w.get('canvas')
    expect(canvas.attributes('width')).toBe('2')
    expect(canvas.attributes('height')).toBe('2')
  })

  it('mixGrid blends class colours by probability with row 0 at the bottom', () => {
    const rgb = [parseHexColor('#ff0000')!, parseHexColor('#0000ff')!]
    // cells: row 0 = [class 0, class 1], row 1 = [50/50, class 1]
    const px = mixGrid(new Float64Array([1, 0, 0, 1, 0.5, 0.5, 0, 1]), 2, 2, rgb, 255)
    // canvas row 0 (top) is grid row 1
    expect(Array.from(px.slice(0, 4))).toEqual([128, 0, 128, 255])
    expect(Array.from(px.slice(4, 8))).toEqual([0, 0, 255, 255])
    expect(Array.from(px.slice(8, 12))).toEqual([255, 0, 0, 255])
    expect(parseHexColor('nope')).toBeNull()
    expect(parseHexColor('#0f0')).toEqual([0, 255, 0])
  })
})
