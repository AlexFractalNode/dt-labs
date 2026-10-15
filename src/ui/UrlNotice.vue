<script setup lang="ts">
import { useI18n, type MessageKey } from '../i18n'

/** Corrections made while reading the address; each problem is an i18n key `url.problem.<param>`. */
defineProps<{ problems: string[] }>()
const { t } = useI18n()
</script>

<template>
  <section
    class="url-notice"
    data-verify-unit="url-notice"
    :data-verify-state="problems.length === 0 ? 'empty' : 'ready'"
    :data-verify-count="problems.length"
  >
    <div v-if="problems.length > 0" class="box" role="status">
      <strong>{{ t('url.noticeTitle') }}</strong>
      <p class="intro">{{ t('url.noticeIntro') }}</p>
      <ul>
        <li v-for="p in problems" :key="p">{{ t(p as MessageKey) }}</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.box {
  border: 1px solid var(--border);
  border-left: 4px solid var(--focus);
  background: var(--surface);
  color: var(--text);
  padding: 0.5rem 0.8rem;
  border-radius: 4px;
  margin: 0.5rem 0;
}
.intro {
  margin: 0.2rem 0;
}
ul {
  margin: 0.2rem 0 0;
  padding-left: 1.2rem;
}
</style>
