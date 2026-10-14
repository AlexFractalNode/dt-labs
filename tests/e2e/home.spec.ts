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
    await expect(page.locator(`${home} [data-tool="${route}"] a[href="#/${route}"]`)).toHaveCount(1)
  }
  await expect(page.locator(`${home} [data-tool="splits"]`)).toContainText('Notebook Zelle 99–128')

  await page.locator(`${home} [data-tool="forest"] a[href="#/forest"]`).click()
  await expect(page.locator('[data-verify-unit="app-shell"]')).toHaveAttribute('data-verify-route', 'forest')
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
