<script setup lang="ts">
import { useI18n, type MessageKey } from '../../i18n'
import { buildHash, type Route } from '../../urlState'
import RefBadge from '../../ui/RefBadge.vue'

const { t } = useI18n()

interface ToolCard {
  route: Exclude<Route, 'home'>
  name: MessageKey
  summary: MessageKey
  goal: MessageKey
  chapter: string
  code: string
}

// Chapter and notebook-cell references follow the learning goals in Spec §4 (zero-based cell numbers).
const TOOLS: ToolCard[] = [
  {
    route: 'splits',
    name: 'nav.splits',
    summary: 'home.tool.splits.summary',
    goal: 'home.tool.splits.goal',
    chapter: '3–5, 8.4',
    code: '99–128',
  },
  {
    route: 'complexity',
    name: 'nav.complexity',
    summary: 'home.tool.complexity.summary',
    goal: 'home.tool.complexity.goal',
    chapter: '9–11',
    code: '62, 75–82, 170–212',
  },
  {
    route: 'forest',
    name: 'nav.forest',
    summary: 'home.tool.forest.summary',
    goal: 'home.tool.forest.goal',
    chapter: '12–13',
    code: '213–270',
  },
]
</script>

<template>
  <div class="home" data-verify-unit="home" data-verify-state="ready" :data-verify-count="TOOLS.length">
    <header class="home-head">
      <h2 class="title">{{ t('home.title') }}</h2>
      <p class="lead">{{ t('home.lead') }}</p>
    </header>

    <section aria-labelledby="home-tools-title">
      <h3 id="home-tools-title" class="section-label">{{ t('home.toolsTitle') }}</h3>
      <ul class="cards">
        <li v-for="(tool, i) in TOOLS" :key="tool.route" class="card" :data-tool="tool.route">
          <div class="card-top">
            <span class="ordinal" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
            <h4 class="card-title">{{ t(tool.name) }}</h4>
          </div>
          <p class="summary">{{ t(tool.summary) }}</p>
          <p class="goal">
            <span class="goal-label">{{ t('home.goal') }}</span>
            {{ t(tool.goal) }}
          </p>
          <RefBadge :chapter="tool.chapter" :code="tool.code" />
          <div class="card-actions">
            <a class="open" :href="buildHash(tool.route)">{{ t('home.open', { tool: t(tool.name) }) }}</a>
          </div>
        </li>
      </ul>
    </section>

    <footer class="fine">
      <section aria-labelledby="home-notice-title">
        <h3 id="home-notice-title" class="section-label">{{ t('home.noticeTitle') }}</h3>
        <p>{{ t('home.notice') }}</p>
      </section>
    </footer>
  </div>
</template>

<style scoped>
.home {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  gap: 2rem;
  padding-bottom: 1rem;
}
.home-head {
  padding: 1rem 0 1.25rem;
  border-bottom: 1px solid var(--border);
}
.title {
  margin: 0;
  max-width: 34ch;
  font-family: var(--serif);
  font-size: clamp(1.6rem, 1.2rem + 1.6vw, 2.35rem);
  font-weight: 600;
  line-height: 1.2;
  text-wrap: balance;
}
.title cite {
  font-style: italic;
}
.lead {
  margin: 0.75rem 0 0;
  max-width: 64ch;
  color: var(--text-muted);
  line-height: 1.55;
}
.section-label {
  margin: 0 0 0.6rem;
  font-size: 0.75rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* Tool cards */
.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 1rem;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1.1rem 1.2rem 1.2rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: 3px solid var(--accent);
  border-radius: 6px;
  min-width: 0;
}
.card-top {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}
.ordinal {
  font-family: var(--serif);
  font-size: 0.95rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.card-title {
  margin: 0;
  font-family: var(--serif);
  font-size: 1.3rem;
  font-weight: 600;
}
.summary,
.goal {
  margin: 0;
  line-height: 1.5;
}
.goal {
  font-size: 0.92rem;
  color: var(--text-muted);
}
.goal-label {
  display: block;
  margin-bottom: 0.15rem;
  font-size: 0.72rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.card :deep(.ref-badge) {
  align-self: flex-start;
  border-radius: 6px;
}
.card-actions {
  margin-top: auto;
  padding-top: 0.3rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
.open {
  display: inline-block;
  padding: 0.4rem 0.9rem;
  border-radius: 4px;
  background: var(--accent);
  color: var(--surface);
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
}
.open:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Notice */
.fine {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr));
  gap: 1rem 2rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
}
.fine p {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--text-muted);
}
</style>
