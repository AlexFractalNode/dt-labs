import { expect, test, type Page } from '@playwright/test'
import { SCENARIOS, scenarioHref, type Scenario, type ToolId } from '../../src/tools/scenarios'

/** Collects console errors and uncaught exceptions of a page. */
function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

const unit = (name: string) => `[data-verify-unit="${name}"]`
const T = { timeout: 10_000 }
/** The variance measurement is allowed to take a minute. */
const LONG = { timeout: 60_000 }
const card = (page: Page, id: string) => page.locator(`${unit('scenario-bar')} [data-scenario="${id}"]`)
const note = (page: Page) => page.locator(unit('scenario-note'))
const lang = (page: Page) => page.locator(unit('lang-toggle'))
const row = (page: Page, key: string) => page.locator(`${unit('split-candidates')} tr[data-verify-key="${key}"]`)

/** The view of `tool` is rendered (a state attribute of one of its units is there). */
const READY: Record<ToolId, string> = { splits: 'splits-data', complexity: 'metrics', forest: 'forest-plot' }

async function openTool(page: Page, tool: ToolId, query = 'lang=de') {
  await page.goto(`/#/${tool}?${query}`)
  await expect(card(page, SCENARIOS.find((s) => s.tool === tool)!.id)).toBeVisible(T)
  await expect(page.locator(unit(READY[tool]))).toHaveAttribute('data-verify-state', /^(ready|loading)$/, T)
}

async function openScenario(page: Page, s: Scenario, mode: 'click' | 'link') {
  if (mode === 'link') {
    await page.goto(`/${scenarioHref(s, 'de')}`)
  } else {
    await openTool(page, s.tool)
    await card(page, s.id).click()
  }
  await expect(note(page)).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(note(page)).toHaveAttribute('data-verify-scenario', s.id)
  await expect(page).toHaveURL(new RegExp(`scenario=${s.id}(&|$)`))
  await expect(card(page, s.id)).toHaveAttribute('aria-pressed', 'true')
}

/** The core numbers of each scenario, read from the data-verify contracts. */
const CHECKS: Record<string, (page: Page) => Promise<void>> = {
  s1: async (page) => {
    await expect(page.locator(unit('split-candidates'))).toHaveAttribute('data-verify-count', '3', T)
    const best = row(page, '2:category:0')
    await expect(best).toHaveAttribute('data-verify-best', 'true')
    expect(parseFloat((await best.getAttribute('data-verify-gain')) ?? 'NaN')).toBe(1)
  },
  s2: async (page) => {
    await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '5', T)
    await expect(page.locator(`${unit('split-candidates')} tr[data-verify-tie="true"]`)).toHaveCount(2)
  },
  s3: async (page) => {
    await expect(page.locator(unit('split-candidates'))).toHaveAttribute('data-verify-state', 'ready', T)
    const zero = row(page, '0:category:1')
    await expect(zero).toHaveCount(1)
    expect(Math.abs(parseFloat((await zero.getAttribute('data-verify-gain')) ?? 'NaN'))).toBeLessThan(1e-6)
    const ties = await page
      .locator(`${unit('split-candidates')} tr[data-verify-tie="true"]`)
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-verify-key')).sort())
    expect(ties).toEqual(['0:category:0', '2:category:0'])
  },
  c1: async (page) => {
    const m = page.locator(unit('metrics'))
    await expect(m).toHaveAttribute('data-verify-state', 'ready', T)
    await expect(m).toHaveAttribute('data-verify-train', '1')
    await expect(m).toHaveAttribute('data-verify-leaves', '30')
  },
  c2: async (page) => {
    const m = page.locator(unit('metrics'))
    await expect(m).toHaveAttribute('data-verify-state', 'ready', T)
    expect(Number(await m.getAttribute('data-verify-leaves'))).toBeLessThan(30)
    expect(Number(await m.getAttribute('data-verify-cv'))).toBeGreaterThan(0.85)
  },
  c3: async (page) => {
    await expect(page.locator(unit('pruning-path'))).toHaveAttribute('data-verify-selected', '2', T)
  },
  f1: async (page) => {
    const plot = page.locator(unit('forest-plot'))
    await expect(plot).toHaveAttribute('data-verify-state', 'ready', T)
    await expect(plot).toHaveAttribute('data-verify-count', '100')
  },
  f2: async (page) => {
    const vote = page.locator(unit('vote'))
    await expect(vote).toHaveAttribute('data-verify-count', '3', T)
    await expect(vote).toHaveAttribute('data-verify-hard', '1')
    await expect(vote).toHaveAttribute('data-verify-mean', '0')
  },
  f3: async (page) => {
    const v = page.locator(unit('variance'))
    await expect(v).toHaveAttribute('data-verify-state', 'ready', LONG)
    await expect(v).toHaveAttribute('data-verify-runs', '1')
    expect(Number(await v.getAttribute('data-verify-rho'))).toBeGreaterThanOrEqual(0.999)
    await expect(page.locator(unit('oob-curve'))).toHaveAttribute('data-verify-state', 'empty', T)
  },
}

for (const s of SCENARIOS) {
  for (const mode of ['click', 'link'] as const) {
    test(`scenario ${s.id} by ${mode}`, async ({ page }) => {
      if (s.id === 'f3') test.setTimeout(120_000)
      const errors = trackErrors(page)
      await openScenario(page, s, mode)
      await CHECKS[s.id](page)
      expect(errors).toEqual([])
    })
  }
}

test('closing the box removes scenario from the address', async ({ page }) => {
  await openScenario(page, SCENARIOS.find((s) => s.id === 's1')!, 'link')
  await note(page).locator('[data-action="close"]').click()
  await expect(note(page)).toHaveAttribute('data-verify-state', 'empty')
  await expect(page).not.toHaveURL(/scenario=/)
  await expect(page).toHaveURL(/preset=speed/)
  await expect(card(page, 's1')).toHaveAttribute('aria-pressed', 'false')
})

test('a changed setting marks the scenario as deviated and restore brings it back; language keeps scenario', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openScenario(page, SCENARIOS.find((s) => s.id === 's2')!, 'link')
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '5', T)
  await expect(note(page)).toHaveAttribute('data-verify-deviated', 'false')
  await page.locator('input[name="criterion"][value="gini"]').check({ force: true })
  await expect(note(page)).toHaveAttribute('data-verify-deviated', 'true')
  await expect(page).toHaveURL(/scenario=s2/)
  await note(page).locator('[data-action="restore"]').click()
  await expect(note(page)).toHaveAttribute('data-verify-deviated', 'false')
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '5')
  await lang(page).click()
  await expect(page).toHaveURL(/scenario=s2/)
  await expect(page).toHaveURL(/lang=en/)
  await expect(note(page)).toHaveAttribute('data-verify-scenario', 's2')
  expect(errors).toEqual([])
})

test('splits: applying s1 again resets a manually grown tree', async ({ page }) => {
  await openTool(page, 'splits')
  await card(page, 's1').click()
  await expect(note(page)).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '1')
  await page.locator('[data-action="best-split"]').click()
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '3', T)
  await card(page, 's1').click()
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '1', T)
  await expect(note(page)).toHaveAttribute('data-verify-deviated', 'false')
})

test('forest: applying f2 again leaves a clicked point and shows the example', async ({ page }) => {
  const errors = trackErrors(page)
  await openTool(page, 'forest')
  await card(page, 'f2').click()
  const vote = page.locator(unit('vote'))
  await expect(vote).toHaveAttribute('data-verify-count', '3', T)
  await expect(page.locator(unit('forest-plot'))).toHaveAttribute('data-verify-state', 'ready', T)
  await page.locator(`${unit('forest-plot')} rect.capture`).click({ position: { x: 100, y: 100 } })
  await expect(vote).not.toHaveAttribute('data-verify-count', '3')
  await card(page, 'f2').click()
  await expect(vote).toHaveAttribute('data-verify-count', '3', T)
  await expect(vote).toHaveAttribute('data-verify-example', '1')
  expect(errors).toEqual([])
})

test('forest: f3 measures exactly once per application', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = trackErrors(page)
  await page.goto(`/${scenarioHref(SCENARIOS.find((s) => s.id === 'f3')!, 'de')}`)
  const v = page.locator(unit('variance'))
  await expect(v).toHaveAttribute('data-verify-state', 'ready', LONG)
  await expect(v).toHaveAttribute('data-verify-runs', '1')
  await page.waitForTimeout(3000)
  await expect(v).toHaveAttribute('data-verify-runs', '1')
  await lang(page).click()
  await expect(page).toHaveURL(/lang=en/)
  await page.waitForTimeout(500)
  await expect(v).toHaveAttribute('data-verify-runs', '1')
  await card(page, 'f3').click()
  await expect(v).toHaveAttribute('data-verify-runs', '2', T)
  await expect(v).toHaveAttribute('data-verify-state', 'ready', LONG)
  await expect(v).toHaveAttribute('data-verify-runs', '2')
  expect(errors).toEqual([])
})

test('a scenario of another tool is ignored with a notice and dropped on the next change', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/#/splits?scenario=f2&lang=de')
  await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(page.locator(unit('url-notice'))).toHaveAttribute('data-verify-count', '1')
  await expect(note(page)).toHaveAttribute('data-verify-state', 'empty')
  await page.locator('input[name="criterion"][value="gini"]').check({ force: true })
  await expect(page).not.toHaveURL(/scenario=/)
  await expect(page).toHaveURL(/criterion=gini/)
  expect(errors).toEqual([])
})

for (const tool of ['splits', 'complexity', 'forest'] as const) {
  for (const l of ['de', 'en'] as const) {
    test(`no horizontal overflow at 375 px: ${tool} ${l} with an open scenario box`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 })
      const s = SCENARIOS.find((x) => x.tool === tool)!
      await page.goto(`/${scenarioHref(s, l)}`)
      await expect(note(page)).toHaveAttribute('data-verify-state', 'ready', T)
      await expect(page.locator(unit('scenario-bar'))).toBeVisible()
      await expect(note(page)).toBeVisible()
      await expect(page.locator(unit(READY[tool]))).toHaveAttribute('data-verify-state', /^(ready|loading)$/, T)
      const widths = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }))
      expect(widths.doc).toBeLessThanOrEqual(375)
      expect(widths.body).toBeLessThanOrEqual(375)
    })
  }
}
