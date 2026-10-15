<script setup lang="ts">
/**
 * Gallery of the first trees of the forest: each tile shows the leaf regions of one tree and its bootstrap sample
 * (point size = how often a case was drawn, hollow = out of bag). Data come from the forest job; this component
 * only lays them out and counts drawn / out-of-bag cases for the captions.
 */
import { computed } from 'vue'
import type { Bounds } from '../../core/generators'
import type { Region } from '../../core/regions'
import { useI18n } from '../../i18n'
import GalleryTile from './GalleryTile.vue'

const props = defineProps<{
  state: 'loading' | 'ready' | 'error'
  items: { regions: Region[]; counts: number[] }[]
  X: number[][]
  y: number[]
  bounds: Bounds
  colors: string[]
  bootstrap: boolean
  /** Number of tiles expected (known before the job finishes). */
  expected: number
}>()
const { t } = useI18n()

const tiles = computed(() =>
  props.items.map((it, i) => {
    const drawn = it.counts.filter((c) => c > 0).length
    const n = it.counts.length
    return {
      key: i,
      regions: it.regions,
      counts: it.counts,
      label: t('forest.gallery.tile', { k: i + 1, leaves: it.regions.length }),
      title: t('forest.gallery.tree', { k: i + 1 }),
      detail: props.bootstrap
        ? t('forest.gallery.sample', { drawn, n, oob: n - drawn })
        : t('forest.gallery.all', { n }),
      leaves: t('forest.gallery.leaves', { n: it.regions.length }),
    }
  }),
)
</script>

<template>
  <section
    class="gallery"
    data-verify-unit="tree-gallery"
    :data-verify-state="state === 'ready' && items.length === 0 ? 'empty' : state"
    :data-verify-count="state === 'error' ? 0 : state === 'loading' && items.length === 0 ? expected : items.length"
    :aria-busy="state === 'loading'"
  >
    <ul class="tiles" :class="{ stale: state === 'loading' }">
      <li v-for="tile in tiles" :key="tile.key" class="tile" data-gallery-tile>
        <GalleryTile
          :regions="tile.regions"
          :counts="tile.counts"
          :X="X"
          :y="y"
          :bounds="bounds"
          :colors="colors"
          :label="tile.label"
        />
        <p class="cap">
          <strong>{{ tile.title }}</strong> · {{ tile.leaves }}
        </p>
        <p class="cap muted">{{ tile.detail }}</p>
      </li>
      <li v-for="k in state === 'loading' && items.length === 0 ? expected : 0" :key="`s${k}`" class="tile skeleton" aria-hidden="true">
        <div class="ph" />
      </li>
    </ul>
    <ul class="legend" aria-hidden="true">
      <li><svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="4.5" class="key solid" /></svg>{{ t('forest.gallery.legendDrawn') }}</li>
      <li><svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="4.5" class="key hollow" /></svg>{{ t('forest.gallery.legendOob') }}</li>
      <li><svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="2.5" class="key solid" /><circle cx="8" cy="8" r="6" class="key ring" /></svg>{{ t('forest.gallery.legendSize') }}</li>
    </ul>
  </section>
</template>

<style scoped>
.tiles {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.8rem 0.7rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (min-width: 560px) {
  .tiles {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 900px) {
  .tiles {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.tiles.stale {
  opacity: 0.5;
}
.tile {
  min-width: 0;
}
.cap {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  line-height: 1.35;
}
.cap.muted {
  margin-top: 0;
  color: var(--text-muted);
}
.ph {
  aspect-ratio: 200 / 150;
  border: 1px dashed var(--border);
  border-radius: 3px;
}
.legend {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1.1rem;
  margin: 0.7rem 0 0;
  padding: 0;
  font-size: 0.85rem;
}
.legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.key.solid {
  fill: var(--c-class-0);
  stroke: var(--c-points);
  stroke-width: 0.8;
}
.key.hollow {
  fill: none;
  stroke: var(--c-class-0);
  stroke-width: 1.4;
}
.key.ring {
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1;
  stroke-dasharray: 2 2;
}
</style>
