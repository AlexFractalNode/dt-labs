<script setup lang="ts">
/**
 * Validation curve of one parameter (max_depth or ccp_alpha): training and CV accuracy per value, CV band of one
 * standard deviation, the current value marked, and the size of the evaluated grid. The numbers come from the job
 * worker (core `validationCurve`); this component only draws them. Earlier points stay visible (dimmed) while a new
 * run is computing, so the panel does not jump.
 */
import { computed } from 'vue'
import { area, line } from 'd3-shape'
import { useI18n, type MessageKey } from '../../i18n'
import { fmt, fmtValue } from '../../ui/format'
import PlotFrame from '../../ui/PlotFrame.vue'
import { COMPLEXITY_CURVES, type ComplexityState } from './state'

export interface CurvePoint {
  value: number | null
  trainMean: number
  cvMean: number
  cvStd: number
}

const props = defineProps<{
  state: 'loading' | 'ready' | 'error'
  /** DtErrorCode when `state` is 'error'. */
  error?: string
  param: ComplexityState['curve']
  points: CurvePoint[]
  /** Number of values of the planned grid (known before the run finishes). */
  nValues: number
  /** Folds of the CV; null if the CV is impossible. */
  k: number | null
  /** Current value of the parameter; null = max_depth unbounded. */
  current: number | null
}>()
const emit = defineEmits<{ 'update:param': [p: ComplexityState['curve']] }>()
const { lang, t } = useI18n()

const WIDTH = 640
const HEIGHT = 300

const xs = computed(() => props.points.map((p) => p.value as number))
const xDomain = computed<[number, number]>(() => {
  if (props.param === 'maxDepth') return [1, 20]
  const hi = Math.max(0, ...xs.value, props.current ?? 0)
  return [0, hi > 0 ? hi : 0.1]
})
const yDomain = computed<[number, number]>(() => {
  let lo = 1
  for (const p of props.points) lo = Math.min(lo, p.trainMean, p.cvMean - p.cvStd)
  const floor = Math.max(0, Math.floor(lo * 20) / 20)
  return [floor >= 1 ? 0.9 : floor, 1]
})
const best = computed(() => {
  let b: CurvePoint | null = null
  for (const p of props.points) if (b === null || p.cvMean > b.cvMean) b = p
  return b
})
const shown = (v: number | null) => (v === null ? '' : props.param === 'maxDepth' ? fmtValue(lang.value, v) : fmt(lang.value, v, 4))
/** '.' decimals and no trailing zeros, for the verification contract. */
const attrNumber = (v: number) => String(Number(v.toFixed(6)))
const inAxis = computed(() => props.current !== null)

const gridFits = computed(() => (props.k === null ? 0 : props.nValues * props.k + 1))
const message = computed(() => {
  const code = props.error ?? ''
  const key = `complexity.error.${code}` as MessageKey
  return ['TOO_FEW_PER_CLASS', 'WORKER_FAILED'].includes(code) ? t(key) : t('complexity.error.generic')
})

function paths(xScale: (v: number) => number, yScale: (v: number) => number) {
  const pts = props.points.map((p) => ({ ...p, x: p.value as number }))
  const l = (f: (p: (typeof pts)[number]) => number) =>
    line<(typeof pts)[number]>()
      .x((p) => xScale(p.x))
      .y((p) => yScale(f(p)))(pts) ?? ''
  const band =
    area<(typeof pts)[number]>()
      .x((p) => xScale(p.x))
      .y0((p) => yScale(p.cvMean - p.cvStd))
      .y1((p) => yScale(p.cvMean + p.cvStd))(pts) ?? ''
  return { train: l((p) => p.trainMean), cv: l((p) => p.cvMean), band }
}
</script>

<template>
  <div class="curve">
    <fieldset class="param">
      <legend>{{ t('complexity.curve.param') }}</legend>
      <label v-for="c in COMPLEXITY_CURVES" :key="c" class="radio" :class="{ on: param === c }">
        <input
          type="radio"
          name="complexity-curve"
          :value="c"
          :checked="param === c"
          @change="emit('update:param', c)"
        />
        <span>{{ t(`complexity.curve.${c}` as MessageKey) }}</span>
      </label>
    </fieldset>

    <section
      class="chart"
      data-verify-unit="validation-curve"
      :data-verify-state="state"
      :data-verify-count="state === 'error' ? 0 : nValues"
      :data-verify-error="state === 'error' ? error : undefined"
      :data-verify-param="param"
      :data-verify-current="current === null ? 'unbounded' : attrNumber(current)"
      :aria-busy="state === 'loading'"
    >
      <p v-if="state === 'error'" class="error-box" role="alert">{{ message }}</p>
      <template v-else>
        <div v-if="points.length === 0" class="placeholder" role="status">{{ t('status.loading') }}</div>
        <div v-else class="plot-wrap" :class="{ stale: state === 'loading' }">
          <PlotFrame
            :x-domain="xDomain"
            :y-domain="yDomain"
            :width="WIDTH"
            :height="HEIGHT"
            :x-label="t(`complexity.curve.${param}` as MessageKey)"
            :y-label="t('complexity.curve.yLabel')"
          >
            <template #default="{ x, y }">
              <template v-for="d in [paths(x, y)]" :key="0">
              <path class="band" :d="d.band" />
              <line
                v-if="inAxis"
                class="current"
                :x1="x(current as number)"
                :x2="x(current as number)"
                :y1="y(yDomain[0])"
                :y2="y(yDomain[1])"
              />
              <path class="line train" :d="d.train" />
              <path class="line cv" :d="d.cv" />
              </template>
              <circle
                v-for="(p, i) in points"
                :key="`c${i}`"
                class="dot cv"
                :cx="x(p.value as number)"
                :cy="y(p.cvMean)"
                r="3.5"
              />
              <rect
                v-for="(p, i) in points"
                :key="`t${i}`"
                class="dot train"
                :x="x(p.value as number) - 3"
                :y="y(p.trainMean) - 3"
                width="6"
                height="6"
              />
            </template>
          </PlotFrame>
        </div>
        <p v-if="state === 'loading' && points.length > 0" class="busy" role="status">{{ t('status.loading') }}</p>
      </template>
    </section>

    <ul class="legend" aria-hidden="true">
      <li><span class="key train" />{{ t('complexity.curve.train') }}</li>
      <li><span class="key cv" />{{ t('complexity.curve.cv') }}</li>
      <li><span class="key current" />{{ t('complexity.curve.current') }}</li>
    </ul>
    <p v-if="param === 'maxDepth' && !inAxis" class="note" data-note="unbounded">{{ t('complexity.curve.unbounded') }}</p>
    <p v-if="state === 'ready' && best" class="note" data-note="best">
      {{
        t('complexity.curve.best', {
          param: t(`complexity.curve.${param}` as MessageKey),
          value: shown(best.value),
          cv: fmt(lang, best.cvMean, 3),
        })
      }}
    </p>

    <p
      class="grid"
      data-verify-unit="grid-size"
      :data-verify-state="state === 'error' ? 'error' : 'ready'"
      :data-verify-count="gridFits"
      :data-verify-error="state === 'error' ? error : undefined"
    >
      <template v-if="k !== null">
        {{ t('complexity.curve.grid', { values: nValues, k, fits: gridFits }) }}
      </template>
    </p>
    <p class="note">{{ t('complexity.curve.hint') }}</p>

    <details v-if="state === 'ready' && points.length > 0" class="table">
      <summary>{{ t('complexity.curve.table') }}</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">{{ t('complexity.curve.value') }}</th>
            <th scope="col">{{ t('complexity.curve.train') }}</th>
            <th scope="col">{{ t('complexity.curve.cv') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in points" :key="i" :data-value="p.value">
            <th scope="row">{{ shown(p.value) }}</th>
            <td>{{ fmt(lang, p.trainMean, 3) }}</td>
            <td>{{ fmt(lang, p.cvMean, 3) }} ± {{ fmt(lang, p.cvStd, 3) }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </div>
</template>

<style scoped>
.curve {
  display: grid;
  gap: 0.5rem;
}
.param {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
legend {
  float: left;
  margin-right: 0.6rem;
  padding: 0;
  font-size: 0.72rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.radio {
  position: relative;
  display: inline-flex;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  font-size: 0.88rem;
  cursor: pointer;
}
.radio input {
  position: absolute;
  opacity: 0;
  inset: 0;
  margin: 0;
  cursor: pointer;
}
.radio.on {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 650;
  box-shadow: inset 0 -2px 0 var(--accent);
}
.radio:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.chart {
  position: relative;
}
.placeholder {
  aspect-ratio: 640 / 300;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: 4px;
}
.plot-wrap.stale {
  opacity: 0.5;
}
.busy {
  position: absolute;
  top: 0.4rem;
  right: 0.6rem;
  margin: 0;
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.82rem;
}
.error-box {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--error);
  border-left-width: 4px;
  border-radius: 4px;
  background: var(--error-bg);
}
.band {
  fill: var(--accent);
  fill-opacity: 0.16;
}
.line {
  fill: none;
  stroke-width: 2;
}
.line.cv {
  stroke: var(--accent);
}
.line.train {
  stroke: var(--text-muted);
  stroke-dasharray: 6 4;
}
.dot.cv {
  fill: var(--accent);
}
.dot.train {
  fill: var(--surface);
  stroke: var(--text-muted);
  stroke-width: 1.5;
}
.current {
  stroke: var(--focus);
  stroke-width: 2;
  stroke-dasharray: 2 3;
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
.key.train {
  border-top: 2px dashed var(--text-muted);
}
.key.current {
  border-top: 2px dotted var(--focus);
}
.note,
.grid {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-muted);
}
.grid {
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  min-height: 1.45em;
}
.table summary {
  cursor: pointer;
  font-size: 0.85rem;
}
.table table {
  margin-top: 0.4rem;
  border-collapse: collapse;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.table th,
.table td {
  padding: 0.15rem 0.7rem 0.15rem 0;
  text-align: left;
  font-weight: normal;
}
.table thead th {
  font-weight: 650;
  border-bottom: 1px solid var(--border);
}
.table {
  max-height: 16rem;
  overflow: auto;
}
</style>
