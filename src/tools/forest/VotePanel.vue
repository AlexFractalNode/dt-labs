<script setup lang="ts">
/**
 * Vote panel: every tree's class probabilities at the point x*, the hard vote (majority of the tree classes) next to
 * the probability average. The rules themselves live in core's `aggregate`; this component lists the probabilities,
 * counts the votes through `aggregate` of single trees and shows where the two rules disagree.
 */
import { computed } from 'vue'
import { aggregate } from '../../core/forest'
import { useI18n } from '../../i18n'
import { fmt } from '../../ui/format'

const props = defineProps<{
  state: 'loading' | 'ready' | 'error'
  /** Class probabilities of every tree at x* (or the example); null while no forest exists. */
  probas: number[][] | null
  example: boolean
  xStar: [number, number]
  featureNames: [string, string]
  classNames: string[]
}>()
const emit = defineEmits<{ 'update:xStar': [p: [number, number]]; example: []; point: [] }>()
const { lang, t } = useI18n()

const agg = computed(() => (props.probas && props.probas.length > 0 ? aggregate(props.probas) : null))
/** The class each single tree votes for (its own argmax) and how many trees vote for each class. */
const treeClass = computed(() => (props.probas ?? []).map((p) => aggregate([p]).hardClass))
const votes = computed(() => props.classNames.map((_, c) => treeClass.value.filter((k) => k === c).length))
const disagree = computed(() => agg.value !== null && agg.value.hardClass !== agg.value.meanClass)
const shape = (c: number) => ['●', '■', '▲'][c % 3]
const unitState = computed(() => (props.probas === null ? (props.state === 'error' ? 'error' : 'loading') : 'ready'))

function onField(i: 0 | 1, e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(v)) return
  const next: [number, number] = [props.xStar[0], props.xStar[1]]
  next[i] = v
  emit('update:xStar', next)
}
const cls = (c: number) => props.classNames[c] ?? String(c)
</script>

<template>
  <section
    class="vote"
    data-verify-unit="vote"
    :data-verify-state="unitState"
    :data-verify-count="probas?.length ?? 0"
    :data-verify-hard="unitState === 'ready' && agg ? agg.hardClass : undefined"
    :data-verify-mean="unitState === 'ready' && agg ? agg.meanClass : undefined"
    :data-verify-example="example ? '1' : undefined"
    :aria-busy="unitState === 'loading'"
  >
    <div class="bar">
      <button type="button" class="btn" :class="{ on: example }" data-action="vote-example" :aria-pressed="example" @click="emit('example')">
        {{ t('forest.vote.example', { a: fmt(lang, 0.51, 2), b: fmt(lang, 0.51, 2), c: fmt(lang, 0.01, 2) }) }}
      </button>
      <button v-if="example" type="button" class="btn" data-action="vote-point" @click="emit('point')">
        {{ t('forest.vote.backToPoint') }}
      </button>
    </div>
    <p v-if="example" class="note" data-note="example">{{ t('forest.vote.exampleNote') }}</p>
    <div v-else class="where">
      <span class="where-label">{{ t('forest.vote.point') }}</span>
      <label class="field">
        <span>{{ featureNames[0] }}</span>
        <input
          type="number"
          step="0.05"
          data-field="xstar-0"
          :value="Number(xStar[0].toFixed(3))"
          @change="onField(0, $event)"
        />
      </label>
      <label class="field">
        <span>{{ featureNames[1] }}</span>
        <input
          type="number"
          step="0.05"
          data-field="xstar-1"
          :value="Number(xStar[1].toFixed(3))"
          @change="onField(1, $event)"
        />
      </label>
    </div>
    <p v-if="!example" class="note">{{ t('forest.vote.hint') }}</p>

    <p v-if="unitState === 'loading'" class="placeholder" role="status">{{ t('status.loading') }}</p>
    <p v-else-if="unitState === 'error'" class="error-box" role="alert">{{ t('forest.error.generic') }}</p>
    <template v-else-if="agg">
      <div class="cards">
        <div class="card" data-result="hard">
          <h4>{{ t('forest.vote.hard') }}</h4>
          <p class="big">
            <span aria-hidden="true">{{ shape(agg.hardClass) }}</span>
            {{ t('forest.vote.klass', { name: cls(agg.hardClass) }) }}
          </p>
          <p class="sub">
            {{ t('forest.vote.hardDetail', { votes: votes[agg.hardClass], total: probas!.length }) }}
          </p>
        </div>
        <div class="card" data-result="mean">
          <h4>{{ t('forest.vote.mean') }}</h4>
          <p class="big">
            <span aria-hidden="true">{{ shape(agg.meanClass) }}</span>
            {{ t('forest.vote.klass', { name: cls(agg.meanClass) }) }}
          </p>
          <p class="sub">
            {{ t('forest.vote.meanDetail', { p: fmt(lang, agg.mean[agg.meanClass], 3) }) }}
          </p>
        </div>
      </div>
      <p v-if="disagree" class="note disagree" data-note="disagree">
        {{ t('forest.vote.disagree') }}
      </p>
      <p v-else class="note" data-note="agree">{{ t('forest.vote.agree') }}</p>

      <h4 class="list-title">{{ t('forest.vote.treesTitle', { n: probas!.length }) }}</h4>
      <ol class="trees" tabindex="0" :aria-label="t('forest.vote.treesTitle', { n: probas!.length })">
        <li v-for="(p, i) in probas!" :key="i" data-tree :data-class="treeClass[i]">
          <span class="idx">{{ i + 1 }}</span>
          <span class="meter" aria-hidden="true">
            <span
              v-for="(v, c) in p"
              :key="c"
              class="seg"
              :style="{ width: `${v * 100}%`, background: `var(--c-class-${c % 3})` }"
            />
          </span>
          <span class="vals">{{ p.map((v) => fmt(lang, v, 2)).join(' | ') }}</span>
          <span class="glyph" :title="t('forest.vote.klass', { name: cls(treeClass[i]) })">{{
            shape(treeClass[i])
          }}</span>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.vote {
  display: grid;
  gap: 0.6rem;
  align-content: start;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.where {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
  margin: 0;
  font-size: 0.9rem;
}
.where-label {
  font-weight: 650;
}
.field {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.field input {
  width: 5.5rem;
  font: inherit;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.note {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-muted);
}
.note.disagree {
  padding: 0.4rem 0.6rem;
  border-left: 3px solid var(--focus);
  background: var(--bg);
  color: var(--text);
}
.placeholder {
  margin: 0;
  padding: 1rem;
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: 4px;
}
.error-box {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--error);
  border-left-width: 4px;
  border-radius: 4px;
  background: var(--error-bg);
}
.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
.card {
  padding: 0.45rem 0.6rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  min-width: 0;
}
.card h4 {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.big {
  margin: 0.1rem 0 0;
  font-family: var(--serif);
  font-size: 1.25rem;
}
.sub {
  margin: 0.1rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.list-title {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.trees {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0.4rem;
  max-height: 13rem;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  font-size: 0.82rem;
}
.trees:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.trees li {
  display: grid;
  grid-template-columns: 2.2rem minmax(3rem, 1fr) 6.5rem 1.2rem;
  align-items: center;
  gap: 0.5rem;
  padding: 0.1rem 0;
}
.idx {
  color: var(--text-muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.meter {
  display: flex;
  height: 0.6rem;
  border: 1px solid var(--border);
  border-radius: 2px;
  overflow: hidden;
  background: var(--surface);
}
.seg {
  display: block;
  height: 100%;
}
.vals {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.glyph {
  text-align: center;
}
</style>
