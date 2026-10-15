<script setup lang="ts">
/**
 * Variance panel (exercise 17): the model curve ρσ² + (1 − ρ)σ²/B over the number of trees B for adjustable ρ and σ²,
 * and a measurement of σ², ρ and Var of the forest prediction at the point x* from R fresh synthetic samples. The
 * measurement runs in its own job worker (own client), so retraining the forest for another B never cancels it. The
 * formula is a model assumption: it takes equal tree variance σ² and one common pairwise correlation ρ; the
 * measurement shows how close a real forest comes. All maths is in core (`ensembleVariance`, `measureVariance`).
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { line } from 'd3-shape'
import { DtError, type DtErrorCode } from '../../core/errors'
import type { ForestParams } from '../../core/forest'
import type { GeneratorName } from '../../core/generators'
import { ensembleVariance } from '../../core/variance'
import { useI18n } from '../../i18n'
import Formula from '../../ui/Formula.vue'
import { fmt, fmtValue } from '../../ui/format'
import LinearSlider from '../../ui/LinearSlider.vue'
import PlotFrame from '../../ui/PlotFrame.vue'
import { createJobClient } from '../../worker/client'

export interface MeasureSpec {
  gen: { name: GeneratorName; n: number; noise: number }
  xStar: [number, number]
  params: ForestParams
}
interface Measured {
  sigma2: number
  rho: number | null
  varMeasured: number
  varFormula: number | null
  B: number
  xStar: [number, number]
  key: string
}

const props = defineProps<{
  /** What a measurement would use right now; null if measuring is not possible. */
  spec: MeasureSpec | null
  /** Changes whenever the measurement would give another result (data, forest settings, x*). */
  specKey: string
  /** Trees of the displayed forest (marker in the chart). */
  B: number
  /** All features and no bootstrap: identical trees, ρ = 1. */
  identical: boolean
}>()
const { lang, t } = useI18n()

const REPLICATES = 40
const MAX_B = 300
const WIDTH = 640
const HEIGHT = 300
const TEX = String.raw`\operatorname{Var}\bigl(\bar f_B(x^*)\bigr)=\rho\,\sigma^{2}+\frac{(1-\rho)\,\sigma^{2}}{B}`

const sigma2 = ref(0.1)
const rho = ref(0.4)

// ---- measurement (own worker client) -------------------------------------------------------------------------------
const client = createJobClient()
const run = ref<'idle' | 'loading' | 'error'>('idle')
const error = ref<DtErrorCode | undefined>(undefined)
const progress = ref({ done: 0, total: REPLICATES })
const result = shallowRef<Measured | null>(null)
const cancelled = ref(false)
let token = 0
let cancelFn: (() => void) | null = null

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round2 = (v: number) => Math.round(v * 100) / 100
const round3 = (v: number) => Math.round(v * 1000) / 1000
/** Slider range of σ²; a measured value outside it is clamped (and says so). */
const SIGMA2_MIN = 0.001
const SIGMA2_MAX = 1

function measure(): void {
  const spec = props.spec
  if (spec === null || run.value === 'loading') return
  const key = props.specKey
  const tk = ++token
  run.value = 'loading'
  error.value = undefined
  cancelled.value = false
  progress.value = { done: 0, total: REPLICATES }
  const xStar: [number, number] = [spec.xStar[0], spec.xStar[1]]
  const handle = client.start(
    { kind: 'variance', gen: { ...spec.gen }, xStar, params: spec.params, replicates: REPLICATES },
    (done, total) => {
      if (tk === token) progress.value = { done, total }
    },
  )
  cancelFn = handle.cancel
  handle.promise.then(
    (res) => {
      if (tk !== token) return
      result.value = { ...res, B: spec.params.nEstimators, xStar, key }
      run.value = 'idle'
      // enter the measured values into the model curve (within the slider ranges)
      sigma2.value = round3(clamp(res.sigma2, SIGMA2_MIN, SIGMA2_MAX))
      if (res.rho !== null) rho.value = round2(clamp(res.rho, 0, 1))
    },
    (e: unknown) => {
      if (tk !== token) return
      if (e instanceof DtError && e.code === 'CANCELLED') {
        run.value = 'idle'
        return
      }
      error.value = e instanceof DtError ? e.code : 'WORKER_FAILED'
      run.value = 'error'
    },
  )
}
function cancel(): void {
  if (run.value !== 'loading') return
  token++ // the pending run is obsolete: its (cancelled) promise is ignored
  cancelFn?.()
  cancelFn = null
  run.value = 'idle'
  cancelled.value = true
}
onBeforeUnmount(() => {
  token++
  client.dispose()
})
// a new measurement result replaces the cancel note
watch(result, () => (cancelled.value = false))

// ---- chart ---------------------------------------------------------------------------------------------------------
const curve = computed(() => {
  const pts: { B: number; v: number }[] = []
  for (let b = 1; b <= MAX_B; b++) pts.push({ B: b, v: ensembleVariance(sigma2.value, rho.value, b) })
  return pts
})
/** Limit for B -> infinity (ρσ²), taken from the same core function with a huge B. */
const floorValue = computed(() => ensembleVariance(sigma2.value, rho.value, Number.MAX_SAFE_INTEGER))
const yTop = computed(() => Math.max(sigma2.value, result.value?.varMeasured ?? 0) * 1.08)
const xDomain: [number, number] = [0, MAX_B]
const yDomain = computed<[number, number]>(() => [0, yTop.value])
const modelAt = computed(() => ensembleVariance(sigma2.value, rho.value, props.B))

function path(x: (v: number) => number, y: (v: number) => number): string {
  return (
    line<{ B: number; v: number }>()
      .x((p) => x(p.B))
      .y((p) => y(p.v))(curve.value) ?? ''
  )
}

// ---- display -------------------------------------------------------------------------------------------------------
const attrNumber = (v: number) => String(Number(v.toFixed(6)))
// `empty` until a measurement exists (nothing to read yet); the model curve and sliders work without it.
const unitState = computed(() =>
  run.value === 'loading' ? 'loading' : run.value === 'error' ? 'error' : result.value === null ? 'empty' : 'ready',
)
const sigmaClamped = computed(
  () => result.value !== null && (result.value.sigma2 < SIGMA2_MIN || result.value.sigma2 > SIGMA2_MAX),
)
const shown = computed(() => (run.value === 'loading' ? null : result.value))
const stale = computed(() => result.value !== null && result.value.key !== props.specKey)
const errorText = computed(() => {
  const code = error.value ?? ''
  return code === 'WORKER_FAILED' ? t('forest.error.WORKER_FAILED') : t('forest.error.generic')
})
const xText = (m: Measured) => `(${fmtValue(lang.value, Number(m.xStar[0].toFixed(3)))}; ${fmtValue(lang.value, Number(m.xStar[1].toFixed(3)))})`
</script>

<template>
  <section
    class="variance"
    data-verify-unit="variance"
    :data-verify-state="unitState"
    :data-verify-count="result ? 1 : 0"
    :data-verify-error="unitState === 'error' ? error : undefined"
    :data-verify-sigma2="unitState === 'ready' && shown ? attrNumber(shown.sigma2) : undefined"
    :data-verify-rho="unitState === 'ready' && shown ? (shown.rho === null ? 'none' : attrNumber(shown.rho)) : undefined"
    :data-verify-measured="unitState === 'ready' && shown ? attrNumber(shown.varMeasured) : undefined"
    :data-verify-progress="unitState === 'loading' ? progress.done : undefined"
    :aria-busy="unitState === 'loading'"
  >
    <p class="assumption" data-note="assumption">{{ t('forest.variance.assumption') }}</p>
    <Formula :tex="TEX" display />

    <div class="sliders">
      <div data-param="rho">
        <LinearSlider
          v-model="rho"
          :min="0"
          :max="1"
          :step="0.01"
          :label="t('forest.variance.rho')"
          :format="(v: number) => fmt(lang, v, 2)"
        />
      </div>
      <div data-param="sigma2">
        <LinearSlider
          v-model="sigma2"
          :min="SIGMA2_MIN"
          :max="SIGMA2_MAX"
          :step="0.001"
          :label="t('forest.variance.sigma2')"
          :format="(v: number) => fmt(lang, v, 3)"
        />
      </div>
    </div>
    <p v-if="sigmaClamped && result" class="note hint" data-note="sigma-clamped">
      {{ t('forest.variance.sigmaClamped', { v: fmt(lang, result.sigma2, 4), min: fmt(lang, SIGMA2_MIN, 3) }) }}
    </p>
    <p v-if="identical" class="note hint" data-note="rho-one">{{ t('forest.variance.identical') }}</p>

    <PlotFrame
      :x-domain="xDomain"
      :y-domain="yDomain"
      :width="WIDTH"
      :height="HEIGHT"
      :x-label="t('forest.variance.xLabel')"
      :y-label="t('forest.variance.yLabel')"
    >
      <template #default="{ x, y }">
        <line class="floor" :x1="x(0)" :x2="x(MAX_B)" :y1="y(floorValue)" :y2="y(floorValue)" />
        <line class="current" :x1="x(B)" :x2="x(B)" :y1="y(0)" :y2="y(yTop)" />
        <path class="model" :d="path(x, y)" />
        <circle class="model-dot" :cx="x(B)" :cy="y(modelAt)" r="4" />
        <path
          v-if="shown"
          class="measured"
          :transform="`translate(${x(shown.B)},${y(shown.varMeasured)})`"
          d="M0,-6 L6,0 L0,6 L-6,0 Z"
        />
      </template>
    </PlotFrame>
    <ul class="legend" aria-hidden="true">
      <li><span class="key model" />{{ t('forest.variance.legendModel') }}</li>
      <li><span class="key floor" />{{ t('forest.variance.legendFloor', { v: fmt(lang, floorValue, 4) }) }}</li>
      <li><span class="key current" />{{ t('forest.variance.legendCurrent', { B }) }}</li>
      <li><span class="key diamond" />{{ t('forest.variance.legendMeasured') }}</li>
    </ul>

    <div class="measure">
      <div class="bar">
        <button
          type="button"
          class="btn primary"
          data-action="measure"
          :disabled="spec === null || run === 'loading'"
          @click="measure"
        >
          {{ t('forest.variance.measure') }}
        </button>
        <button type="button" class="btn" data-action="cancel" :disabled="run !== 'loading'" @click="cancel">
          {{ t('forest.variance.cancel') }}
        </button>
      </div>
      <p class="note">{{ t('forest.variance.measureHelp', { R: REPLICATES }) }}</p>

      <div v-if="run === 'loading'" class="progress" role="status">
        <progress :max="progress.total" :value="progress.done" />
        <span>{{ t('forest.variance.progress', { done: progress.done, total: progress.total }) }}</span>
      </div>
      <p v-else-if="run === 'error'" class="error-box" role="alert">{{ errorText }}</p>
      <p v-else-if="cancelled" class="note" data-note="cancelled" role="status">{{ t('forest.variance.cancelled') }}</p>

      <template v-if="result">
        <p class="note" :class="{ stale: run === 'loading' }" data-note="subject">
          {{ t('forest.variance.subject', { B: result.B, x: xText(result), R: REPLICATES }) }}
        </p>
        <p v-if="stale" class="note hint" data-note="stale">{{ t('forest.variance.stale') }}</p>
        <dl class="cards" :class="{ dim: run === 'loading' }" data-result>
          <div class="card">
            <dt>{{ t('forest.variance.cardSigma2') }}</dt>
            <dd>{{ fmt(lang, result.sigma2, 4) }}</dd>
          </div>
          <div class="card">
            <dt>{{ t('forest.variance.cardRho') }}</dt>
            <dd v-if="result.rho !== null">{{ fmt(lang, result.rho, 3) }}</dd>
            <dd v-else class="small" data-note="no-spread">{{ t('forest.variance.noSpread') }}</dd>
          </div>
          <div class="card">
            <dt>{{ t('forest.variance.cardMeasured') }}</dt>
            <dd>{{ fmt(lang, result.varMeasured, 4) }}</dd>
          </div>
          <div class="card">
            <dt>{{ t('forest.variance.cardFormula') }}</dt>
            <dd>{{ result.varFormula === null ? '–' : fmt(lang, result.varFormula, 4) }}</dd>
          </div>
        </dl>
        <p class="note">{{ t('forest.variance.cardsNote') }}</p>
      </template>
      <p v-else-if="run !== 'loading'" class="note" data-note="none-yet">{{ t('forest.variance.none') }}</p>
    </div>
  </section>
</template>

<style scoped>
.variance {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
}
.assumption {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  padding: 0.4rem 0.6rem;
  border-left: 3px solid var(--accent);
  background: var(--bg);
}
.sliders {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0 1.2rem;
}
.note {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-muted);
}
.note.hint {
  padding: 0.4rem 0.6rem;
  border-left: 3px solid var(--focus);
  background: var(--bg);
  color: var(--text);
}
.note.stale {
  opacity: 0.6;
}
.model {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2.2;
}
.model-dot {
  fill: var(--accent);
}
.floor {
  stroke: var(--text-muted);
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
}
.current {
  stroke: var(--focus);
  stroke-width: 2;
  stroke-dasharray: 2 3;
}
.measured {
  fill: var(--surface);
  stroke: var(--text);
  stroke-width: 2;
}
.legend {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1.1rem;
  margin: 0;
  padding: 0;
  font-size: 0.85rem;
}
.key {
  display: inline-block;
  width: 1.4rem;
  height: 0;
  margin-right: 0.4rem;
  vertical-align: middle;
  border-top: 2px solid var(--accent);
}
.key.floor {
  border-top: 2px dashed var(--text-muted);
}
.key.current {
  border-top: 2px dotted var(--focus);
}
.key.diamond {
  width: 0.55rem;
  height: 0.55rem;
  border: 2px solid var(--text);
  transform: rotate(45deg);
  margin-right: 0.6rem;
}
.measure {
  display: grid;
  gap: 0.5rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border);
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.progress {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.8rem;
  font-size: 0.85rem;
}
.progress progress {
  width: min(16rem, 100%);
  accent-color: var(--accent);
}
.error-box {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--error);
  border-left-width: 4px;
  border-radius: 4px;
  background: var(--error-bg);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.5rem;
  margin: 0;
}
.cards.dim dd {
  opacity: 0.5;
}
.card {
  padding: 0.45rem 0.6rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  min-width: 0;
}
.card dt {
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.card dd {
  margin: 0.1rem 0 0;
  font-family: var(--serif);
  font-size: 1.35rem;
  font-variant-numeric: tabular-nums;
}
.card dd.small {
  font-family: inherit;
  font-size: 0.9rem;
}
</style>
