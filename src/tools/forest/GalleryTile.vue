<script setup lang="ts">
/**
 * One tree of the gallery: its leaf regions with the bootstrap sample on top. Point size grows with the number of
 * times the case was drawn; cases that were not drawn (out of bag) are hollow. The class is shown by shape (circle /
 * square) and colour. Provides the plot scales for the shared RegionLayer; no axes, the tile is only a thumbnail.
 */
import { computed, provide } from 'vue'
import { scaleLinear } from 'd3-scale'
import type { Bounds } from '../../core/generators'
import type { Region } from '../../core/regions'
import RegionLayer from '../../ui/RegionLayer.vue'
import { PLOT_SCALES, type PlotScales } from '../../ui/plotScales'

const props = defineProps<{
  regions: Region[]
  counts: number[]
  X: number[][]
  y: number[]
  bounds: Bounds
  colors: string[]
  label: string
}>()

const WIDTH = 200
const HEIGHT = 150
const xScale = computed(() => scaleLinear().domain([props.bounds.x0, props.bounds.x1]).range([0, WIDTH]))
const yScale = computed(() => scaleLinear().domain([props.bounds.y0, props.bounds.y1]).range([HEIGHT, 0]))
provide(
  PLOT_SCALES,
  computed<PlotScales>(() => ({ x: xScale.value, y: yScale.value, toData: () => null })),
)

/** Radius from the draw count: 1 draw -> 2.6, grows with the square root. */
const radius = (c: number) => 2.2 + 0.9 * Math.sqrt(Math.max(1, c))

const dots = computed(() =>
  props.X.map((p, i) => {
    const c = props.counts[i] ?? 0
    const cls = props.y[i] % 3
    return { cx: xScale.value(p[0]), cy: yScale.value(p[1]), r: radius(c), hollow: c === 0, cls }
  }),
)
</script>

<template>
  <svg class="tile" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" role="img" :aria-label="label" data-tile>
    <RegionLayer :regions="regions" :colors="colors" />
    <g class="dots" aria-hidden="true">
      <template v-for="(d, i) in dots" :key="i">
        <rect
          v-if="d.cls === 1"
          class="dot"
          :class="{ hollow: d.hollow }"
          :style="{ '--dot': `var(--c-class-${d.cls})` }"
          :x="d.cx - d.r"
          :y="d.cy - d.r"
          :width="2 * d.r"
          :height="2 * d.r"
        />
        <circle
          v-else
          class="dot"
          :class="{ hollow: d.hollow }"
          :style="{ '--dot': `var(--c-class-${d.cls})` }"
          :cx="d.cx"
          :cy="d.cy"
          :r="d.r"
        />
      </template>
    </g>
  </svg>
</template>

<style scoped>
.tile {
  display: block;
  width: 100%;
  height: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 3px;
}
.dot {
  fill: var(--dot);
  stroke: var(--c-points);
  stroke-width: 0.8;
}
.dot.hollow {
  fill: none;
  stroke: var(--dot);
  stroke-width: 1.2;
}
</style>
