<script setup lang="ts">
/**
 * Out-of-bag accuracy over the number of trees B, with the coverage (cases that no tree left out are not scored) and
 * the cross-validated accuracy of a single tree as a reference line. Both numbers estimate accuracy on new data, but
 * by different methods, so they are labelled separately. Without bootstrap every tree sees every case: the curve is
 * empty and says why. The numbers come from the forest job and core's `crossValidate`; this component draws them.
 */
import { computed } from 'vue'
import { line } from 'd3-shape'
import { useI18n } from '../../i18n'
import { fmt } from '../../ui/format'
import PlotFrame from '../../ui/PlotFrame.vue'

export interface OobPoint {
  B: number
  score: number | null
  uncovered: number
}
export interface CvReference {
  state: 'loading' | 'ready' | 'error'
  mean?: number
  std?: number
  k?: number
}

const props = defineProps<{
  /** State of the forest job. */
  state: 'loading' | 'ready' | 'error'
  /** Current bootstrap setting; false empties the curve. */
  bootstrap: boolean
  points: OobPoint[]
  /** Training cases, to report coverage. */
  n: number
  cv: CvReference
}>()
const { lang, t } = useI18n()

const WIDTH = 640
const HEIGHT = 300

const unitState = computed(() => {
  if (!props.bootstrap) return 'empty'
  if (props.state === 'error') return 'error'
  if (props.points.length === 0) return 'loading'
  return props.state
})
const last = computed(() => (props.points.length > 0 ? props.points[props.points.length - 1] : null))
const scored = computed(() => props.points.filter((p) => p.score !== null) as (OobPoint & { score: number })[])
const maxB = computed(() => Math.max(2, last.value?.B ?? 2))
const cvOk = computed(() => props.cv.state === 'ready' && props.cv.mean !== undefined && props.cv.std !== undefined)

const xDomain = computed<[number, number]>(() => [0, maxB.value])
const yDomain = computed<[number, number]>(() => {
  let lo = 1
  for (const p of scored.value) lo = Math.min(lo, p.score)
  if (cvOk.value) lo = Math.min(lo, (props.cv.mean as number) - (props.cv.std as number))
  const floor = Math.max(0, Math.floor(lo * 20) / 20)
  return [floor >= 1 ? 0.9 : floor, 1]
})

/** '.' decimals and no trailing zeros, for the verification contract. */
const attrNumber = (v: number) => String(Number(v.toFixed(6)))

function paths(xScale: (v: number) => number, yScale: (v: number) => number) {
  const pts = scored.value
  const oob =
    line<(typeof pts)[number]>()
      .x((p) => xScale(p.B))
      .y((p) => yScale(p.score))(pts) ?? ''
  // reference band: single-tree CV mean +- SD, clipped to the plotted accuracy range
  const m = props.cv.mean ?? 0
  const sd = props.cv.std ?? 0
  const hi = Math.min(1, m + sd)
  const lo = Math.max(yDomain.value[0], m - sd)
  const band = {
    x: xScale(0),
    y: yScale(hi),
    width: xScale(maxB.value) - xScale(0),
    height: Math.max(0, yScale(lo) - yScale(hi)),
  }
  return { oob, band, cvY: yScale(m) }
}
const covered = computed(() => (last.value ? props.n - last.value.uncovered : 0))
</script>

<template>
  <section
    class="oob"
    data-verify-unit="oob-curve"
    :data-verify-state="unitState"
    :data-verify-count="unitState === 'empty' || unitState === 'error' ? 0 : points.length"
    :data-verify-uncovered="unitState === 'ready' && last ? last.uncovered : undefined"
    :data-verify-score="unitState === 'ready' && last && last.score !== null ? attrNumber(last.score) : undefined"
    :data-verify-cv="cvOk ? attrNumber(cv.mean as number) : undefined"
    :aria-busy="unitState === 'loading'"
  >
    <dl class="cards" :class="{ stale: unitState === 'loading' }">
      <div class="card" data-card="oob">
        <dt>{{ t('forest.oob.score', { B: last?.B ?? '–' }) }}</dt>
        <dd v-if="unitState === 'empty'">–</dd>
        <dd v-else-if="last && last.score !== null">{{ fmt(lang, last.score, 3) }}</dd>
        <dd v-else>…</dd>
        <dd class="help">
          <template v-if="unitState === 'empty'">{{ t('forest.oob.scoreNone') }}</template>
          <template v-else-if="last">
            {{ t('forest.oob.coverage', { covered, n, uncovered: last.uncovered }) }}
          </template>
        </dd>
      </div>
      <div class="card" data-card="cv">
        <dt>{{ t('forest.oob.cvTitle', { k: cv.k ?? '–' }) }}</dt>
        <dd v-if="cvOk">{{ fmt(lang, cv.mean as number, 3) }} ± {{ fmt(lang, cv.std as number, 3) }}</dd>
        <dd v-else>{{ cv.state === 'error' ? '–' : '…' }}</dd>
        <dd class="help">
          {{ cv.state === 'error' ? t('forest.oob.cvError') : t('forest.oob.cvHelp') }}
        </dd>
      </div>
    </dl>

    <div v-if="unitState === 'empty'" class="placeholder" data-note="no-bootstrap" role="status">
      <strong>{{ t('forest.oob.emptyTitle') }}</strong>
      <span>{{ t('forest.oob.noBootstrap') }}</span>
    </div>
    <p v-else-if="unitState === 'error'" class="error-box" role="alert">{{ t('forest.error.generic') }}</p>
    <div v-else-if="points.length === 0" class="placeholder" role="status">{{ t('status.loading') }}</div>
    <div v-else class="plot-wrap" :class="{ stale: unitState === 'loading' }">
      <PlotFrame
        :x-domain="xDomain"
        :y-domain="yDomain"
        :width="WIDTH"
        :height="HEIGHT"
        :x-label="t('forest.oob.xLabel')"
        :y-label="t('forest.oob.yLabel')"
      >
        <template #default="{ x, y }">
          <template v-if="cvOk">
            <rect class="cv-band" v-bind="paths(x, y).band" />
            <line class="cv-line" :x1="x(0)" :x2="x(maxB)" :y1="paths(x, y).cvY" :y2="paths(x, y).cvY" />
          </template>
          <path class="oob-line" :d="paths(x, y).oob" />
          <circle v-for="p in scored" :key="p.B" class="oob-dot" :cx="x(p.B)" :cy="y(p.score)" r="3.5" />
        </template>
      </PlotFrame>
    </div>

    <ul v-if="unitState !== 'empty' && unitState !== 'error'" class="legend" aria-hidden="true">
      <li><span class="key oob" />{{ t('forest.oob.legendOob') }}</li>
      <li v-if="cvOk"><span class="key cv" />{{ t('forest.oob.legendCv') }}</li>
    </ul>
    <p v-if="unitState !== 'empty'" class="note">{{ t('forest.oob.hint') }}</p>

    <details v-if="unitState === 'ready' && points.length > 0" class="table">
      <summary>{{ t('forest.oob.table') }}</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">B</th>
            <th scope="col">{{ t('forest.oob.colScore') }}</th>
            <th scope="col">{{ t('forest.oob.colUncovered') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in points" :key="p.B" :data-b="p.B">
            <th scope="row">{{ p.B }}</th>
            <td>{{ p.score === null ? '–' : fmt(lang, p.score, 3) }}</td>
            <td>{{ p.uncovered }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </section>
</template>

<style scoped>
.oob {
  display: grid;
  gap: 0.6rem;
}
.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
}
.cards.stale dd {
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
.card dd.help {
  font-family: inherit;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.placeholder {
  display: grid;
  gap: 0.3rem;
  place-items: center;
  align-content: center;
  min-height: 12rem;
  padding: 1rem;
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: 4px;
}
.placeholder strong {
  color: var(--text);
}
.plot-wrap.stale {
  opacity: 0.5;
}
.error-box {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--error);
  border-left-width: 4px;
  border-radius: 4px;
  background: var(--error-bg);
}
.oob-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
}
.oob-dot {
  fill: var(--accent);
}
.cv-line {
  stroke: var(--text-muted);
  stroke-width: 2;
  stroke-dasharray: 6 4;
}
.cv-band {
  fill: var(--text-muted);
  fill-opacity: 0.14;
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
.key.cv {
  border-top: 2px dashed var(--text-muted);
}
.note {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-muted);
}
.table summary {
  cursor: pointer;
  font-size: 0.85rem;
}
.table {
  max-height: 16rem;
  overflow: auto;
}
.table table {
  margin-top: 0.4rem;
  border-collapse: collapse;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.table th,
.table td {
  padding: 0.15rem 0.9rem 0.15rem 0;
  text-align: left;
  font-weight: normal;
}
.table thead th {
  font-weight: 650;
  border-bottom: 1px solid var(--border);
}
</style>
