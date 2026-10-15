<script setup lang="ts">
/**
 * Cost-complexity pruning path: for every distinct subtree T_k the straight line R(T_k) + α·|L(T_k)| over α, the
 * critical α marked, the current α as a vertical line and the subtree chosen by `pruneTree` highlighted. R and |L|
 * come from core's `costComplexityPath`; this component only evaluates those lines for drawing. Equal alphas of the
 * path (several prunings at the same α) are shown as one subtree: the last entry of such a run, the first that is
 * optimal beyond that α.
 */
import { computed } from 'vue'
import type { CcpPath } from '../../core/prune'
import { useI18n } from '../../i18n'
import { fmt } from '../../ui/format'
import PlotFrame from '../../ui/PlotFrame.vue'

const props = defineProps<{
  path: CcpPath
  /** Current ccp_alpha. */
  alpha: number
  /** Number of leaves of the subtree `pruneTree(fullTree, alpha)`. */
  selectedLeaves: number
}>()
const { lang, t } = useI18n()

const WIDTH = 640
const HEIGHT = 320
const MAX_LABELLED = 6

interface Subtree {
  /** Critical α: the line is the lowest from here on (0 for the full tree). */
  alpha: number
  impurity: number
  leaves: number
}

const subtrees = computed<Subtree[]>(() => {
  const { alphas, impurities, leaves } = props.path
  const out: Subtree[] = []
  for (let i = 0; i < alphas.length; i++) {
    if (i + 1 < alphas.length && alphas[i + 1] === alphas[i]) continue
    out.push({ alpha: alphas[i], impurity: impurities[i], leaves: leaves[i] })
  }
  return out
})
/** The chosen subtree is the one with the leaf count `pruneTree` returned (leaf counts are distinct per subtree). */
const selectedIndex = computed(() => subtrees.value.findIndex((s) => s.leaves === props.selectedLeaves))

const xMax = computed(() => {
  const last = subtrees.value[subtrees.value.length - 1]?.alpha ?? 0
  const m = Math.max(1.2 * last, props.alpha)
  return m > 0 ? m : 0.1
})
/** The root-only line is the highest at the right edge among the useful ones; steeper lines leave the plot. */
const yMax = computed(() => {
  const root = subtrees.value[subtrees.value.length - 1]
  const top = root ? root.impurity + xMax.value * root.leaves : 1
  return Math.max(top, subtrees.value[0]?.impurity ?? 0) * 1.12 || 1
})

const cost = (s: Subtree, a: number) => s.impurity + a * s.leaves
const critical = computed(() => subtrees.value.slice(1))
const labelled = computed(() => critical.value.length <= MAX_LABELLED)
const alphaText = (v: number) => fmt(lang.value, v, 3)
/** '.' decimals for the verification contract. */
const attrAlpha = computed(() => String(Number(props.alpha.toFixed(6))))

const rows = computed(() =>
  subtrees.value.map((s, i) => ({
    ...s,
    to: i + 1 < subtrees.value.length ? subtrees.value[i + 1].alpha : null,
    chosen: i === selectedIndex.value,
  })),
)
</script>

<template>
  <section
    class="path"
    data-verify-unit="pruning-path"
    data-verify-state="ready"
    :data-verify-count="subtrees.length"
    :data-verify-selected="selectedLeaves"
    :data-verify-alpha="attrAlpha"
  >
    <PlotFrame
      :x-domain="[0, xMax]"
      :y-domain="[0, yMax]"
      :width="WIDTH"
      :height="HEIGHT"
      x-label="α"
      :y-label="t('complexity.path.yLabel')"
    >
      <template #default="{ x, y }">
        <line
          v-for="(s, i) in subtrees"
          :key="`l${i}`"
          class="cost"
          :data-leaves="s.leaves"
          :x1="x(0)"
          :y1="y(cost(s, 0))"
          :x2="x(xMax)"
          :y2="y(cost(s, xMax))"
        />
        <!-- chosen line again on top, so it is not hidden by grey ones -->
        <line
          v-if="selectedIndex >= 0"
          class="cost chosen"
          :x1="x(0)"
          :y1="y(cost(subtrees[selectedIndex], 0))"
          :x2="x(xMax)"
          :y2="y(cost(subtrees[selectedIndex], xMax))"
        />
        <line class="current" :x1="x(alpha)" :x2="x(alpha)" :y1="y(0)" :y2="y(yMax)" />
        <g v-for="(s, i) in critical" :key="`c${i}`" class="crit" data-critical>
          <circle :cx="x(s.alpha)" :cy="y(cost(s, s.alpha))" r="4.5" />
          <text v-if="labelled" :x="x(s.alpha)" :y="y(cost(s, s.alpha)) - 9" text-anchor="middle">
            {{ alphaText(s.alpha) }}
          </text>
        </g>
      </template>
    </PlotFrame>

    <ul class="legend" aria-hidden="true">
      <li><span class="key sel" />{{ t('complexity.path.selected') }}</li>
      <li><span class="key cur" />{{ t('complexity.path.current') }}</li>
      <li><span class="key dot" />{{ t('complexity.path.critical') }}</li>
    </ul>
    <p class="summary" role="status">
      {{ t('complexity.path.summary', { alpha: fmt(lang, alpha, 3), leaves: selectedLeaves, count: subtrees.length }) }}
    </p>
    <p class="note">{{ t('complexity.path.hint') }}</p>

    <details class="table">
      <summary>{{ t('complexity.path.table') }}</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">{{ t('complexity.path.leaves') }}</th>
            <th scope="col">{{ t('complexity.path.impurity') }}</th>
            <th scope="col">{{ t('complexity.path.from') }}</th>
            <th scope="col">{{ t('complexity.path.to') }}</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.leaves" :class="{ chosen: r.chosen }" :data-leaves="r.leaves">
            <th scope="row">{{ r.leaves }}</th>
            <td>{{ fmt(lang, r.impurity, 3) }}</td>
            <td>{{ fmt(lang, r.alpha, 3) }}</td>
            <td>{{ r.to === null ? '∞' : fmt(lang, r.to, 3) }}</td>
            <td>{{ r.chosen ? t('complexity.path.chosen') : '' }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </section>
</template>

<style scoped>
.path {
  display: grid;
  gap: 0.5rem;
}
.cost {
  stroke: var(--axis);
  stroke-opacity: 0.45;
  stroke-width: 1;
}
.cost.chosen {
  stroke: var(--accent);
  stroke-opacity: 1;
  stroke-width: 3;
}
.current {
  stroke: var(--focus);
  stroke-width: 2;
  stroke-dasharray: 2 3;
}
.crit circle {
  fill: var(--surface);
  stroke: var(--text);
  stroke-width: 2;
}
.crit text {
  fill: var(--text);
  font-size: 11px;
  paint-order: stroke;
  stroke: var(--surface);
  stroke-width: 3px;
}
.legend {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1.1rem;
  margin: 0;
  padding: 0;
  font-size: 0.85rem;
}
.key {
  display: inline-block;
  width: 1.4rem;
  margin-right: 0.4rem;
  vertical-align: middle;
}
.key.sel {
  border-top: 3px solid var(--accent);
}
.key.cur {
  border-top: 2px dotted var(--focus);
}
.key.dot {
  width: 0.7rem;
  height: 0.7rem;
  border: 2px solid var(--text);
  border-radius: 50%;
  background: var(--surface);
}
.summary {
  margin: 0;
  font-weight: 600;
  font-size: 0.92rem;
}
.note {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-muted);
}
.table {
  max-height: 16rem;
  overflow: auto;
}
.table summary {
  cursor: pointer;
  font-size: 0.85rem;
}
.table table {
  margin-top: 0.4rem;
  border-collapse: collapse;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.table th,
.table td {
  padding: 0.15rem 0.9rem 0.15rem 0;
  text-align: left;
  font-weight: normal;
}
.table thead th {
  font-weight: 650;
  border-bottom: 1px solid var(--border);
}
.table tr.chosen th,
.table tr.chosen td {
  font-weight: 700;
  color: var(--accent);
}
</style>
