<script setup lang="ts">
import { computed, inject, type ComputedRef } from 'vue'
import type { Region } from '../core/regions'
import { PLOT_SCALES, type PlotScales } from './plotScales'

/**
 * Leaf rectangles of a tree: fill = colour of the majority class, saturation (opacity) grows with its share,
 * from 0.15 at a tie to 0.75 for a pure leaf.
 */
const props = defineProps<{ regions: Region[]; colors: string[] }>()
const scales = inject<ComputedRef<PlotScales>>(PLOT_SCALES)!

const MIN_OPACITY = 0.15
const MAX_OPACITY = 0.75

const rects = computed(() =>
  props.regions.map((r) => {
    let best = 0
    for (let c = 1; c < r.proba.length; c++) if (r.proba[c] > r.proba[best]) best = c
    const k = Math.max(2, r.proba.length)
    const share = r.proba[best] ?? 0
    const t = Math.min(1, Math.max(0, (share - 1 / k) / (1 - 1 / k)))
    const xa = scales.value.x(r.x0)
    const xb = scales.value.x(r.x1)
    const ya = scales.value.y(r.y0)
    const yb = scales.value.y(r.y1)
    return {
      x: Math.min(xa, xb),
      y: Math.min(ya, yb),
      width: Math.abs(xb - xa),
      height: Math.abs(yb - ya),
      fill: props.colors[best % props.colors.length] ?? 'currentColor',
      opacity: MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * t,
    }
  }),
)
</script>

<template>
  <g data-layer="regions" :data-count="regions.length" aria-hidden="true">
    <rect
      v-for="(r, i) in rects"
      :key="i"
      data-region
      :x="r.x"
      :y="r.y"
      :width="r.width"
      :height="r.height"
      :fill="r.fill"
      :fill-opacity="r.opacity"
    />
  </g>
</template>
