<script setup lang="ts">
import { computed } from 'vue'
import { useI18n, type MessageKey } from '../i18n'
import type { Scenario } from '../tools/scenarios'

/**
 * Explanation box of the active scenario. The root and its live region stay in the DOM (hidden when there is no
 * scenario), so screen readers announce the content that appears when a scenario is applied.
 */
const props = defineProps<{ scenario: Scenario | null; deviated: boolean }>()
const emit = defineEmits<{ close: []; restore: [] }>()
const { t } = useI18n()

const key = (part: 'title' | 'see' | 'watch' | 'next') => `scenario.${props.scenario?.id}.${part}` as MessageKey
const sections = computed(() =>
  props.scenario === null
    ? []
    : [
        { label: t('scenario.noteSee'), text: t(key('see')) },
        { label: t('scenario.noteWatch'), text: t(key('watch')) },
        { label: t('scenario.noteNext'), text: t(key('next')) },
      ],
)
</script>

<template>
  <section
    class="scenario-note"
    data-verify-unit="scenario-note"
    :data-verify-state="scenario ? 'ready' : 'empty'"
    :data-verify-scenario="scenario?.id ?? ''"
    :data-verify-deviated="scenario !== null && deviated ? 'true' : 'false'"
    :hidden="scenario === null"
  >
    <div class="box">
      <button
        v-if="scenario"
        type="button"
        class="close"
        data-action="close"
        :aria-label="t('scenario.close')"
        @click="emit('close')"
      >
        <span aria-hidden="true">×</span>
      </button>
      <div role="status" aria-live="polite">
        <template v-if="scenario">
          <h3 class="note-title">{{ t(key('title')) }}</h3>
          <div class="sections">
            <div v-for="sec in sections" :key="sec.label" class="section">
              <h4>{{ sec.label }}</h4>
              <p>{{ sec.text }}</p>
            </div>
          </div>
          <p v-if="deviated" class="changed">
            <span>{{ t('scenario.changed') }}</span>
            <button type="button" class="btn small" data-action="restore" @click="emit('restore')">
              {{ t('scenario.restore') }}
            </button>
          </p>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.box {
  position: relative;
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  background: var(--surface);
  color: var(--text);
  padding: 0.6rem 2.6rem 0.6rem 0.9rem;
  border-radius: 4px;
  margin: 0.5rem 0;
}
.close {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  font: inherit;
  font-size: 1.2rem;
  line-height: 1;
  width: 2rem;
  height: 2rem;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.close:hover {
  border-color: var(--border);
  color: var(--text);
}
.note-title {
  margin: 0 0 0.4rem;
  font-size: 1.05rem;
}
.sections {
  display: grid;
  gap: 0.4rem 1rem;
}
@media (min-width: 960px) {
  .sections {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
h4 {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.section p {
  margin: 0.15rem 0 0;
}
.changed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.6rem 0 0;
  padding-top: 0.5rem;
  border-top: 1px solid var(--grid);
  color: var(--focus);
  font-weight: 600;
}
</style>
