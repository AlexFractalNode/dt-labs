<script setup lang="ts">
import { useI18n } from '../i18n'

/** Horizontal bars; the width is `value / max` (default max 1, e.g. importances that sum to 1). */
withDefaults(defineProps<{ items: { label: string; value: number }[]; max?: number }>(), { max: 1 })
const { t } = useI18n()

function pct(value: number, max: number): string {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return `${(share * 100).toFixed(1).replace(/\.0$/, '')}%`
}
</script>

<template>
  <div
    class="bar-list"
    data-verify-unit="bar-list"
    :data-verify-state="items.length === 0 ? 'empty' : 'ready'"
    :data-verify-count="items.length"
  >
    <p v-if="items.length === 0" class="empty">{{ t('status.empty') }}</p>
    <ul v-else>
      <li v-for="(it, i) in items" :key="i">
        <span class="label">{{ it.label }}</span>
        <span class="track" aria-hidden="true">
          <span class="bar" :data-bar="i" :style="{ width: pct(it.value, max) }" />
        </span>
        <span class="value">{{ it.value.toFixed(3) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
li {
  display: grid;
  grid-template-columns: minmax(4rem, 10rem) 1fr 3.5rem;
  gap: 0.5rem;
  align-items: center;
  margin: 0.25rem 0;
  font-size: 0.9rem;
}
.label {
  overflow-wrap: anywhere;
}
.track {
  background: var(--grid);
  height: 0.9rem;
  border-radius: 2px;
  overflow: hidden;
}
.bar {
  display: block;
  height: 100%;
  background: var(--accent);
}
.value {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  text-align: right;
}
.empty {
  color: var(--text-muted);
}
</style>
