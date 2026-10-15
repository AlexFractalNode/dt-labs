<script setup lang="ts">
/**
 * Controls of the forest lab: generated data set (preset, n, noise, seed), number of trees B, max_features,
 * bootstrap and the per-tree limits. Emits partial state updates; the view owns state, URL and computation.
 */
import { computed } from 'vue'
import { useI18n, type MessageKey } from '../../i18n'
import { fmt, fmtValue } from '../../ui/format'
import LinearSlider from '../../ui/LinearSlider.vue'
import { FOREST_PRESETS, type ForestState } from './state'

const props = defineProps<{ state: ForestState }>()
const emit = defineEmits<{ update: [patch: Partial<ForestState>] }>()
const { lang, t } = useI18n()

const MAX_DEPTH = 20
const unbounded = computed(() => props.state.depth === null)
/** All features and no bootstrap: every tree is the same tree. */
const identical = computed(() => props.state.mf === 2 && !props.state.bootstrap)

const num = (v: number) => fmtValue(lang.value, v)
const noiseText = (v: number) => fmt(lang.value, v, 2)

function onSeed(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isInteger(v)) emit('update', { seed: Math.min(9999, Math.max(0, v)) })
}
function onUnbounded(e: Event) {
  emit('update', { depth: (e.target as HTMLInputElement).checked ? null : MAX_DEPTH })
}
function onBootstrap(e: Event) {
  emit('update', { bootstrap: (e.target as HTMLInputElement).checked })
}
</script>

<template>
  <div class="params">
    <fieldset class="group">
      <legend>{{ t('forest.data.presetLabel') }}</legend>
      <div class="chips">
        <button
          v-for="p in FOREST_PRESETS"
          :key="p"
          type="button"
          class="chip"
          :class="{ on: state.preset === p }"
          :data-preset="p"
          :aria-pressed="state.preset === p"
          @click="emit('update', { preset: p })"
        >
          {{ t(`forest.data.preset.${p}` as MessageKey) }}
        </button>
      </div>
      <div data-param="n">
        <LinearSlider
          :model-value="state.n"
          :min="2"
          :max="1000"
          :step="1"
          :label="t('forest.data.n')"
          :format="num"
          @update:model-value="emit('update', { n: $event })"
        />
      </div>
      <div data-param="noise">
        <LinearSlider
          :model-value="state.noise"
          :min="0"
          :max="1"
          :step="0.05"
          :label="t('forest.data.noise')"
          :format="noiseText"
          @update:model-value="emit('update', { noise: Math.round($event * 100) / 100 })"
        />
      </div>
      <label class="seed">
        <span>{{ t('forest.data.seed') }}</span>
        <input type="number" min="0" max="9999" step="1" data-param="seed" :value="state.seed" @change="onSeed" />
      </label>
      <p class="note">{{ t('forest.data.synthetic') }}</p>
    </fieldset>

    <fieldset class="group">
      <legend>{{ t('forest.params.forest') }}</legend>
      <div data-param="B">
        <LinearSlider
          :model-value="state.B"
          :min="1"
          :max="300"
          :step="1"
          :label="t('forest.params.trees')"
          :format="num"
          @update:model-value="emit('update', { B: $event })"
        />
      </div>
      <div class="sub">{{ t('forest.params.maxFeatures') }}</div>
      <div class="radios" role="radiogroup" :aria-label="t('forest.params.maxFeatures')">
        <label v-for="m in [1, 2] as const" :key="m" class="radio" :class="{ on: state.mf === m }">
          <input
            type="radio"
            name="forest-mf"
            :value="m"
            :data-field="`mf-${m}`"
            :checked="state.mf === m"
            @change="emit('update', { mf: m })"
          />
          <span>{{ t(`forest.params.mf${m}` as MessageKey) }}</span>
        </label>
      </div>
      <label class="check boot">
        <input type="checkbox" data-field="bootstrap" :checked="state.bootstrap" @change="onBootstrap" />
        <span>{{ t('forest.params.bootstrap') }}</span>
      </label>
      <p v-if="identical" class="note hint" data-note="identical">{{ t('forest.params.identical') }}</p>
      <p v-else class="note">{{ t('forest.params.forestNote') }}</p>
    </fieldset>

    <fieldset class="group">
      <legend>{{ t('forest.params.tree') }}</legend>
      <div data-param="depth" :class="{ dim: unbounded }">
        <LinearSlider
          :model-value="state.depth ?? MAX_DEPTH"
          :min="1"
          :max="MAX_DEPTH"
          :step="1"
          :label="t('forest.params.depth')"
          :format="(v: number) => (unbounded ? t('forest.params.depthUnbounded') : num(v))"
          @update:model-value="emit('update', { depth: $event })"
        />
        <label class="check">
          <input type="checkbox" data-field="depth-unbounded" :checked="unbounded" @change="onUnbounded" />
          <span>{{ t('forest.params.depthUnbounded') }}</span>
        </label>
      </div>
      <div data-param="leaf">
        <LinearSlider
          :model-value="state.leaf"
          :min="1"
          :max="50"
          :step="1"
          :label="t('forest.params.leaf')"
          :format="num"
          @update:model-value="emit('update', { leaf: $event })"
        />
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.params {
  display: grid;
  gap: 0.9rem;
}
.group {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
legend {
  padding: 0;
  margin-bottom: 0.3rem;
  font-size: 0.72rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.sub {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.9rem;
}
.chips,
.radios {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.chip {
  font: inherit;
  font-size: 0.88rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
}
.chip:hover {
  border-color: var(--accent);
}
.chip.on {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 650;
  box-shadow: inset 0 -2px 0 var(--accent);
}
.radio {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.8rem;
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
.note {
  margin: 0.4rem 0 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text-muted);
}
.note.hint {
  padding: 0.4rem 0.6rem;
  border-left: 3px solid var(--focus);
  background: var(--bg);
  color: var(--text);
}
.seed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
}
.seed input {
  width: 5.5rem;
  font: inherit;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.boot {
  margin-top: 0.6rem;
  font-size: 0.9rem;
}
.dim :deep(input[type='range']) {
  opacity: 0.45;
}
</style>
