<script setup lang="ts">
/**
 * Complexity lab (`#/complexity`): pre-pruning limits and ccp_alpha on a 2-D classification tree. The single tree,
 * its regions and the pruning path update synchronously; accuracies and the cross-validation are recomputed after a
 * 150 ms debounce on the main thread, the validation curve runs in the job worker. All math lives in src/core; this
 * view wires state, URL and display.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { accuracy, chooseK, crossValidate } from '../../core/cv'
import { DtError, type DtErrorCode } from '../../core/errors'
import { generate, type Bounds, type GeneratorName } from '../../core/generators'
import { PRESETS } from '../../core/presets'
import { costComplexityPath, pruneTree } from '../../core/prune'
import { leafRegions } from '../../core/regions'
import {
  DEFAULT_TREE_PARAMS,
  fitTree,
  maxDepthOf,
  nLeaves,
  predict,
  type Tree,
  type TreeParams,
} from '../../core/tree'
import { useI18n, type MessageKey } from '../../i18n'
import { useRoute } from '../../router'
import { fmt, fmtValue } from '../../ui/format'
import PlotFrame from '../../ui/PlotFrame.vue'
import PointLayer from '../../ui/PointLayer.vue'
import RefBadge from '../../ui/RefBadge.vue'
import RegionLayer from '../../ui/RegionLayer.vue'
import TreeDiagram from '../../ui/TreeDiagram.vue'
import UrlNotice from '../../ui/UrlNotice.vue'
import type { DiagramNode } from '../../ui/treeLayout'
import { createJobClient } from '../../worker/client'
import { majority } from '../splits/format'
import ParamPanel from './ParamPanel.vue'
import PruningPath from './PruningPath.vue'
import {
  DEFAULT_COMPLEXITY_STATE,
  parseComplexityQuery,
  toComplexityQuery,
  type ComplexityState,
} from './state'
import ValidationCurve, { type CurvePoint } from './ValidationCurve.vue'

const DEBOUNCE_MS = 150
const FRESH_N = 2000
const FRESH_SEED_OFFSET = 9999
const CURVE_DEPTHS = Array.from({ length: 20 }, (_, i) => i + 1)
const MAX_CURVE_ALPHAS = 20
const CLASS_COLORS = ['var(--c-class-0)', 'var(--c-class-1)', 'var(--c-class-2)']
/** Margin added around the eight textbook cases for the region plot. */
const EIGHT_PAD = 0.5

const { lang, t } = useI18n()
const route = useRoute()

// ---- state and URL -------------------------------------------------------------------------------------------------
const st = reactive<ComplexityState>({ ...DEFAULT_COMPLEXITY_STATE })
const urlProblems = ref<string[]>([])

function initFromUrl(): void {
  const { state, problems } = parseComplexityQuery(Object.fromEntries(route.value.params))
  urlProblems.value = problems
  Object.assign(st, state)
}
initFromUrl()
// A new route state (nav link, back/forward) restarts from the address; our own URL updates do not touch it.
watch(() => route.value, initFromUrl)

function onUpdate(patch: Partial<ComplexityState>): void {
  Object.assign(st, patch)
}

const query = computed(() => toComplexityQuery(st))
watch(query, (q) => {
  if (typeof window === 'undefined') return
  try {
    // replaceState: no hashchange, no history entry; keeps the `lang` parameter of the live address
    const live = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
    const next = new URLSearchParams(q)
    const l = live.get('lang')
    if (l) next.set('lang', l)
    const qs = next.toString()
    history.replaceState(history.state, '', `#/complexity${qs ? `?${qs}` : ''}`)
  } catch {
    /* history unavailable: the view still works */
  }
})

// ---- data ----------------------------------------------------------------------------------------------------------
interface DataSet {
  X: number[][]
  y: number[]
  bounds: Bounds
  nClasses: number
  classNames: string[]
  featureNames: [string, string]
  /** null for the fixed textbook cases */
  generator: GeneratorName | null
}

const data = computed<DataSet>(() => {
  if (st.preset === 'eight') {
    const d = PRESETS.eight
    const xs = d.X.map((r) => r[0])
    const ys = d.X.map((r) => r[1])
    return {
      X: d.X,
      y: d.y,
      bounds: {
        x0: Math.min(...xs) - EIGHT_PAD,
        x1: Math.max(...xs) + EIGHT_PAD,
        y0: Math.min(...ys) - EIGHT_PAD,
        y1: Math.max(...ys) + EIGHT_PAD,
      },
      nClasses: d.classNames.length,
      classNames: d.classNames,
      featureNames: [d.features[0].name, d.features[1].name],
      generator: null,
    }
  }
  const g = generate(st.preset, st.n, st.noise, st.seed)
  return {
    X: g.X,
    y: g.y,
    bounds: g.bounds,
    nClasses: 2,
    classNames: ['0', '1'],
    featureNames: ['x1', 'x2'],
    generator: st.preset,
  }
})

// ---- model (synchronous) -------------------------------------------------------------------------------------------
/** Pre-pruning parameters with ccp_alpha 0: the fully grown tree whose pruning path is shown. */
const growParams = computed<TreeParams>(() => ({
  ...DEFAULT_TREE_PARAMS,
  criterion: st.criterion,
  maxDepth: st.depth,
  minSamplesSplit: st.split,
  minSamplesLeaf: st.leaf,
  minImpurityDecrease: st.mid,
  ccpAlpha: 0,
}))
const fullFit = computed<{ tree: Tree; path: ReturnType<typeof costComplexityPath> } | null>(() => {
  try {
    const d = data.value
    const tree = fitTree(d.X, d.y, d.nClasses, growParams.value)
    return { tree, path: costComplexityPath(tree) }
  } catch {
    return null
  }
})
const shown = computed<Tree | null>(() => {
  const f = fullFit.value
  if (f === null) return null
  try {
    return pruneTree(f.tree, st.alpha)
  } catch {
    return null
  }
})
const leaves = computed(() => (shown.value === null ? 0 : nLeaves(shown.value)))
const depthNow = computed(() => (shown.value === null ? 0 : maxDepthOf(shown.value)))
const regions = computed(() => (shown.value === null ? [] : leafRegions(shown.value, data.value.bounds)))

const diagramNodes = computed<DiagramNode[]>(() => {
  const tree = shown.value
  if (tree === null) return []
  const d = data.value
  const parent = new Array<number>(tree.childrenLeft.length).fill(-1)
  const side = new Array<'L' | 'R' | null>(tree.childrenLeft.length).fill(null)
  tree.childrenLeft.forEach((l, i) => {
    if (l === -1) return
    parent[l] = i
    side[l] = 'L'
    parent[tree.childrenRight[i]] = i
    side[tree.childrenRight[i]] = 'R'
  })
  return tree.childrenLeft.map((l, i) => {
    const leaf = l === -1
    const cls = d.classNames[majority(tree.value[i])]
    return {
      id: i,
      parent: parent[i],
      side: side[i],
      title: leaf ? `→ ${cls}` : `${d.featureNames[tree.feature[i]]} ≤ ${fmtValue(lang.value, tree.threshold[i])}`,
      detail: `n=${tree.nNodeSamples[i]} · I=${fmt(lang.value, tree.impurity[i], 3)}`,
      counts: tree.value[i],
      leaf,
    }
  })
})

// ---- cross-validation folds ----------------------------------------------------------------------------------------
const folds = computed<{ k: number } | { code: DtErrorCode }>(() => {
  try {
    return { k: chooseK(data.value.y, data.value.nClasses) }
  } catch (e) {
    return { code: e instanceof DtError ? e.code : 'BAD_PARAM' }
  }
})
const k = computed(() => ('k' in folds.value ? folds.value.k : null))

// ---- metrics (debounced) -------------------------------------------------------------------------------------------
interface Metrics {
  train: number
  fresh: number | null
  cv: { mean: number; std: number } | null
  k: number | null
  error: DtErrorCode | null
}
const metrics = ref<Metrics | null>(null)
const metricsState = ref<'loading' | 'ready' | 'error'>('loading')
let metricsTimer: ReturnType<typeof setTimeout> | null = null

function computeMetrics(): void {
  metricsTimer = null
  const tree = shown.value
  const d = data.value
  if (tree === null) {
    metrics.value = { train: 0, fresh: null, cv: null, k: null, error: 'BAD_PARAM' }
    metricsState.value = 'error'
    return
  }
  const train = accuracy(
    d.y,
    d.X.map((x) => predict(tree, x)),
  )
  let fresh: number | null = null
  if (d.generator !== null) {
    const f = generate(d.generator, FRESH_N, st.noise, st.seed + FRESH_SEED_OFFSET)
    fresh = accuracy(
      f.y,
      f.X.map((x) => predict(tree, x)),
    )
  }
  const fo = folds.value
  if (!('k' in fo)) {
    metrics.value = { train, fresh, cv: null, k: null, error: fo.code }
    metricsState.value = 'error'
    return
  }
  try {
    const cv = crossValidate(d.X, d.y, d.nClasses, { ...growParams.value, ccpAlpha: st.alpha }, fo.k)
    metrics.value = { train, fresh, cv: { mean: cv.mean, std: cv.std }, k: fo.k, error: null }
    metricsState.value = 'ready'
  } catch (e) {
    metrics.value = { train, fresh, cv: null, k: fo.k, error: e instanceof DtError ? e.code : 'BAD_PARAM' }
    metricsState.value = 'error'
  }
}
function scheduleMetrics(): void {
  metricsState.value = 'loading'
  if (metricsTimer !== null) clearTimeout(metricsTimer)
  metricsTimer = setTimeout(computeMetrics, DEBOUNCE_MS)
}
watch(shown, scheduleMetrics, { immediate: true })

// ---- validation curve (worker) -------------------------------------------------------------------------------------
/** At most `MAX_CURVE_ALPHAS` of the distinct path alphas, evenly spread (first and last included). */
function pickAlphas(alphas: number[]): number[] {
  const distinct = [...new Set(alphas)]
  if (distinct.length <= MAX_CURVE_ALPHAS) return distinct
  const idx = new Set<number>()
  for (let i = 0; i < MAX_CURVE_ALPHAS; i++) idx.add(Math.round((i * (distinct.length - 1)) / (MAX_CURVE_ALPHAS - 1)))
  return [...idx].sort((a, b) => a - b).map((i) => distinct[i])
}
const curveValues = computed<number[]>(() =>
  st.curve === 'maxDepth' ? CURVE_DEPTHS : pickAlphas(fullFit.value?.path.alphas ?? []),
)
const curveClient = createJobClient()
const curvePoints = ref<CurvePoint[]>([])
const curvePointsParam = ref<ComplexityState['curve']>(st.curve)
const curveState = ref<'loading' | 'ready' | 'error'>('loading')
const curveError = ref<DtErrorCode | undefined>(undefined)
let curveTimer: ReturnType<typeof setTimeout> | null = null
let curveToken = 0
let curveCancel: (() => void) | null = null

function runCurve(): void {
  curveTimer = null
  const d = data.value
  const fo = folds.value
  if (!('k' in fo) || fullFit.value === null) {
    curveState.value = 'error'
    curveError.value = 'k' in fo ? 'BAD_PARAM' : fo.code
    return
  }
  const token = ++curveToken
  const base: TreeParams = { ...growParams.value, ccpAlpha: st.curve === 'maxDepth' ? st.alpha : 0 }
  const param = st.curve
  const handle = curveClient.start({
    kind: 'validationCurve',
    X: d.X,
    y: d.y,
    nClasses: d.nClasses,
    base,
    param,
    values: curveValues.value,
    k: fo.k,
  })
  curveCancel = handle.cancel
  handle.promise.then(
    (res) => {
      if (token !== curveToken) return
      curvePoints.value = res
      curvePointsParam.value = param
      curveError.value = undefined
      curveState.value = 'ready'
    },
    (e: unknown) => {
      if (token !== curveToken) return
      if (e instanceof DtError && e.code === 'CANCELLED') return
      curveError.value = e instanceof DtError ? e.code : 'WORKER_FAILED'
      curveState.value = 'error'
    },
  )
}
/** Only what the run depends on: with the alpha curve the alpha slider does not matter, with the depth curve max_depth. */
const curveKey = computed(() =>
  [
    st.preset,
    st.n,
    st.noise,
    st.seed,
    st.criterion,
    st.split,
    st.leaf,
    st.mid,
    st.curve,
    st.curve === 'maxDepth' ? st.alpha : st.depth,
  ].join('|'),
)
function scheduleCurve(): void {
  // a run that is still going is obsolete now: drop its result and stop the worker
  curveToken++
  curveCancel?.()
  curveCancel = null
  curveState.value = 'loading'
  curveError.value = undefined
  if (curveTimer !== null) clearTimeout(curveTimer)
  curveTimer = setTimeout(runCurve, DEBOUNCE_MS)
}
watch(curveKey, scheduleCurve, { immediate: true })

onBeforeUnmount(() => {
  if (metricsTimer !== null) clearTimeout(metricsTimer)
  if (curveTimer !== null) clearTimeout(curveTimer)
  curveToken++
  curveClient.dispose()
})

const curveShownPoints = computed(() => (curvePointsParam.value === st.curve ? curvePoints.value : []))
const curveCurrent = computed(() => (st.curve === 'maxDepth' ? st.depth : st.alpha))

// ---- display -------------------------------------------------------------------------------------------------------
const attrNumber = (v: number) => String(Number(v.toFixed(6)))
const metricsErrorText = computed(() => {
  const code = metrics.value?.error
  if (!code) return ''
  return ['TOO_FEW_PER_CLASS', 'WORKER_FAILED'].includes(code)
    ? t(`complexity.error.${code}` as MessageKey)
    : t('complexity.error.generic')
})
/** A wide tree is scrolled so that its root (centred over the leaves) is in view. */
const treePanel = ref<HTMLElement | null>(null)
function centreTree(): void {
  const el = treePanel.value?.querySelector<HTMLElement>('.tree-diagram')
  if (el) el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2)
}
onMounted(centreTree)
watch(
  () => diagramNodes.value.length,
  () => void nextTick(centreTree),
)
const plotCount = computed(() => data.value.y.length)
const pointsX = computed(() => data.value.X.map((r) => r[0]))
const pointsY = computed(() => data.value.X.map((r) => r[1]))
const modelFailed = computed(() => shown.value === null)
</script>

<template>
  <div class="complexity">
    <header class="head">
      <div class="head-top">
        <h2 class="title">{{ t('nav.complexity') }}</h2>
        <RefBadge chapter="9–11" code="62, 75–82, 170–212" />
      </div>
      <p class="lead">{{ t('complexity.lead') }}</p>
    </header>

    <UrlNotice :problems="urlProblems" />

    <div class="layout">
      <div class="side">
        <section class="panel params" aria-labelledby="cx-params-title">
          <h3 id="cx-params-title" class="panel-title">{{ t('complexity.params.title') }}</h3>
          <ParamPanel :state="st" @update="onUpdate" />
        </section>

        <section
          class="panel metrics"
          data-verify-unit="metrics"
          :data-verify-state="metricsState"
          :data-verify-count="metrics ? (metrics.fresh !== null ? 5 : 4) : 2"
          :data-verify-error="metricsState === 'error' ? (metrics?.error ?? undefined) : undefined"
          :data-verify-leaves="leaves"
          :data-verify-depth="depthNow"
          :data-verify-train="metricsState !== 'loading' && metrics ? attrNumber(metrics.train) : undefined"
          :data-verify-cv="metricsState === 'ready' && metrics?.cv ? attrNumber(metrics.cv.mean) : undefined"
          :data-verify-k="metricsState === 'ready' && metrics?.k != null ? metrics.k : undefined"
          :data-verify-fresh="metricsState !== 'loading' && metrics?.fresh != null ? attrNumber(metrics.fresh) : undefined"
          :aria-busy="metricsState === 'loading'"
          aria-labelledby="cx-metrics-title"
        >
          <h3 id="cx-metrics-title" class="panel-title">{{ t('complexity.metrics.title') }}</h3>
          <dl class="cards" :class="{ stale: metricsState === 'loading' }">
            <div class="card">
              <dt>{{ t('complexity.metrics.leaves') }}</dt>
              <dd>{{ leaves }}</dd>
            </div>
            <div class="card">
              <dt>{{ t('complexity.metrics.depth') }}</dt>
              <dd>{{ depthNow }}</dd>
            </div>
            <div class="card">
              <dt>{{ t('complexity.metrics.train') }}</dt>
              <dd>{{ metrics ? fmt(lang, metrics.train, 3) : '…' }}</dd>
              <dd class="help">{{ t('complexity.metrics.trainHelp') }}</dd>
            </div>
            <div class="card">
              <dt>{{ k !== null ? t('complexity.metrics.cv', { k }) : t('complexity.metrics.cv', { k: '–' }) }}</dt>
              <dd v-if="metrics?.cv">{{ fmt(lang, metrics.cv.mean, 3) }} ± {{ fmt(lang, metrics.cv.std, 3) }}</dd>
              <dd v-else>{{ metricsState === 'error' ? '–' : '…' }}</dd>
              <dd v-if="k !== null" class="help">{{ t('complexity.metrics.cvHelp', { k }) }}</dd>
            </div>
            <div class="card">
              <dt>{{ t('complexity.metrics.fresh') }}</dt>
              <dd v-if="data.generator === null">–</dd>
              <dd v-else>{{ metrics?.fresh != null ? fmt(lang, metrics.fresh, 3) : '…' }}</dd>
              <dd class="help">
                {{ data.generator === null ? t('complexity.metrics.freshNone') : t('complexity.metrics.freshHelp') }}
              </dd>
            </div>
          </dl>
          <p v-if="metricsState === 'error'" class="error-box" role="alert">{{ metricsErrorText }}</p>
          <p class="note">{{ t('complexity.metrics.separate') }}</p>
          <p class="note" data-note="tie">{{ t('complexity.metrics.tieNote') }}</p>
        </section>
      </div>

      <div class="main">
        <section class="panel plot" aria-labelledby="cx-plot-title">
          <h3 id="cx-plot-title" class="panel-title">{{ t('complexity.plot.title') }}</h3>
          <div
            data-verify-unit="complexity-plot"
            :data-verify-state="modelFailed ? 'error' : 'ready'"
            :data-verify-count="plotCount"
            :data-verify-error="modelFailed ? 'BAD_PARAM' : undefined"
          >
            <PlotFrame
              :x-domain="[data.bounds.x0, data.bounds.x1]"
              :y-domain="[data.bounds.y0, data.bounds.y1]"
              :x-label="data.featureNames[0]"
              :y-label="data.featureNames[1]"
            >
              <RegionLayer :regions="regions" :colors="CLASS_COLORS" />
              <PointLayer
                :x="pointsX"
                :y="pointsY"
                :classes="data.y"
                :editable="false"
              />
            </PlotFrame>
          </div>
          <ul class="legend" :aria-label="t('complexity.plot.classes')">
            <li v-for="(name, c) in data.classNames" :key="c">
              <span class="swatch" :style="{ background: `var(--c-class-${c % 3})` }" aria-hidden="true" />{{
                t('complexity.plot.class', { name })
              }}
            </li>
          </ul>
          <p class="note">{{ t('complexity.plot.hint') }}</p>
        </section>

        <section ref="treePanel" class="panel tree" aria-labelledby="cx-tree-title">
          <h3 id="cx-tree-title" class="panel-title">{{ t('complexity.tree.title') }}</h3>
          <TreeDiagram :nodes="diagramNodes" :collapse-depth="6" />
          <p class="note">{{ t('complexity.tree.hint') }}</p>
        </section>

        <section class="panel curve" aria-labelledby="cx-curve-title">
          <h3 id="cx-curve-title" class="panel-title">{{ t('complexity.curve.title') }}</h3>
          <ValidationCurve
            :state="curveState"
            :error="curveError"
            :param="st.curve"
            :points="curveShownPoints"
            :n-values="curveValues.length"
            :k="k"
            :current="curveCurrent"
            @update:param="onUpdate({ curve: $event })"
          />
        </section>

        <section class="panel path" aria-labelledby="cx-path-title">
          <h3 id="cx-path-title" class="panel-title">{{ t('complexity.path.title') }}</h3>
          <PruningPath v-if="fullFit" :path="fullFit.path" :alpha="st.alpha" :selected-leaves="leaves" />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.complexity {
  max-width: 1500px;
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}
.head-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 1rem;
}
.title {
  margin: 0;
  font-family: var(--serif);
  font-size: clamp(1.4rem, 1.1rem + 1.2vw, 1.9rem);
  font-weight: 600;
}
.lead {
  margin: 0.4rem 0 0;
  max-width: 70ch;
  color: var(--text-muted);
  line-height: 1.5;
}

/* Parameters and metrics on the left, the four views on the right (two columns on wide screens). */
.layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
}
.side,
.main {
  display: grid;
  gap: 1rem;
  min-width: 0;
  align-content: start;
}
/* One column: the plot follows the parameters directly, so a change is seen without scrolling far. */
@media (max-width: 959px) {
  .side,
  .main {
    display: contents;
  }
  .params {
    order: 1;
  }
  .plot {
    order: 2;
  }
  .metrics {
    order: 3;
  }
  .tree {
    order: 4;
  }
  .curve {
    order: 5;
  }
  .path {
    order: 6;
  }
}
@media (min-width: 960px) {
  .layout {
    grid-template-columns: 300px minmax(0, 1fr);
    align-items: start;
  }
}
@media (min-width: 1360px) {
  .main {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}
.panel {
  min-width: 0;
  padding: 0.8rem 0.9rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: 3px solid var(--accent);
  border-radius: 6px;
}
.panel-title {
  margin: 0 0 0.5rem;
  font-family: var(--serif);
  font-size: 1.1rem;
  font-weight: 600;
}
.note {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-muted);
}
.error-box {
  margin: 0.5rem 0;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--error);
  border-left-width: 4px;
  border-radius: 4px;
  background: var(--error-bg);
  color: var(--text);
  font-size: 0.9rem;
}

/* Metric cards: fixed structure in every state, so values arriving later do not move the layout. */
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
.card:nth-child(n + 3) {
  grid-column: 1 / -1;
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
  margin: 0.1rem 0 0;
  font-family: inherit;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.legend {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  margin: 0.5rem 0 0;
  padding: 0;
  font-size: 0.85rem;
}
.swatch {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  margin-right: 0.35rem;
  border-radius: 2px;
}
</style>
