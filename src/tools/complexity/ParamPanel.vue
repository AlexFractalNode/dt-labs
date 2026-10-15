<script setup lang="ts">
/**
 * Controls of the complexity lab: data set (preset, n, noise, seed), criterion, pre-pruning limits and ccp_alpha.
 * Emits partial state updates; the view owns the state, the URL and all computation.
 */
import { computed } from 'vue'
import { useI18n, type MessageKey } from '../../i18n'
import { fmt, fmtValue } from '../../ui/format'
import LinearSlider from '../../ui/LinearSlider.vue'
import RootSlider from '../../ui/RootSlider.vue'
import { COMPLEXITY_CRITERIA, COMPLEXITY_PRESETS, type ComplexityState } from './state'

const props = defineProps<{ state: ComplexityState }>()
const emit = defineEmits<{ update: [patch: Partial<ComplexityState>] }>()
const { lang, t } = useI18n()

const MAX_DEPTH = 20
const generated = computed(() => props.state.preset !== 'eight')
const unbounded = computed(() => props.state.depth === null)

const num = (v: number) => fmtValue(lang.value, v)
const noiseText = (v: number) => fmt(lang.value, v, 2)
const midText = (v: number) => fmt(lang.value, v, 3)
const alphaText = (v: number) => fmt(lang.value, v, 4)

function onSeed(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isInteger(v)) emit('update', { seed: Math.min(9999, Math.max(0, v)) })
}
function onUnbounded(e: Event) {
  emit('update', { depth: (e.target as HTMLInputElement).checked ? null : MAX_DEPTH })
}
</script>

<template>
  <div class="params">
    <fieldset class="group">
      <legend>{{ t('complexity.data.presetLabel') }}</legend>
      <div class="chips">
        <button
          v-for="p in COMPLEXITY_PRESETS"
          :key="p"
          type="button"
          class="chip"
          :class="{ on: state.preset === p }"
          :data-preset="p"
          :aria-pressed="state.preset === p"
          @click="emit('update', { preset: p })"
        >
          {{ t(`complexity.data.preset.${p}` as MessageKey) }}
        </button>
      </div>
      <template v-if="generated">
        <div data-param="n">
          <LinearSlider
            :model-value="state.n"
            :min="2"
            :max="1000"
            :step="1"
            :label="t('complexity.data.n')"
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
            :label="t('complexity.data.noise')"
            :format="noiseText"
            @update:model-value="emit('update', { noise: $event })"
          />
        </div>
        <label class="seed">
          <span>{{ t('complexity.data.seed') }}</span>
          <input
            type="number"
            min="0"
            max="9999"
            step="1"
            data-param="seed"
            :value="state.seed"
            @change="onSeed"
          />
        </label>
        <p class="note">{{ t('complexity.data.synthetic') }}</p>
      </template>
      <p v-else class="note">{{ t('complexity.data.fixed') }}</p>
    </fieldset>

    <fieldset class="group">
      <legend>{{ t('complexity.params.criterion') }}</legend>
      <div class="radios">
        <label v-for="c in COMPLEXITY_CRITERIA" :key="c" class="radio" :class="{ on: state.criterion === c }">
          <input
            type="radio"
            name="complexity-criterion"
            :value="c"
            :checked="state.criterion === c"
            @change="emit('update', { criterion: c })"
          />
          <span>{{ t(`complexity.params.${c}` as MessageKey) }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset class="group">
      <legend>{{ t('complexity.params.pre') }}</legend>
      <div data-param="depth" :class="{ dim: unbounded }">
        <LinearSlider
          :model-value="state.depth ?? MAX_DEPTH"
          :min="1"
          :max="MAX_DEPTH"
          :step="1"
          :label="t('complexity.params.depth')"
          :format="(v: number) => (unbounded ? t('complexity.params.depthUnbounded') : num(v))"
          @update:model-value="emit('update', { depth: $event })"
        />
        <label class="check">
          <input type="checkbox" data-field="depth-unbounded" :checked="unbounded" @change="onUnbounded" />
          <span>{{ t('complexity.params.depthUnbounded') }}</span>
        </label>
      </div>
      <div data-param="split">
        <LinearSlider
          :model-value="state.split"
          :min="2"
          :max="100"
          :step="1"
          :label="t('complexity.params.split')"
          :format="num"
          @update:model-value="emit('update', { split: $event })"
        />
      </div>
      <div data-param="leaf">
        <LinearSlider
          :model-value="state.leaf"
          :min="1"
          :max="50"
          :step="1"
          :label="t('complexity.params.leaf')"
          :format="num"
          @update:model-value="emit('update', { leaf: $event })"
        />
      </div>
      <div data-param="mid">
        <LinearSlider
          :model-value="state.mid"
          :min="0"
          :max="0.05"
          :step="0.001"
          :label="t('complexity.params.mid')"
          :format="midText"
          @update:model-value="emit('update', { mid: Math.round($event * 1000) / 1000 })"
        />
      </div>
    </fieldset>

    <fieldset class="group">
      <legend>{{ t('complexity.params.post') }}</legend>
      <div data-param="alpha">
        <RootSlider
          :model-value="state.alpha"
          :min="0"
          :max="1"
          :decimals="4"
          :label="t('complexity.params.alpha')"
          :format="alphaText"
          @update:model-value="emit('update', { alpha: $event })"
        />
      </div>
      <p class="note">{{ t('complexity.params.alphaNote') }}</p>
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
/* An unbounded depth leaves the slider position meaningless; the dimmed slider still works. */
.dim :deep(input[type='range']) {
  opacity: 0.45;
}
</style>
