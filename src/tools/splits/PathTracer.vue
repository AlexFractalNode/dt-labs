<script setup lang="ts">
/**
 * Path tracer: a new case is typed in (numbers with comma or point, categories from a list); the view highlights its
 * path in the diagram and this panel shows the leaf's class shares and the predicted class.
 */
import { computed } from 'vue'
import type { ClassDataset } from '../../core/dataset'
import type { ManualNode } from '../../core/manual'
import { useI18n } from '../../i18n'
import { majority } from './format'

const props = defineProps<{
  ds: ClassDataset | null
  /** Typed values per feature: number text, or the category code as text. */
  values: string[]
  nodes: ManualNode[]
  /** Visited node paths, or null while the input is incomplete. */
  visited: string[] | null
}>()
const emit = defineEmits<{ update: [feature: number, value: string] }>()
const { lang, t } = useI18n()

const leaf = computed(() => {
  if (props.visited === null || props.visited.length === 0) return null
  const last = props.visited[props.visited.length - 1]
  return props.nodes.find((n) => n.path === last) ?? null
})
const predicted = computed(() => (leaf.value && props.ds ? props.ds.classNames[majority(leaf.value.counts)] : ''))
const shares = computed(() => {
  const l = leaf.value
  if (l === null || props.ds === null) return []
  const n = l.counts.reduce((a, b) => a + b, 0)
  return props.ds.classNames.map((name, k) => ({
    name,
    k,
    count: l.counts[k],
    share: n > 0 ? l.counts[k] / n : 0,
  }))
})
const state = computed<'empty' | 'ready'>(() => (leaf.value === null ? 'empty' : 'ready'))
const pct = (v: number) => new Intl.NumberFormat(lang.value, { style: 'percent', maximumFractionDigits: 0 }).format(v)
</script>

<template>
  <section
    class="tracer"
    data-verify-unit="path"
    :data-verify-state="state"
    :data-verify-count="visited?.length ?? 0"
    :data-verify-class="state === 'ready' ? predicted : undefined"
  >
    <p class="hint">{{ t('splits.trace.hint') }}</p>
    <div v-if="ds" class="fields">
      <label v-for="(f, j) in ds.features" :key="j" class="field">
        <span class="field-label">{{ f.name }}</span>
        <select
          v-if="f.kind === 'categorical'"
          :data-trace-feature="j"
          :value="values[j]"
          @change="emit('update', j, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="(c, code) in f.categories" :key="code" :value="String(code)">{{ c }}</option>
        </select>
        <input
          v-else
          type="text"
          inputmode="decimal"
          autocomplete="off"
          :data-trace-feature="j"
          :value="values[j] ?? ''"
          @input="emit('update', j, ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
    <p v-if="state === 'empty'" class="msg" role="status">
      {{ ds ? t('splits.trace.invalid') : t('status.empty') }}
    </p>
    <div v-else class="result" role="status">
      <p class="pred">
        {{ t('splits.trace.predicted') }}: <strong>{{ predicted }}</strong>
        <span class="muted">· {{ t('splits.trace.length', { n: visited?.length ?? 0 }) }}</span>
      </p>
      <ul class="shares" :aria-label="t('splits.trace.shares')">
        <li v-for="s in shares" :key="s.k">
          <span class="swatch" :style="{ background: `var(--c-class-${s.k % 3})` }" aria-hidden="true" />
          <span class="name">{{ s.name }}</span>
          <span class="track" aria-hidden="true"
            ><span class="fill" :style="{ width: `${s.share * 100}%`, background: `var(--c-class-${s.k % 3})` }"
          /></span>
          <span class="val">{{ s.count }} ({{ pct(s.share) }})</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.hint {
  margin: 0 0 0.6rem;
  font-size: 0.88rem;
  color: var(--text-muted);
}
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.9rem;
}
.field {
  display: grid;
  gap: 0.2rem;
  font-size: 0.85rem;
}
.field-label {
  font-weight: 600;
  overflow-wrap: anywhere;
  max-width: 10rem;
}
input,
select {
  box-sizing: border-box;
  font: inherit;
  min-width: 6rem;
  max-width: 10rem;
  padding: 0.3rem 0.45rem;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
}
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.msg {
  margin: 0.7rem 0 0;
  color: var(--text-muted);
}
.result {
  margin-top: 0.7rem;
}
.pred {
  margin: 0 0 0.4rem;
}
.muted {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin-left: 0.4rem;
}
.shares {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
  max-width: 28rem;
}
.shares li {
  display: grid;
  grid-template-columns: 0.65rem minmax(3rem, 8rem) 1fr auto;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.88rem;
}
.swatch {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 2px;
}
.name {
  overflow-wrap: anywhere;
}
.track {
  height: 0.7rem;
  background: var(--grid);
  border-radius: 2px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
}
.val {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
</style>
