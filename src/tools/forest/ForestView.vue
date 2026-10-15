<script setup lang="ts">
/**
 * Forest lab (`#/forest`): bagging, out-of-bag accuracy, hard vote vs probability average and the variance of an
 * ensemble prediction on generated 2-D data. The forest is trained in the job worker (debounced, stale results are
 * discarded); the vote at a clicked point is computed here from the returned trees; the variance measurement has its
 * own worker client in VariancePanel. All math lives in src/core; this view wires state, URL and display.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { chooseK, crossValidate } from '../../core/cv'
import { DtError, type DtErrorCode } from '../../core/errors'
import { treeProbas, type ForestParams } from '../../core/forest'
import { generate, type Bounds } from '../../core/generators'
import { DEFAULT_TREE_PARAMS } from '../../core/tree'
import { useI18n } from '../../i18n'
import { useRoute } from '../../router'
import { classColor } from '../../ui/classStyle'
import GridLayer from '../../ui/GridLayer.vue'
import PlotFrame from '../../ui/PlotFrame.vue'
import PointLayer from '../../ui/PointLayer.vue'
import RefBadge from '../../ui/RefBadge.vue'
import UrlNotice from '../../ui/UrlNotice.vue'
import { createJobClient } from '../../worker/client'
import type { ForestResult } from '../../worker/jobs'
import ForestParamsPanel from './ForestParams.vue'
import OobCurve, { type CvReference } from './OobCurve.vue'
import TreeGallery from './TreeGallery.vue'
import VariancePanel, { type MeasureSpec } from './VariancePanel.vue'
import VotePanel from './VotePanel.vue'
import { DEFAULT_FOREST_STATE, oobSteps, parseForestQuery, toForestQuery, type ForestState } from './state'

const DEBOUNCE_MS = 150
/** Side of the probability grid behind the regions (Spec 4.3). */
const GRID = 80
const GALLERY = 12
const N_CLASSES = 2
const CLASS_COLORS = ['var(--c-class-0)', 'var(--c-class-1)']
const FALLBACK_HEX = ['#0072b2', '#d55e00']
const CLASS_NAMES = ['0', '1']
/** The textbook example for hard vote vs average: three trees with these class-1 probabilities (Spec 4.3). */
const EXAMPLE_PROBAS = [
  [0.49, 0.51],
  [0.49, 0.51],
  [0.99, 0.01],
]

const { lang, t } = useI18n()
const route = useRoute()

// ---- state and URL -------------------------------------------------------------------------------------------------
const st = reactive<ForestState>({ ...DEFAULT_FOREST_STATE })
const urlProblems = ref<string[]>([])

function initFromUrl(): void {
  const { state, problems } = parseForestQuery(Object.fromEntries(route.value.params))
  urlProblems.value = problems
  Object.assign(st, state)
}
initFromUrl()
// A new route state (nav link, back/forward) restarts from the address; our own URL updates do not touch it.
watch(() => route.value, initFromUrl)

function onUpdate(patch: Partial<ForestState>): void {
  Object.assign(st, patch)
}

const query = computed(() => toForestQuery(st))
watch(query, (q) => {
  if (typeof window === 'undefined') return
  try {
    // replaceState: no hashchange, no history entry; keeps the `lang` parameter of the live address
    const live = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
    const next = new URLSearchParams(q)
    const l = live.get('lang')
    if (l) next.set('lang', l)
    const qs = next.toString()
    history.replaceState(history.state, '', `#/forest${qs ? `?${qs}` : ''}`)
  } catch {
    /* history unavailable: the view still works */
  }
})

// ---- data ----------------------------------------------------------------------------------------------------------
interface DataSet {
  X: number[][]
  y: number[]
  bounds: Bounds
}
const data = computed<DataSet>(() => {
  const g = generate(st.preset, st.n, st.noise, st.seed)
  return { X: g.X, y: g.y, bounds: g.bounds }
})
const featureNames: [string, string] = ['x1', 'x2']

/** `max_features = 2` means all features (null); 1 draws one of the two features per split. */
const forestParams = computed<ForestParams>(() => ({
  nEstimators: st.B,
  maxFeatures: st.mf === 1 ? 1 : null,
  bootstrap: st.bootstrap,
  tree: {
    criterion: DEFAULT_TREE_PARAMS.criterion,
    maxDepth: st.depth,
    minSamplesSplit: DEFAULT_TREE_PARAMS.minSamplesSplit,
    minSamplesLeaf: st.leaf,
    minImpurityDecrease: DEFAULT_TREE_PARAMS.minImpurityDecrease,
  },
  seed: st.seed,
}))
const identical = computed(() => st.mf === 2 && !st.bootstrap)

// ---- forest (worker) -----------------------------------------------------------------------------------------------
/** The data and forest the displayed results belong to; the plots show this snapshot until a newer run finishes. */
interface Snapshot {
  data: DataSet
  B: number
  result: ForestResult
}
const forestClient = createJobClient()
const snap = shallowRef<Snapshot | null>(null)
const forestState = ref<'loading' | 'ready' | 'error'>('loading')
const forestError = ref<DtErrorCode | undefined>(undefined)
const progress = ref(0)
let forestTimer: ReturnType<typeof setTimeout> | null = null
let forestToken = 0
let forestCancel: (() => void) | null = null

function runForest(): void {
  forestTimer = null
  const d = data.value
  const params = forestParams.value
  const token = ++forestToken
  progress.value = 0
  let handle
  try {
    handle = forestClient.start(
      {
        kind: 'forest',
        X: d.X,
        y: d.y,
        nClasses: N_CLASSES,
        params,
        grid: { bounds: d.bounds, G: GRID },
        oobSteps: oobSteps(params.nEstimators),
        galleryCount: GALLERY,
      },
      (done) => {
        if (token === forestToken) progress.value = done
      },
    )
  } catch (e) {
    forestError.value = e instanceof DtError ? e.code : 'WORKER_FAILED'
    forestState.value = 'error'
    return
  }
  forestCancel = handle.cancel
  handle.promise.then(
    (result) => {
      if (token !== forestToken) return
      snap.value = { data: d, B: params.nEstimators, result }
      forestError.value = undefined
      forestState.value = 'ready'
    },
    (e: unknown) => {
      if (token !== forestToken) return
      if (e instanceof DtError && e.code === 'CANCELLED') return
      forestError.value = e instanceof DtError ? e.code : 'WORKER_FAILED'
      forestState.value = 'error'
    },
  )
}
const forestKey = computed(() =>
  [st.preset, st.n, st.noise, st.seed, st.B, st.mf, st.bootstrap ? 1 : 0, st.depth ?? 'none', st.leaf].join('|'),
)
function scheduleForest(): void {
  // a run that is still going is obsolete now: drop its result and stop the worker
  forestToken++
  forestCancel?.()
  forestCancel = null
  forestState.value = 'loading'
  forestError.value = undefined
  if (forestTimer !== null) clearTimeout(forestTimer)
  forestTimer = setTimeout(runForest, DEBOUNCE_MS)
}
watch(forestKey, scheduleForest, { immediate: true })

// ---- single-tree reference (cross-validation on the main thread) ----------------------------------------------------
const cvRef = ref<CvReference>({ state: 'loading' })
let cvTimer: ReturnType<typeof setTimeout> | null = null
const cvKey = computed(() => [st.preset, st.n, st.noise, st.seed, st.depth ?? 'none', st.leaf].join('|'))

function computeCv(): void {
  cvTimer = null
  const d = data.value
  try {
    const k = chooseK(d.y, N_CLASSES)
    const r = crossValidate(
      d.X,
      d.y,
      N_CLASSES,
      { ...DEFAULT_TREE_PARAMS, maxDepth: st.depth, minSamplesLeaf: st.leaf },
      k,
    )
    cvRef.value = { state: 'ready', mean: r.mean, std: r.std, k }
  } catch (e) {
    cvRef.value = { state: 'error', code: e instanceof DtError ? e.code : 'BAD_PARAM' }
  }
}
function scheduleCv(): void {
  cvRef.value = { state: 'loading' }
  if (cvTimer !== null) clearTimeout(cvTimer)
  cvTimer = setTimeout(computeCv, DEBOUNCE_MS)
}
watch(cvKey, scheduleCv, { immediate: true })

onBeforeUnmount(() => {
  if (forestTimer !== null) clearTimeout(forestTimer)
  if (cvTimer !== null) clearTimeout(cvTimer)
  forestToken++
  forestClient.dispose()
  mq?.removeEventListener?.('change', onScheme)
})

// ---- class colours for the canvas grid (needs hex values, so read the design tokens) --------------------------------
const scheme = ref(0)
let mq: MediaQueryList | null = null
const onScheme = () => scheme.value++
onMounted(() => {
  try {
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onScheme)
  } catch {
    mq = null
  }
})
const gridColors = computed(() => {
  void scheme.value
  return CLASS_COLORS.map((c, i) => {
    try {
      const name = c.slice(4, -1)
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return v || FALLBACK_HEX[i]
    } catch {
      return FALLBACK_HEX[i]
    }
  })
})

// ---- point x* and the vote -----------------------------------------------------------------------------------------
const centreOf = (b: Bounds): [number, number] => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]
const xStar = ref<[number, number]>(centreOf(data.value.bounds))
const voteExample = ref(false)
watch(
  () => st.preset,
  () => {
    xStar.value = centreOf(data.value.bounds)
  },
)

function onPlotClick(p: { x: number; y: number }): void {
  const b = (snap.value?.data ?? data.value).bounds
  const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  xStar.value = [clampTo(p.x, b.x0, b.x1), clampTo(p.y, b.y0, b.y1)]
  voteExample.value = false
}
function onXStar(p: [number, number]): void {
  xStar.value = p
  voteExample.value = false
}

const voteProbas = computed<number[][] | null>(() => {
  if (voteExample.value) return EXAMPLE_PROBAS
  const s = snap.value
  if (s === null) return null
  return treeProbas({ trees: s.result.trees, counts: [] }, xStar.value)
})

// ---- display -------------------------------------------------------------------------------------------------------
const shown = computed(() => snap.value?.data ?? data.value)
const pointsX = computed(() => shown.value.X.map((r) => r[0]))
const pointsY = computed(() => shown.value.X.map((r) => r[1]))
const plotCount = computed(() => (forestState.value === 'ready' && snap.value ? snap.value.B : st.B))
const errorText = computed(() => {
  const code = forestError.value ?? ''
  return code === 'WORKER_FAILED' ? t('forest.error.WORKER_FAILED') : t('forest.error.generic')
})
const measureSpec = computed<MeasureSpec | null>(() => ({
  gen: { name: st.preset, n: st.n, noise: st.noise },
  xStar: [xStar.value[0], xStar.value[1]],
  params: forestParams.value,
}))
const measureKey = computed(() => `${forestKey.value}|${xStar.value[0]}|${xStar.value[1]}`)
</script>

<template>
  <div class="forest">
    <header class="head">
      <div class="head-top">
        <h2 class="title">{{ t('nav.forest') }}</h2>
        <RefBadge chapter="12–13" code="213–270" />
      </div>
      <p class="lead">{{ t('forest.lead') }}</p>
    </header>

    <UrlNotice :problems="urlProblems" />

    <div class="layout">
      <div class="side">
        <section class="panel params" aria-labelledby="fo-params-title">
          <h3 id="fo-params-title" class="panel-title">{{ t('forest.params.title') }}</h3>
          <ForestParamsPanel :state="st" @update="onUpdate" />
        </section>
      </div>

      <div class="main">
        <section class="panel plot" aria-labelledby="fo-plot-title">
          <h3 id="fo-plot-title" class="panel-title">{{ t('forest.plot.title') }}</h3>
          <div
            class="plot-box"
            data-verify-unit="forest-plot"
            :data-verify-state="forestState"
            :data-verify-count="plotCount"
            :data-verify-error="forestState === 'error' ? forestError : undefined"
            :data-verify-progress="forestState === 'loading' ? progress : undefined"
            :aria-busy="forestState === 'loading'"
          >
            <p v-if="forestState === 'error'" class="error-box" role="alert">{{ errorText }}</p>
            <div v-else-if="snap === null" class="placeholder" role="status">{{ t('status.loading') }}</div>
            <div v-else class="plot-wrap" :class="{ stale: forestState === 'loading' }">
              <PlotFrame
                :x-domain="[shown.bounds.x0, shown.bounds.x1]"
                :y-domain="[shown.bounds.y0, shown.bounds.y1]"
                :x-label="featureNames[0]"
                :y-label="featureNames[1]"
                @plot-click="onPlotClick"
              >
                <template #default="{ x, y }">
                  <!-- Layers let clicks through, so a click anywhere (also on a point) sets x*. -->
                  <g class="through">
                    <GridLayer :grid="snap.result.proba" :G="GRID" :n-classes="N_CLASSES" :colors="gridColors" />
                    <PointLayer :x="pointsX" :y="pointsY" :classes="shown.y" :editable="false" />
                    <g v-if="!voteExample" class="xstar" data-marker="xstar" aria-hidden="true">
                      <line :x1="x(xStar[0]) - 9" :x2="x(xStar[0]) + 9" :y1="y(xStar[1])" :y2="y(xStar[1])" />
                      <line :x1="x(xStar[0])" :x2="x(xStar[0])" :y1="y(xStar[1]) - 9" :y2="y(xStar[1]) + 9" />
                    </g>
                  </g>
                </template>
              </PlotFrame>
            </div>
            <p v-if="forestState === 'loading' && snap !== null" class="busy" role="status">
              {{ t('forest.plot.training', { done: progress, total: st.B }) }}
            </p>
          </div>
          <ul class="legend" :aria-label="t('forest.plot.classes')">
            <li v-for="(name, c) in CLASS_NAMES" :key="c">
              <span class="swatch" :style="{ background: classColor(c) }" aria-hidden="true" />{{
                t('forest.plot.class', { name })
              }}
              <span aria-hidden="true">{{ ['●', '■'][c] }}</span>
            </li>
          </ul>
          <p class="note">{{ t('forest.plot.hint') }}</p>
        </section>

        <section class="panel vote" aria-labelledby="fo-vote-title">
          <h3 id="fo-vote-title" class="panel-title">{{ t('forest.vote.title') }}</h3>
          <VotePanel
            :state="forestState"
            :probas="voteProbas"
            :example="voteExample"
            :x-star="xStar"
            :feature-names="featureNames"
            :class-names="CLASS_NAMES"
            @update:x-star="onXStar"
            @example="voteExample = true"
            @point="voteExample = false"
          />
        </section>

        <section class="panel gallery" aria-labelledby="fo-gallery-title">
          <h3 id="fo-gallery-title" class="panel-title">{{ t('forest.gallery.title') }}</h3>
          <p class="note lead-note">{{ t('forest.gallery.hint') }}</p>
          <TreeGallery
            :state="forestState"
            :items="snap?.result.gallery ?? []"
            :X="shown.X"
            :y="shown.y"
            :bounds="shown.bounds"
            :colors="CLASS_COLORS"
            :bootstrap="st.bootstrap"
            :expected="Math.min(GALLERY, st.B)"
          />
        </section>

        <section class="panel oob" aria-labelledby="fo-oob-title">
          <h3 id="fo-oob-title" class="panel-title">{{ t('forest.oob.title') }}</h3>
          <OobCurve
            :state="forestState"
            :bootstrap="st.bootstrap"
            :points="snap?.result.oobCurve ?? []"
            :n="shown.y.length"
            :cv="cvRef"
          />
        </section>

        <section class="panel variance" aria-labelledby="fo-var-title">
          <h3 id="fo-var-title" class="panel-title">{{ t('forest.variance.title') }}</h3>
          <VariancePanel :spec="measureSpec" :spec-key="measureKey" :B="snap?.B ?? st.B" :identical="identical" />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.forest {
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

/* Parameters on the left, the views on the right (two columns on wide screens). */
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
  .vote {
    order: 3;
  }
  .gallery {
    order: 4;
  }
  .oob {
    order: 5;
  }
  .variance {
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
  .gallery,
  .variance {
    grid-column: 1 / -1;
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
.lead-note {
  margin: 0 0 0.6rem;
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

.plot-box {
  position: relative;
}
.placeholder {
  aspect-ratio: 640 / 360;
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
  font-variant-numeric: tabular-nums;
}
.through {
  pointer-events: none;
}
.xstar line {
  stroke: var(--c-points);
  stroke-width: 2.5;
  paint-order: stroke;
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
