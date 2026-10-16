import { expect, test, type Page } from '@playwright/test'

/** Collects console errors and uncaught exceptions of a page. */
function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

const home = '[data-verify-unit="home"]'

test('home lists three tools', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/#/?lang=de')
  await expect(page.locator(home)).toHaveAttribute('data-verify-state', 'ready', { timeout: 10_000 })
  await expect(page.locator(home)).toHaveAttribute('data-verify-count', '3')
  const cards = page.locator(`${home} [data-tool]`)
  await expect(cards).toHaveCount(3)
  for (const route of ['splits', 'complexity', 'forest']) {
    await expect(page.locator(`${home} [data-tool="${route}"] [data-open-link]`)).toHaveCount(1)
    await expect(page.locator(`${home} [data-tool="${route}"] [data-open-link]`)).toHaveAttribute(
      'href',
      new RegExp(`^#/${route}`),
    )
    await expect(page.locator(`${home} [data-tool="${route}"] [data-scenario-link]`)).toHaveCount(3)
  }
  await expect(page.locator(`${home} [data-tool="splits"]`)).toContainText('Notebook Zelle 99–128')

  await page.locator(`${home} [data-tool="forest"] [data-open-link]`).click()
  await expect(page.locator('[data-verify-unit="app-shell"]')).toHaveAttribute('data-verify-route', 'forest')
  expect(errors).toEqual([])
})

test('the roadmap lists seven ideas that are not part of this version', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/#/?lang=de')
  const roadmap = page.locator('[data-verify-unit="home-roadmap"]')
  await expect(roadmap).toHaveAttribute('data-verify-state', 'ready', { timeout: 10_000 })
  await expect(roadmap).toHaveAttribute('data-verify-count', '7')
  await expect(roadmap.locator('li')).toHaveCount(7)
  await expect(roadmap).toContainText('Regressions-Treppe')
  await expect(roadmap).toContainText('Kap. 14')
  await expect(roadmap).toContainText('alle Kapitel')
  expect(errors).toEqual([])
})

test('a scenario link on the home page opens the tool with the scenario applied', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/#/?lang=de')
  await expect(page.locator(home)).toHaveAttribute('data-verify-state', 'ready', { timeout: 10_000 })
  await page.locator(`${home} [data-tool="complexity"] [data-scenario-link="c3"]`).click()
  await expect(page.locator('[data-verify-unit="app-shell"]')).toHaveAttribute('data-verify-route', 'complexity')
  await expect(page.locator('[data-verify-unit="pruning-path"]')).toHaveAttribute('data-verify-selected', '2', {
    timeout: 10_000,
  })
  await expect(page.locator('[data-verify-unit="scenario-note"]')).toHaveAttribute('data-verify-state', 'ready')
  await expect(page).toHaveURL(/scenario=c3/)
  expect(errors).toEqual([])
})

test('the language toggle switches DE and EN and survives a reload', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/#/')
  await page.evaluate(() => localStorage.removeItem('dt-labs-lang'))
  await page.reload()
  const heading = `${home} h2`
  const de = (await page.locator(heading).textContent())?.trim()
  expect(de).toContain('Entscheidungsbäume')
  await page.locator('[data-verify-unit="lang-toggle"]').click()
  await expect(page.locator(heading)).toContainText('Decision trees')
  await page.reload()
  await expect(page.locator(heading)).toContainText('Decision trees')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  expect(errors).toEqual([])
})

test('no horizontal scroll at 375 px (DE and EN)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const lang of ['de', 'en']) {
    await page.goto(`/#/?lang=${lang}`)
    await expect(page.locator(home)).toHaveAttribute('data-verify-state', 'ready', { timeout: 10_000 })
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(375)
  }
})
