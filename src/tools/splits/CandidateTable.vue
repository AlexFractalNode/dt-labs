<script setup lang="ts">
/**
 * Candidate questions of the focused node: feature, question, left/right counts, weighted remaining impurity, local
 * gain and global contribution. Best and tied rows are marked with a text badge. Categorical features get a
 * non-selectable multiway comparison row (ID3 gain, Spec 3.2).
 */
import { computed } from 'vue'
import type { ClassDataset } from '../../core/dataset'
import type { ManualNode } from '../../core/manual'
import { candidateKey } from '../../core/splits'
import { useI18n } from '../../i18n'
import { fmt, gainAttr, questionText } from './format'

const props = defineProps<{
  ds: ClassDataset | null
  node: ManualNode | null
  /** Candidate key applied at this node, if any. */
  appliedKey: string | null
  /** True for the unchanged "eight cases" preset: only then the tie note quotes the notebook example. */
  eightExample?: boolean
}>()
const emit = defineEmits<{ apply: [key: string] }>()
const { lang, t } = useI18n()

const rows = computed(() => {
  const { ds, node } = props
  if (ds === null || node === null) return []
  return node.candidates.map((c) => ({
    c,
    key: candidateKey(c),
    feature: ds.features[c.feature].name,
    question: questionText(ds, c, lang.value),
    perClass: (counts: number[]) => counts.join(' · '),
  }))
})
const multiway = computed(() => {
  const { ds, node } = props
  if (ds === null || node === null || node.candidates.length === 0) return []
  const out: { feature: string; index: number; gain: number }[] = []
  node.multiway.forEach((g, j) => {
    if (g !== null) out.push({ feature: ds.features[j].name, index: j, gain: g })
  })
  return out
})
const state = computed<'empty' | 'ready'>(() => (rows.value.length === 0 ? 'empty' : 'ready'))
const hasTie = computed(() => rows.value.some((r) => r.c.isTie))
/** A pure node: sklearn does not split it, so there is no "best" and no tie (core sets neither flag). */
const isPure = computed(() => props.node !== null && props.node.impurity <= 0)
</script>

<template>
  <section
    class="candidates"
    data-verify-unit="split-candidates"
    :data-verify-state="state"
    :data-verify-count="rows.length"
    :aria-label="t('splits.cand.title')"
  >
    <p v-if="ds === null || node === null" class="msg">{{ t('status.empty') }}</p>
    <p v-else-if="rows.length === 0" class="msg" role="status">{{ t('splits.cand.none') }}</p>
    <template v-else>
      <div class="wrap">
        <table>
          <thead>
            <tr>
              <th scope="col" class="feat">{{ t('splits.cand.feature') }}</th>
              <th scope="col">{{ t('splits.cand.question') }}</th>
              <th scope="col" class="num">{{ t('splits.cand.sides') }}</th>
              <th scope="col" class="num">{{ t('splits.cand.rest') }}</th>
              <th scope="col" class="num">{{ t('splits.cand.gain') }}</th>
              <th scope="col" class="num">{{ t('splits.cand.global') }}</th>
              <th scope="col" class="act"><span class="sr-only">{{ t('splits.cand.action') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.key"
              :class="{ best: r.c.isBest, tie: r.c.isTie, applied: r.key === appliedKey }"
              :data-verify-key="r.key"
              :data-verify-best="String(r.c.isBest)"
              :data-verify-tie="String(r.c.isTie)"
              :data-verify-gain="gainAttr(r.c.gain)"
              :data-verify-applied="String(r.key === appliedKey)"
            >
              <td class="feat">{{ r.feature }}</td>
              <td class="q">
                <span class="q-text">{{ r.question }}</span>
                <span v-if="r.c.isBest" class="badge best-badge">{{ t('splits.cand.best') }}</span>
                <span v-if="r.c.isTie" class="badge tie-badge">{{ t('splits.cand.tie') }}</span>
              </td>
              <td class="num">
                {{ r.c.nLeft }} | {{ r.c.nRight }}
                <span class="sub">({{ r.perClass(r.c.left) }} | {{ r.perClass(r.c.right) }})</span>
              </td>
              <td class="num">{{ fmt(lang, r.c.childImpurity, 4) }}</td>
              <td class="num strong">{{ fmt(lang, r.c.gain, 4) }}</td>
              <td class="num">{{ fmt(lang, r.c.globalGain, 4) }}</td>
              <td class="act">
                <button
                  type="button"
                  class="btn small"
                  :class="{ on: r.key === appliedKey }"
                  data-action="apply-split"
                  :aria-pressed="r.key === appliedKey"
                  :aria-label="t('splits.cand.applyLabel', { question: r.question })"
                  @click="emit('apply', r.key)"
                >
                  {{ r.key === appliedKey ? t('splits.cand.applied') : t('splits.cand.apply') }}
                </button>
              </td>
            </tr>
            <tr
              v-for="m in multiway"
              :key="`mw-${m.index}`"
              class="multiway"
              :data-verify-multiway="m.index"
              :data-verify-gain="gainAttr(m.gain)"
            >
              <td class="feat">{{ m.feature }}</td>
              <td class="q">
                <span class="q-text"><span class="mw-feat">{{ m.feature }}: </span>{{ t('splits.cand.multiway') }}</span>
              </td>
              <td class="num">–</td>
              <td class="num">–</td>
              <td class="num strong">{{ fmt(lang, m.gain, 4) }}</td>
              <td class="num">–</td>
              <td class="act"><span class="muted">{{ t('splits.cand.notSelectable') }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="isPure" class="note pure-note" data-note="pure">{{ t('splits.cand.pure') }}</p>
      <p v-if="multiway.length > 0" class="note" data-note="multiway">{{ t('splits.cand.multiwayNote') }}</p>
      <p v-if="hasTie" class="note tie-note" data-note="tie">
        {{ t('splits.cand.tieNote') }}<template v-if="eightExample"> {{ t('splits.cand.tieNoteEight') }}</template>
      </p>
    </template>
  </section>
</template>

<style scoped>
.msg {
  margin: 0.5rem 0;
  color: var(--text-muted);
}
.wrap {
  position: relative; /* contains the absolutely positioned .sr-only labels */
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.88rem;
}
th,
td {
  padding: 0.4rem 0.5rem;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--grid);
}
thead th {
  font-size: 0.74rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sub {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.strong {
  font-weight: 650;
}
.q-text {
  margin-right: 0.35rem;
  overflow-wrap: anywhere;
}
.badge {
  display: inline-block;
  padding: 0 0.4rem;
  border-radius: 999px;
  border: 1px solid currentColor;
  font-size: 0.7rem;
  font-weight: 650;
  line-height: 1.5;
  white-space: nowrap;
}
.best-badge {
  color: var(--accent);
}
.tie-badge {
  color: var(--focus);
  margin-left: 0.2rem;
}
/* Best row: bar on the left; applied row: tint. Both also carry text, never colour alone. */
tr.best > td:first-child {
  box-shadow: inset 3px 0 0 var(--accent);
}
tr.applied > td {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
tr.multiway > td {
  color: var(--text-muted);
  font-style: italic;
  border-top: 1px dashed var(--border);
}
.mw-feat {
  display: none;
}
.q {
  min-width: 8rem;
}
/* Narrow screens: the question already names the feature, so the extra column goes. */
@media (max-width: 640px) {
  .feat {
    display: none;
  }
  .mw-feat {
    display: inline;
  }
}
.act {
  text-align: right;
  white-space: nowrap;
}
.muted {
  font-size: 0.75rem;
}
.note {
  margin: 0.6rem 0 0;
  max-width: 70ch;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--text-muted);
}
.pure-note {
  padding-left: 0.6rem;
  border-left: 3px solid var(--border);
  color: var(--text);
}
.tie-note {
  padding-left: 0.6rem;
  border-left: 3px solid var(--focus);
  color: var(--text);
}
</style>
