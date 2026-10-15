<script setup lang="ts">
/**
 * Editable data table of the split workshop: one row per case, features first, class last. Cells are free text
 * (numbers with comma or point, categories as text); the view turns the rows into a dataset. Cell values are
 * rendered as input values only, never as markup.
 */
import { useI18n } from '../../i18n'
import { displayCell, normalizeCell } from './format'

const props = defineProps<{
  header: string[]
  rows: string[][]
  /** Rows of the focused tree node (highlighted). */
  focusRows: number[]
  /** Class index per row (null when the table does not form a dataset), for the colour swatch. */
  classIndex: (number | null)[]
  maxRows: number
  minRows: number
}>()
const emit = defineEmits<{ edit: [row: number, col: number, value: string]; add: []; remove: [row: number] }>()
const { lang, t } = useI18n()

function onChange(e: Event, r: number, c: number) {
  const el = e.target as HTMLInputElement
  const value = normalizeCell(el.value)
  // keep the shown text canonical even when the stored value does not change
  el.value = displayCell(value, lang.value)
  if (value !== props.rows[r][c]) emit('edit', r, c, value)
}
const inFocus = (r: number) => props.focusRows.includes(r)
const swatch = (k: number | null) => (k === null ? undefined : `var(--c-class-${k % 3})`)
</script>

<template>
  <div class="data-table">
    <div class="wrap" tabindex="-1">
      <table>
        <thead>
          <tr>
            <th scope="col" class="no">{{ t('splits.data.case') }}</th>
            <th v-for="(h, j) in header" :key="j" scope="col" :class="{ cls: j === header.length - 1 }">{{ h }}</th>
            <th scope="col" class="act"><span class="sr-only">{{ t('splits.data.actions') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i" :data-row="i" :class="{ 'in-focus': inFocus(i) }" :data-in-focus="String(inFocus(i))">
            <th scope="row" class="no">
              {{ i + 1 }}
              <span v-if="inFocus(i)" class="mark" aria-hidden="true">▸</span>
              <span v-if="inFocus(i)" class="sr-only">{{ t('splits.data.inNode') }}</span>
            </th>
            <td v-for="(cell, j) in r" :key="j" :class="{ cls: j === r.length - 1 }">
              <span
                v-if="j === r.length - 1 && swatch(classIndex[i] ?? null)"
                class="swatch"
                :style="{ background: swatch(classIndex[i] ?? null) }"
                aria-hidden="true"
              />
              <input
                type="text"
                :value="displayCell(cell, lang)"
                :data-row="i"
                :data-col="j"
                :aria-label="t('splits.data.cell', { feature: header[j] ?? '', row: i + 1 })"
                autocomplete="off"
                spellcheck="false"
                @change="onChange($event, i, j)"
              />
            </td>
            <td class="act">
              <button
                type="button"
                class="icon-btn"
                data-action="delete-row"
                :data-row="i"
                :disabled="rows.length <= minRows"
                :aria-label="t('splits.data.deleteRow', { n: i + 1 })"
                :title="t('splits.data.deleteRow', { n: i + 1 })"
                @click="emit('remove', i)"
              >
                ×
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="foot">
      <button type="button" class="btn" data-action="add-row" :disabled="rows.length >= maxRows" @click="emit('add')">
        {{ t('splits.data.addRow') }}
      </button>
      <span class="muted">{{ t('splits.data.addRowHint') }}</span>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative; /* contains the absolutely positioned .sr-only labels */
  max-height: 24rem;
  overflow: auto;
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
  padding: 0.15rem 0.3rem;
  text-align: left;
  border-bottom: 1px solid var(--grid);
  white-space: nowrap;
}
thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-size: 0.75rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  padding: 0.35rem 0.4rem;
}
th.no {
  width: 2.6rem;
  color: var(--text-muted);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
td.cls {
  border-left: 1px solid var(--border);
}
.cls {
  white-space: nowrap;
}
.swatch {
  display: inline-block;
  width: 0.65rem;
  height: 0.65rem;
  margin-right: 0.3rem;
  border-radius: 2px;
  vertical-align: baseline;
}
input {
  box-sizing: border-box;
  width: 5.6rem;
  font: inherit;
  padding: 0.2rem 0.3rem;
  color: var(--text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
}
td.cls input {
  width: 5rem;
}
input:hover {
  border-color: var(--border);
}
input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 0;
  background: var(--bg);
}
/* The focused node's rows: tinted, with a thick bar and a glyph (not colour alone). */
tr.in-focus > * {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
tr.in-focus > th.no {
  box-shadow: inset 3px 0 0 var(--accent);
}
.mark {
  color: var(--accent);
}
.act {
  width: 1.8rem;
  text-align: center;
}
.icon-btn {
  font: inherit;
  font-size: 1.05rem;
  line-height: 1;
  width: 1.6rem;
  height: 1.6rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.icon-btn:hover:not(:disabled) {
  color: var(--error);
  background: var(--error-bg);
}
.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.8rem;
  margin-top: 0.5rem;
}
.muted {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
