<script setup lang="ts">
import { computed, inject, onMounted, ref, watch, type ComputedRef } from 'vue'
import type { Bounds } from '../core/generators'
import { mixGrid, parseHexColor, type Rgb } from './colors'
import { PLOT_SCALES, type PlotScales } from './plotScales'

/**
 * Class probabilities on a G x G grid (layout of `probaGrid`: row 0 = lowest y) drawn into a canvas that is
 * stretched over `bounds` (default: the whole plot domain). `colors` are `#rgb` / `#rrggbb` per class.
 */
const props = defineProps<{
  grid: Float64Array
  G: number
  nClasses: number
  colors: string[]
  bounds?: Bounds
}>()
const scales = inject<ComputedRef<PlotScales>>(PLOT_SCALES)!
const canvas = ref<HTMLCanvasElement | null>(null)

const rect = computed(() => {
  const [dx0, dx1] = scales.value.x.domain()
  const [dy0, dy1] = scales.value.y.domain()
  const b = props.bounds ?? { x0: dx0, x1: dx1, y0: dy0, y1: dy1 }
  const xa = scales.value.x(b.x0)
  const xb = scales.value.x(b.x1)
  const ya = scales.value.y(b.y0)
  const yb = scales.value.y(b.y1)
  return { x: Math.min(xa, xb), y: Math.min(ya, yb), width: Math.abs(xb - xa), height: Math.abs(yb - ya) }
})

const FALLBACK: Rgb = [128, 128, 128]
function draw() {
  const el = canvas.value
  const ctx = el?.getContext?.('2d') ?? null
  if (!el || !ctx || props.grid.length < props.G * props.G * props.nClasses) return
  const rgb = props.colors.map((c) => parseHexColor(c) ?? FALLBACK)
  if (rgb.length === 0) rgb.push(FALLBACK)
  const pixels = mixGrid(props.grid, props.G, props.nClasses, rgb)
  ctx.putImageData(new ImageData(pixels, props.G, props.G), 0, 0)
}

onMounted(draw)
watch(() => [props.grid, props.G, props.nClasses, props.colors], draw, { flush: 'post' })
</script>

<template>
  <foreignObject
    data-layer="grid"
    :x="rect.x"
    :y="rect.y"
    :width="rect.width"
    :height="rect.height"
    aria-hidden="true"
  >
    <canvas ref="canvas" :width="G" :height="G" class="grid-canvas" />
  </foreignObject>
</template>

<style scoped>
.grid-canvas {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
  pointer-events: none;
}
</style>
