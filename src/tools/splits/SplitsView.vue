<script setup lang="ts">
/**
 * Split workshop (`#/splits`): the user builds a classification tree node by node. Table | diagram | candidates in
 * one row, MDI and path tracer below. All math lives in src/core (growManual, autoChoices, ...); this view only wires
 * state, URL and display.
 */
import { computed, ref, watch } from 'vue'
import { parseCsv } from '../../core/csv'
import { checkTableLimits, datasetToRows, rowsToDataset, type ClassDataset } from '../../core/dataset'
import { DtError, type DtErrorCode } from '../../core/errors'
import type { Criterion } from '../../core/impurity'
import { autoChoices, growManual, manualImportances, setChoice, tracePath } from '../../core/manual'
import { PRESETS } from '../../core/presets'
import { bestCandidate, candidateKey } from '../../core/splits'
import { useI18n, type MessageKey } from '../../i18n'
import { useRoute } from '../../router'
import BarList from '../../ui/BarList.vue'
import Formula from '../../ui/Formula.vue'
import { classColor } from '../../ui/classStyle'
import RefBadge from '../../ui/RefBadge.vue'
import { TOOL_REFS } from '../toolRefs'
import ScenarioArea from '../../ui/ScenarioArea.vue'
import TreeDiagram from '../../ui/TreeDiagram.vue'
import UrlNotice from '../../ui/UrlNotice.vue'
import type { DiagramNode } from '../../ui/treeLayout'
import { writeToolQuery } from '../scenarioUrl'
import { useScenario } from '../useScenario'
import CandidateTable from './CandidateTable.vue'
import DataTable from './DataTable.vue'
import { fmt, majority, parseTyped, questionText } from './format'
import PathTracer from './PathTracer.vue'
import {
  DEFAULT_SPLITS_STATE,
  parseSplitsQuery,
  SPLITS_CRITERIA,
  SPLITS_PRESETS,
  toSplitsQuery,
  type SplitsState,
} from './state'

type PresetId = SplitsState['preset']

const MAX_BYTES = 1_000_000
const MAX_ROWS = 200
const MIN_ROWS = 2
/** Name of the class column of each preset (the last column of its table). */
const PRESET_TARGET: Record<PresetId, string> = { speed: 'Speed', eight: 'class', weather: 'play' }
/** Developer-written TeX (no user text): MDI of feature j over the applied splits t. */
const MDI_TEX =
  '\\mathrm{MDI}(j)=\\frac{\\sum_{t:\\,j(t)=j}\\frac{n_t}{n}\\,\\Delta I_t}{\\sum_{t}\\frac{n_t}{n}\\,\\Delta I_t}'

const { lang, t } = useI18n()
const route = useRoute()

// ---- state ---------------------------------------------------------------------------------------------------------
const presetId = ref<PresetId>(DEFAULT_SPLITS_STATE.preset)
const fileName = ref<string | null>(null)
const edited = ref(false)
const header = ref<string[]>([])
const rows = ref<string[][]>([])
/** Set when a file could not even be read as a table (nothing to show or edit). */
const loadError = ref<{ code: DtErrorCode; details?: Record<string, unknown> } | null>(null)
const criterion = ref<Criterion>(DEFAULT_SPLITS_STATE.criterion)
/** Applied splits: node path -> candidate key. */
const choices = ref<Record<string, string>>({})
const focusPath = ref('')
const droppedTotal = ref(0)
const traceValues = ref<string[]>([])
const urlProblems = ref<string[]>([])
let loadToken = 0

const custom = computed(() => fileName.value !== null || edited.value)

// ---- dataset -------------------------------------------------------------------------------------------------------
const built = computed<{ ds: ClassDataset | null; error: { code: DtErrorCode; details?: Record<string, unknown> } | null }>(() => {
  if (loadError.value !== null) return { ds: null, error: loadError.value }
  try {
    return { ds: rowsToDataset(header.value, rows.value, header.value[header.value.length - 1]), error: null }
  } catch (e) {
    if (e instanceof DtError) return { ds: null, error: { code: e.code, details: e.details } }
    return { ds: null, error: { code: 'BAD_PARAM' } }
  }
})
const ds = computed(() => built.value.ds)
const dataState = computed<'empty' | 'ready' | 'error'>(() =>
  built.value.error !== null ? 'error' : rows.value.length === 0 ? 'empty' : 'ready',
)
const errorKeys: Partial<Record<DtErrorCode, MessageKey>> = {
  EMPTY_DATA: 'splits.error.EMPTY_DATA',
  CSV_PARSE: 'splits.error.CSV_PARSE',
  CSV_LIMIT: 'splits.error.CSV_LIMIT',
  MISSING_VALUES: 'splits.error.MISSING_VALUES',
  SINGLE_CLASS: 'splits.error.SINGLE_CLASS',
}
const errorText = computed(() => {
  const err = built.value.error
  if (err === null) return ''
  const d = err.details ?? {}
  return t(errorKeys[err.code] ?? 'splits.error.generic', {
    line: String(d.line ?? '?'),
    row: String(d.row ?? '?'),
    column: String(d.column ?? '?'),
  })
})

// ---- tree ----------------------------------------------------------------------------------------------------------
const grown = computed(() => (ds.value === null ? null : growManual(ds.value, criterion.value, choices.value)))
const nodes = computed(() => grown.value?.nodes ?? [])
const idOf = computed(() => new Map(nodes.value.map((n, i) => [n.path, i])))
const focus = computed(() => (idOf.value.has(focusPath.value) ? focusPath.value : ''))
const focusNode = computed(() => nodes.value[idOf.value.get(focus.value) ?? -1] ?? null)
const focusId = computed(() => (focusNode.value === null ? null : (idOf.value.get(focus.value) ?? null)))
const appliedKey = computed(() => (focusNode.value?.split ? candidateKey(focusNode.value.split) : null))

function nodeName(path: string): string {
  return path === '' ? t('splits.node.root') : t('splits.node.named', { path })
}

const diagramNodes = computed<DiagramNode[]>(() => {
  const d = ds.value
  if (d === null) return []
  return nodes.value.map((n, i) => {
    const cls = d.classNames[majority(n.counts)]
    return {
      id: i,
      parent: n.path === '' ? -1 : (idOf.value.get(n.path.slice(0, -1)) ?? -1),
      side: n.path === '' ? null : (n.path.slice(-1) as 'L' | 'R'),
      title: n.split ? questionText(d, n.split, lang.value) : `→ ${cls}`,
      detail: `n=${n.rows.length} · I=${fmt(lang.value, n.impurity, 3)}${n.split ? ` · ${cls}` : ''}`,
      counts: n.counts,
      leaf: n.split === null,
    }
  })
})
const importances = computed(() => {
  const d = ds.value
  if (d === null) return []
  const values = manualImportances(nodes.value, d.features.length)
  return d.features.map((f, j) => ({ label: f.name, value: values[j] }))
})
const hasSplit = computed(() => nodes.value.some((n) => n.split !== null))
const importanceState = computed<'empty' | 'ready'>(() => (ds.value !== null && hasSplit.value ? 'ready' : 'empty'))
const focusRows = computed(() => focusNode.value?.rows ?? [])
const rowClass = computed(() => rows.value.map((_, i) => ds.value?.y[i] ?? null))

// ---- path tracer ---------------------------------------------------------------------------------------------------
function defaultTrace(d: ClassDataset, j: number): string {
  return String(d.X[0]?.[j] ?? 0)
}
watch(
  ds,
  (d) => {
    if (d === null) return
    traceValues.value = d.features.map((f, j) => {
      const old = traceValues.value[j]
      if (old === undefined) return defaultTrace(d, j)
      if (f.kind === 'categorical') {
        const code = Number(old)
        return Number.isInteger(code) && code >= 0 && code < (f.categories?.length ?? 0) ? old : defaultTrace(d, j)
      }
      return old
    })
  },
  { immediate: true },
)
const visited = computed<string[] | null>(() => {
  const d = ds.value
  if (d === null || traceValues.value.length !== d.features.length) return null
  const x = traceValues.value.map((v, j) => (d.features[j].kind === 'categorical' ? Number(v) : parseTyped(v)))
  if (x.some((v) => !Number.isFinite(v))) return null
  try {
    return tracePath(nodes.value, d, x)
  } catch {
    return null
  }
})
const pathIds = computed(() => (visited.value ?? []).map((p) => idOf.value.get(p) ?? -1).filter((i) => i >= 0))

// ---- loading data --------------------------------------------------------------------------------------------------
function resetTree(): void {
  choices.value = {}
  focusPath.value = ''
  droppedTotal.value = 0
}

function loadPreset(id: PresetId): void {
  const d = PRESETS[id]
  presetId.value = id
  fileName.value = null
  edited.value = false
  loadError.value = null
  header.value = [...d.features.map((f) => f.name), PRESET_TARGET[id]]
  rows.value = datasetToRows(d)
  resetTree()
}

function initFromUrl(): void {
  const { state, problems } = parseSplitsQuery(Object.fromEntries(route.value.params))
  urlProblems.value = problems
  loadPreset(state.preset)
  criterion.value = state.criterion
  if (state.grow === 'auto' && ds.value !== null) choices.value = autoChoices(ds.value, criterion.value)
}
initFromUrl()
// A new route state (nav link, back/forward) restarts from the address; our own URL updates do not touch it.
watch(() => route.value, initFromUrl)

async function readText(f: File): Promise<string> {
  const buf = await f.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    // German Excel exports are often Windows-1252
    return new TextDecoder('windows-1252').decode(buf)
  }
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  const token = ++loadToken
  try {
    if (f.size > MAX_BYTES) throw new DtError('CSV_LIMIT', { bytes: f.size, maxBytes: MAX_BYTES })
    const table = parseCsv(await readText(f))
    if (token !== loadToken) return
    // Reject an oversized table now, so it is never shown as hundreds of inputs in an error state.
    checkTableLimits(table.columns.length, table.rows.length)
    header.value = table.columns
    rows.value = table.rows.map((r) => r.map((c) => (c === null ? '' : String(c))))
    fileName.value = f.name
    edited.value = false
    loadError.value = null
    resetTree()
  } catch (err) {
    if (token !== loadToken) return
    fileName.value = f.name
    edited.value = false
    rows.value = []
    header.value = []
    loadError.value =
      err instanceof DtError ? { code: err.code, details: err.details } : { code: 'CSV_PARSE', details: {} }
    resetTree()
  }
}

// ---- table editing -------------------------------------------------------------------------------------------------
/** Takes new rows, then drops the choices that no longer exist (Spec 4.1) and counts them for the notice. */
function commitRows(next: string[][]): void {
  rows.value = next
  edited.value = true
  const d = ds.value
  if (d === null) return
  const { dropped } = growManual(d, criterion.value, choices.value)
  if (dropped.length === 0) return
  const kept = { ...choices.value }
  for (const p of dropped) delete kept[p]
  choices.value = kept
  droppedTotal.value += dropped.length
}
function onEdit(r: number, c: number, value: string): void {
  commitRows(rows.value.map((row, i) => (i === r ? row.map((v, j) => (j === c ? value : v)) : row)))
}
function onAdd(): void {
  const last = rows.value[rows.value.length - 1]
  if (last === undefined || rows.value.length >= MAX_ROWS) return
  commitRows([...rows.value, [...last]])
}
function onRemove(r: number): void {
  if (rows.value.length <= MIN_ROWS) return
  commitRows(rows.value.filter((_, i) => i !== r))
}

// ---- tree actions --------------------------------------------------------------------------------------------------
function applySplit(key: string): void {
  // Re-picking the split that is already applied must keep the subtree below it (setChoice would remove it).
  if (appliedKey.value === key) return
  choices.value = setChoice(choices.value, focus.value, key)
}
function applyBest(): void {
  const node = focusNode.value
  const best = node === null ? null : bestCandidate(node.candidates)
  if (best !== null) applySplit(candidateKey(best))
}
function growAll(): void {
  if (ds.value !== null) choices.value = autoChoices(ds.value, criterion.value, choices.value)
}
function removeSubtree(): void {
  choices.value = setChoice(choices.value, focus.value, null)
}
function onSelect(id: number): void {
  focusPath.value = nodes.value[id]?.path ?? ''
}
function onTrace(j: number, value: string): void {
  traceValues.value = traceValues.value.map((v, i) => (i === j ? value : v))
}
const canAct = computed(() => ds.value !== null && focusNode.value !== null)
// "Best split" only for impure nodes: a pure node has no best candidate (sklearn does not split it).
const canBest = computed(
  () => canAct.value && focusNode.value !== null && focusNode.value.impurity > 0 && bestCandidate(focusNode.value.candidates) !== null,
)
const canRemove = computed(() => focusNode.value?.split != null)

// ---- URL sync ------------------------------------------------------------------------------------------------------
function sameChoices(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}
const query = computed<Record<string, string>>(() => {
  const crit = criterion.value
  if (custom.value) return crit !== DEFAULT_SPLITS_STATE.criterion ? { criterion: crit } : {}
  const d = ds.value
  const isAuto = d !== null && Object.keys(choices.value).length > 0 && sameChoices(choices.value, autoChoices(d, crit))
  return toSplitsQuery({ preset: presetId.value, criterion: crit, grow: isAuto ? 'auto' : 'none' })
})
// replaceState: no hashchange, no history entry; keeps `lang` and a valid `scenario` of the live address
watch(query, (q) => writeToolQuery('splits', q))

// ---- scenarios -----------------------------------------------------------------------------------------------------
// The split workshop has no start action.
const scenario = useScenario('splits', () => query.value, {})
const noticeProblems = computed(() => [...new Set([...urlProblems.value, ...scenario.problems.value])])

// ---- labels --------------------------------------------------------------------------------------------------------
const sourceLabel = computed(() => {
  const base =
    fileName.value !== null
      ? t('splits.data.source.file', { name: fileName.value })
      : t('splits.data.source.preset', { name: t(`splits.data.preset.${presetId.value}` as MessageKey) })
  return edited.value && fileName.value === null ? t('splits.data.source.edited', { source: base }) : base
})
const showWeatherNote = computed(() => presetId.value === 'weather' && !custom.value)
const focusTitle = computed(() =>
  focusNode.value === null
    ? ''
    : t('splits.cand.forNode', {
        node: nodeName(focus.value),
        n: focusNode.value.rows.length,
        imp: fmt(lang.value, focusNode.value.impurity, 3),
      }),
)
const formatShare = (v: number) => fmt(lang.value, v, 3)
</script>

<template>
  <div class="splits">
    <header class="head">
      <div class="head-top">
        <h2 class="title">{{ t('nav.splits') }}</h2>
        <RefBadge :chapter="TOOL_REFS.splits.chapter" :code="TOOL_REFS.splits.code" />
      </div>
      <p class="lead">{{ t('splits.lead') }}</p>
    </header>

    <UrlNotice :problems="noticeProblems" />

    <ScenarioArea tool="splits" :scenario="scenario" />

    <div class="controls">
      <fieldset class="group">
        <legend>{{ t('splits.criterion.label') }}</legend>
        <div class="radios">
          <label v-for="c in SPLITS_CRITERIA" :key="c" class="radio" :class="{ on: criterion === c }">
            <input v-model="criterion" type="radio" name="criterion" :value="c" />
            <span>{{ t(`splits.criterion.${c}` as MessageKey) }}</span>
          </label>
        </div>
      </fieldset>
      <div class="group" role="group" :aria-label="t('splits.action.label')">
        <span class="group-label" aria-hidden="true">{{ t('splits.action.label') }}</span>
        <div class="buttons">
          <button
            type="button"
            class="btn"
            data-action="best-split"
            :disabled="!canBest"
            :title="t('splits.action.bestHint')"
            @click="applyBest"
          >
            {{ t('splits.action.best') }}
          </button>
          <button
            type="button"
            class="btn primary"
            data-action="grow-all"
            :disabled="!canAct"
            :title="t('splits.action.growHint')"
            @click="growAll"
          >
            {{ t('splits.action.grow') }}
          </button>
          <button
            type="button"
            class="btn"
            data-action="remove-subtree"
            :disabled="!canRemove"
            :title="t('splits.action.removeHint')"
            @click="removeSubtree"
          >
            {{ t('splits.action.remove') }}
          </button>
          <button type="button" class="btn" data-action="reset-tree" :disabled="!canAct" @click="resetTree">
            {{ t('splits.action.reset') }}
          </button>
        </div>
      </div>
    </div>
    <p class="criterion-note">{{ t('splits.criterion.note') }}</p>

    <div class="panels">
      <section
        class="panel data"
        data-verify-unit="splits-data"
        :data-verify-state="dataState"
        :data-verify-count="loadError ? 0 : rows.length"
        :data-verify-error="built.error ? built.error.code : undefined"
        :data-verify-dropped="droppedTotal"
        aria-labelledby="splits-data-title"
      >
        <h3 id="splits-data-title" class="panel-title">{{ t('splits.data.title') }}</h3>
        <div class="source-row">
          <div class="presets" role="group" :aria-label="t('splits.data.presetLabel')">
            <button
              v-for="p in SPLITS_PRESETS"
              :key="p"
              type="button"
              class="btn small"
              :class="{ on: presetId === p && !custom }"
              :data-preset="p"
              :aria-pressed="presetId === p && !custom"
              @click="loadPreset(p)"
            >
              {{ t(`splits.data.preset.${p}` as MessageKey) }}
            </button>
          </div>
          <label class="btn small upload">
            <input type="file" class="sr-only" accept=".csv,.txt,.tsv,.data,text/csv,text/plain" data-field="csv-file" @change="onFile" />
            <span>{{ t('splits.data.upload') }}</span>
          </label>
        </div>
        <p class="muted small">{{ t('splits.data.uploadHint') }}</p>
        <p v-if="showWeatherNote" class="note" data-note="weather">{{ t('splits.data.weatherNote') }}</p>
        <p v-if="loadError === null" class="muted small source">
          {{ sourceLabel }} · {{ t('splits.data.cases', { n: rows.length }) }}
        </p>
        <p v-if="built.error" class="error-box" role="alert">{{ errorText }}</p>
        <p v-if="droppedTotal > 0" class="note" role="status" data-note="dropped">
          {{ t('splits.data.dropped', { n: droppedTotal }) }}
        </p>
        <p v-if="custom" class="muted small" data-note="custom-url">{{ t('splits.data.customUrl') }}</p>
        <DataTable
          v-if="loadError === null && rows.length > 0"
          :header="header"
          :rows="rows"
          :focus-rows="focusRows"
          :class-index="rowClass"
          :max-rows="MAX_ROWS"
          :min-rows="MIN_ROWS"
          @edit="onEdit"
          @add="onAdd"
          @remove="onRemove"
        />
      </section>

      <section class="panel treep" aria-labelledby="splits-tree-title">
        <h3 id="splits-tree-title" class="panel-title">{{ t('splits.tree.title') }}</h3>
        <p class="muted small">{{ t('splits.tree.hint') }}</p>
        <TreeDiagram :nodes="diagramNodes" :focus="focusId" :path="pathIds" @select="onSelect" />
        <ul v-if="ds" class="legend" :aria-label="t('splits.tree.classes')">
          <li v-for="(name, k) in ds.classNames" :key="k">
            <span class="swatch" :style="{ background: classColor(k) }" aria-hidden="true" />{{ name }}
          </li>
        </ul>
      </section>

      <section class="panel cands" aria-labelledby="splits-cand-title">
        <h3 id="splits-cand-title" class="panel-title">{{ t('splits.cand.title') }}</h3>
        <p v-if="focusNode" class="muted small focus-line" data-verify-unit="focus-node" :data-verify-focus="focus">{{ focusTitle }}</p>
        <CandidateTable
          :ds="ds"
          :node="focusNode"
          :applied-key="appliedKey"
          :eight-example="presetId === 'eight' && !custom"
          @apply="applySplit"
        />
      </section>
    </div>

    <div class="lower">
      <section class="panel" aria-labelledby="splits-mdi-title">
        <h3 id="splits-mdi-title" class="panel-title">{{ t('splits.mdi.title') }}</h3>
        <div
          data-verify-unit="importance"
          :data-verify-state="importanceState"
          :data-verify-count="importanceState === 'ready' ? importances.length : 0"
        >
          <BarList v-if="importanceState === 'ready'" :items="importances" :format="formatShare" />
          <p v-else class="muted">{{ t('splits.mdi.empty') }}</p>
        </div>
        <div class="formula" role="img" :aria-label="t('splits.mdi.formula')">
          <Formula :tex="MDI_TEX" display />
        </div>
        <p class="muted small">{{ t('splits.mdi.note') }}</p>
      </section>

      <section class="panel" aria-labelledby="splits-trace-title">
        <h3 id="splits-trace-title" class="panel-title">{{ t('splits.trace.title') }}</h3>
        <PathTracer :ds="ds" :values="traceValues" :nodes="nodes" :visited="visited" @update="onTrace" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.splits {
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

/* Controls */
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 2rem;
  align-items: flex-end;
  padding: 0.7rem 0.9rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.group {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
  display: grid;
  gap: 0.3rem;
}
legend,
.group-label {
  padding: 0;
  font-size: 0.72rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.radios,
.buttons,
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.radio {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  font-size: 0.9rem;
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
.criterion-note {
  margin: -0.4rem 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

/* Panels: table | diagram | candidates. Medium widths: table beside diagram and candidates; wide: three columns. */
.panels {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}
@media (min-width: 900px) {
  .panels {
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    grid-template-areas:
      'data tree'
      'data cands';
  }
  .data {
    grid-area: data;
  }
  .treep {
    grid-area: tree;
  }
  .cands {
    grid-area: cands;
  }
}
@media (min-width: 1700px) {
  .panels {
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr) minmax(0, 1.4fr);
    grid-template-areas: 'data tree cands';
  }
}
.lower {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 900px) {
  .lower {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
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
.muted {
  margin: 0.3rem 0;
  color: var(--text-muted);
}
.small {
  font-size: 0.85rem;
  line-height: 1.45;
}
.source-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
.upload {
  position: relative;
  display: inline-block;
}
.upload:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.source {
  margin-bottom: 0.6rem;
}
.note {
  margin: 0.5rem 0;
  padding: 0.35rem 0.6rem;
  border-left: 3px solid var(--focus);
  background: var(--bg);
  font-size: 0.86rem;
  line-height: 1.5;
}
.error-box {
  margin: 0.5rem 0;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--error);
  border-left-width: 4px;
  border-radius: 4px;
  background: var(--error-bg);
  color: var(--text);
}
.legend {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
  margin: 0.6rem 0 0;
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
.focus-line {
  margin-top: 0;
}
.formula {
  margin-top: 0.6rem;
  font-size: 0.95rem;
}
</style>
