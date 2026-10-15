<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../i18n'
import { layoutTree, type DiagramNode } from './treeLayout'

/**
 * Tree as SVG. Node texts are plain text content (never markup). Nodes below `collapseDepth` are folded into
 * the node at that depth, which shows "+N". Click, Enter or Space on a node emits `select(id)`.
 */
const props = withDefaults(
  defineProps<{
    nodes: DiagramNode[]
    focus?: number | null
    /** Ids on the highlighted path (e.g. the route of a traced case). */
    path?: number[]
    collapseDepth?: number
    /** One colour per class for the class-share bar of a node. */
    colors?: string[]
  }>(),
  {
    focus: null,
    path: () => [],
    collapseDepth: 6,
    colors: () => ['var(--c-class-0, #2b5c9e)', 'var(--c-class-1, #b4530a)', 'var(--c-class-2, #3d7a4a)'],
  },
)
const emit = defineEmits<{ select: [id: number] }>()
const { t } = useI18n()

const NODE_W = 108
const NODE_H = 48
const GAP_X = 14
const GAP_Y = 36
const PAD = 8
const BAR_H = 5
const MAX_CHARS = 17

const layout = computed(() => layoutTree(props.nodes, props.collapseDepth))
const onPath = computed(() => new Set(props.path))
const placed = computed(() =>
  layout.value.nodes.map((n) => ({
    ...n,
    px: PAD + n.x * (NODE_W + GAP_X),
    py: PAD + n.y * (NODE_H + GAP_Y),
  })),
)
const byId = computed(() => new Map(placed.value.map((n) => [n.id, n])))
const edges = computed(() =>
  placed.value
    .filter((n) => byId.value.has(n.parent))
    .map((n) => {
      const p = byId.value.get(n.parent)!
      const x1 = p.px + NODE_W / 2
      const y1 = p.py + NODE_H
      const x2 = n.px + NODE_W / 2
      const y2 = n.py
      const mid = (y1 + y2) / 2
      return {
        id: n.id,
        d: `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`,
        onPath: onPath.value.has(n.id) && onPath.value.has(n.parent),
      }
    }),
)
const size = computed(() => ({
  width: PAD * 2 + Math.max(0, layout.value.width - 1) * (NODE_W + GAP_X) + NODE_W,
  height: PAD * 2 + Math.max(0, layout.value.height - 1) * (NODE_H + GAP_Y) + NODE_H,
}))

function short(s: string): string {
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s
}

function bars(counts: number[]): { x: number; w: number; fill: string }[] {
  let total = 0
  for (const c of counts) total += c
  if (total <= 0) return []
  let x = 0
  const out: { x: number; w: number; fill: string }[] = []
  counts.forEach((c, i) => {
    if (c <= 0) return
    const w = (c / total) * NODE_W
    out.push({ x, w, fill: props.colors[i % props.colors.length] })
    x += w
  })
  return out
}

function select(id: number) {
  emit('select', id)
}
</script>

<template>
  <div
    class="tree-diagram"
    data-verify-unit="tree"
    :data-verify-state="layout.nodes.length === 0 ? 'empty' : 'ready'"
    :data-verify-count="layout.nodes.length"
  >
    <p v-if="layout.nodes.length === 0" class="empty">{{ t('status.empty') }}</p>
    <svg
      v-else
      :width="size.width"
      :height="size.height"
      :viewBox="`0 0 ${size.width} ${size.height}`"
      role="group"
      :aria-label="t('tree.label')"
    >
      <g class="edges" aria-hidden="true">
        <path v-for="e in edges" :key="e.id" :d="e.d" :class="{ 'on-path': e.onPath }" />
      </g>
      <g
        v-for="n in placed"
        :key="n.id"
        class="node"
        :class="{ leaf: n.leaf, focused: focus === n.id, 'on-path': onPath.has(n.id) }"
        :data-node-id="n.id"
        :data-focused="String(focus === n.id)"
        :data-on-path="String(onPath.has(n.id))"
        :transform="`translate(${n.px},${n.py})`"
        role="button"
        tabindex="0"
        :aria-pressed="focus === n.id"
        :aria-label="`${n.title}, ${n.detail}`"
        @click="select(n.id)"
        @keydown.enter.prevent="select(n.id)"
        @keydown.space.prevent="select(n.id)"
      >
        <title>{{ n.title }} · {{ n.detail }}</title>
        <rect class="box" :width="NODE_W" :height="NODE_H" rx="4" />
        <text class="t-title" x="6" y="17">{{ short(n.title) }}</text>
        <text class="t-detail" x="6" y="33">{{ short(n.detail) }}</text>
        <text v-if="n.collapsed" class="t-collapsed" :x="NODE_W - 6" y="17" text-anchor="end">
          +{{ n.collapsed }}
        </text>
        <g :transform="`translate(0,${NODE_H - BAR_H})`" aria-hidden="true">
          <rect v-for="(b, i) in bars(n.counts)" :key="i" :x="b.x" :width="b.w" :height="BAR_H" :fill="b.fill" />
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.tree-diagram {
  overflow: auto;
  max-width: 100%;
}
.empty {
  color: var(--text-muted);
  margin: 0.5rem 0;
}
svg {
  display: block;
  font-size: 12px;
}
.edges path {
  fill: none;
  stroke: var(--axis);
  stroke-width: 1.2;
}
.edges path.on-path {
  stroke: var(--focus);
  stroke-width: 2.5;
}
.node {
  cursor: pointer;
  outline: none;
}
.box {
  fill: var(--surface);
  stroke: var(--border);
  stroke-width: 1.2;
}
.node.on-path .box {
  stroke: var(--focus);
  stroke-width: 2.5;
}
.node.focused .box {
  stroke: var(--accent);
  stroke-width: 3;
}
.node:focus-visible .box {
  stroke: var(--focus);
  stroke-width: 3;
  stroke-dasharray: 5 3;
}
.t-title {
  fill: var(--text);
  font-weight: 600;
}
.t-detail,
.t-collapsed {
  fill: var(--text-muted);
}
.t-collapsed {
  font-weight: 600;
}
</style>
