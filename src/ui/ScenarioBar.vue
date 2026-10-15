<script setup lang="ts">
import { computed } from 'vue'
import { useI18n, type MessageKey } from '../i18n'
import { scenariosFor, type Scenario, type ToolId } from '../tools/scenarios'

/** Ready-made scenarios of one tool as cards; the active one is pressed. Clicking a card asks the view to apply it. */
const props = defineProps<{ tool: ToolId; activeId: string | null }>()
const emit = defineEmits<{ apply: [scenario: Scenario] }>()
const { t } = useI18n()

const list = computed(() => scenariosFor(props.tool))
const key = (s: Scenario, part: 'title' | 'short') => `scenario.${s.id}.${part}` as MessageKey
</script>

<template>
  <div
    class="scenario-bar"
    role="group"
    :aria-label="t('scenario.barLabel')"
    data-verify-unit="scenario-bar"
    :data-verify-state="list.length > 0 ? 'ready' : 'empty'"
    :data-verify-count="list.length"
  >
    <button
      v-for="s in list"
      :key="s.id"
      type="button"
      class="card"
      :class="{ on: s.id === activeId }"
      :data-scenario="s.id"
      :aria-pressed="s.id === activeId ? 'true' : 'false'"
      @click="emit('apply', s)"
    >
      <span class="card-title">{{ t(key(s, 'title')) }}</span>
      <span class="card-short">{{ t(key(s, 'short')) }}</span>
    </button>
  </div>
</template>

<style scoped>
.scenario-bar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
}
.card {
  font: inherit;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: left;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.card:hover {
  border-color: var(--accent);
}
.card.on {
  border-color: var(--accent);
  box-shadow: inset 4px 0 0 var(--accent);
}
.card-title {
  font-weight: 600;
}
.card.on .card-title {
  color: var(--accent);
}
.card-short {
  font-size: 0.85rem;
  color: var(--text-muted);
}
@media (max-width: 767px) {
  .scenario-bar {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
