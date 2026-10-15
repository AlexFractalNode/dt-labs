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

const unit = (name: string) => `[data-verify-unit="${name}"]`
const T = { timeout: 10_000 }
/** The variance measurement is allowed to take a minute. */
const LONG = { timeout: 60_000 }

async function open(page: Page, query = '') {
  await page.goto(`/#/forest?${query ? `${query}&` : ''}lang=de`)
  await expect(page.locator(unit('forest-plot'))).toHaveAttribute('data-verify-state', 'ready', T)
}

const slider = (page: Page, param: string) => page.locator(`[data-param="${param}"] input[type="range"]`)

test('trains B trees and shows the gallery', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page, 'B=30')
  const plot = page.locator(unit('forest-plot'))
  await expect(plot).toHaveAttribute('data-verify-count', '30')
  const gallery = page.locator(unit('tree-gallery'))
  await expect(gallery).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(gallery).toHaveAttribute('data-verify-count', '12')
  // OOB steps up to B = 30: 1, 2, 5, 10, 20 and B itself
  const oob = page.locator(unit('oob-curve'))
  await expect(oob).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(oob).toHaveAttribute('data-verify-count', '6')
  await expect(oob).toHaveAttribute('data-verify-uncovered', /^\d+$/)
  expect(errors).toEqual([])
})

test('fewer than 12 trees show only that many in the gallery', async ({ page }) => {
  await open(page, 'B=5')
  await expect(page.locator(unit('tree-gallery'))).toHaveAttribute('data-verify-count', '5', T)
})

test('clicking a point lists all tree probabilities', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page, 'B=30')
  const vote = page.locator(unit('vote'))
  await expect(vote).toHaveAttribute('data-verify-state', 'ready', T)
  const x1 = page.locator('[data-field="xstar-0"]')
  const before = await x1.inputValue()
  await page.locator(`${unit('forest-plot')} rect.capture`).click({ position: { x: 40, y: 60 } })
  await expect(vote).toHaveAttribute('data-verify-count', '30')
  await expect(vote).toHaveAttribute('data-verify-hard', /^[01]$/)
  await expect(vote).toHaveAttribute('data-verify-mean', /^[01]$/)
  expect(await x1.inputValue()).not.toBe(before)
  await expect(page.locator(`${unit('vote')} li[data-tree]`)).toHaveCount(30)
  expect(errors).toEqual([])
})

test('vote example disagrees', async ({ page }) => {
  await open(page, 'B=30')
  await page.getByRole('button', { name: /0,51 \/ 0,51 \/ 0,01/ }).click()
  const vote = page.locator(unit('vote'))
  await expect(vote).toHaveAttribute('data-verify-count', '3')
  await expect(vote).toHaveAttribute('data-verify-hard', '1')
  await expect(vote).toHaveAttribute('data-verify-mean', '0')
  await expect(vote.locator('[data-note="disagree"]')).toBeVisible()
  // a click into the plot leaves the example again
  await page.locator(`${unit('forest-plot')} rect.capture`).click({ position: { x: 100, y: 100 } })
  await expect(vote).toHaveAttribute('data-verify-count', '30')
})

test('no bootstrap empties the OOB curve', async ({ page }) => {
  await open(page, 'B=20&bootstrap=0')
  const oob = page.locator(unit('oob-curve'))
  await expect(oob).toHaveAttribute('data-verify-state', 'empty', T)
  await expect(oob.locator('[data-note="no-bootstrap"]')).toBeVisible()
})

test('variance measurement survives slider changes and can be cancelled', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page, 'B=150&n=600')
  const variance = page.locator(unit('variance'))
  // nothing measured yet: empty, not ready
  await expect(variance).toHaveAttribute('data-verify-state', 'empty')
  await expect(variance).toHaveAttribute('data-verify-count', '0')
  await page.locator('[data-action="measure"]').click()
  await expect(variance).toHaveAttribute('data-verify-state', 'loading')
  // moving B retrains the forest but never touches the running measurement
  await slider(page, 'B').fill('5')
  await expect(page.locator(unit('forest-plot'))).toHaveAttribute('data-verify-count', '5', T)
  await expect(page.locator(unit('forest-plot'))).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(variance).toHaveAttribute('data-verify-state', 'loading')
  await page.locator('[data-action="cancel"]').click()
  await expect(variance).not.toHaveAttribute('data-verify-state', 'loading')
  await expect(variance).not.toHaveAttribute('data-verify-state', 'error')
  await expect(variance).toHaveAttribute('data-verify-state', 'empty')
  // measure again (now with B = 5): finishes and reports a correlation
  await page.locator('[data-action="measure"]').click()
  await expect(variance).toHaveAttribute('data-verify-state', 'ready', LONG)
  const rho = Number(await variance.getAttribute('data-verify-rho'))
  expect(rho).toBeGreaterThanOrEqual(-1)
  expect(rho).toBeLessThanOrEqual(1)
  await expect(variance).toHaveAttribute('data-verify-count', '1')
  expect(Number(await variance.getAttribute('data-verify-sigma2'))).toBeGreaterThan(0)
  expect(Number(await variance.getAttribute('data-verify-measured'))).toBeGreaterThanOrEqual(0)
  expect(errors).toEqual([])
})

test('slider changes during training never show stale results', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page, 'B=20')
  const plot = page.locator(unit('forest-plot'))
  await slider(page, 'B').fill('300')
  await slider(page, 'B').fill('10')
  await expect(plot).toHaveAttribute('data-verify-count', '10', T)
  await expect(plot).toHaveAttribute('data-verify-state', 'ready', T)
  // stays on the last value (a late 300-tree result must not replace it)
  await page.waitForTimeout(1500)
  await expect(plot).toHaveAttribute('data-verify-count', '10')
  await expect(plot).toHaveAttribute('data-verify-state', 'ready')
  await expect(page.locator(unit('vote'))).toHaveAttribute('data-verify-count', '10')
  await expect(page).toHaveURL(/B=10/)
  await expect(page).toHaveURL(/lang=de/)
  expect(errors).toEqual([])
})

test('out-of-range B is clamped to 300 and reported', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page, 'B=99999')
  await expect(page.locator(unit('forest-plot'))).toHaveAttribute('data-verify-count', '300')
  await expect(page.locator(unit('url-notice'))).toHaveAttribute('data-verify-count', '1')
  // 300 trees: the OOB curve has all nine steps
  await expect(page.locator(unit('oob-curve'))).toHaveAttribute('data-verify-count', '9')
  expect(errors).toEqual([])
})

test('mf=2 without bootstrap: identical trees, rho = 1 hint and measured rho 1', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page, 'mf=2&bootstrap=0&B=10&n=100')
  const variance = page.locator(unit('variance'))
  await expect(variance.locator('[data-note="rho-one"]')).toBeVisible()
  await page.locator('[data-action="measure"]').click()
  await expect(variance).toHaveAttribute('data-verify-state', 'ready', LONG)
  await expect(variance).toHaveAttribute('data-verify-rho', '1')
  expect(errors).toEqual([])
})

test('English UI renders the same contracts', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/#/forest?B=15&lang=en')
  await expect(page.locator(unit('forest-plot'))).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(page.locator(unit('tree-gallery'))).toHaveAttribute('data-verify-count', '12')
  await expect(page.locator('h2').first()).toHaveText('Forest Lab')
  await page.getByRole('button', { name: /0\.51 \/ 0\.51 \/ 0\.01/ }).click()
  await expect(page.locator(unit('vote'))).toHaveAttribute('data-verify-count', '3')
  expect(errors).toEqual([])
})

test('no horizontal scroll at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page)
  await expect(page.locator(unit('oob-curve'))).toHaveAttribute('data-verify-state', 'ready', T)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
