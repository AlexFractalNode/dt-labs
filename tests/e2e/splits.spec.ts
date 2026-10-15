import path from 'node:path'
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

const fixture = (name: string) => path.resolve('tests/e2e/fixtures', name)
const unit = (name: string) => `[data-verify-unit="${name}"]`
const T = { timeout: 10_000 }

async function open(page: Page, query = 'preset=eight') {
  await page.goto(`/#/splits?${query}&lang=de`)
  await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-state', 'ready', T)
}

const row = (page: Page, key: string) => page.locator(`${unit('split-candidates')} tr[data-verify-key="${key}"]`)

test('eight preset shows six root candidates with a tie', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page)
  const cands = page.locator(unit('split-candidates'))
  await expect(cands).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(cands).toHaveAttribute('data-verify-count', '6')
  await expect(page.locator(`${unit('split-candidates')} tr[data-verify-key]`)).toHaveCount(6)
  await expect(page.locator(`${unit('split-candidates')} tr[data-verify-tie="true"]`)).toHaveCount(2)
  await expect(page.locator(`${unit('split-candidates')} tr[data-verify-best="true"]`)).toHaveAttribute(
    'data-verify-key',
    '0:threshold:2.5',
  )
  await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-count', '8')
  expect(errors).toEqual([])
})

test('auto-grow builds the textbook tree', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page)
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '1')
  await page.locator('[data-action="grow-all"]').click()
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '5', T)
  await expect(page.locator(unit('importance'))).toHaveAttribute('data-verify-state', 'ready')
  await expect(page.locator(unit('importance'))).toHaveAttribute('data-verify-count', '2')
  await expect(page).toHaveURL(/grow=auto/)
  await expect(page).toHaveURL(/lang=de/)
  expect(errors).toEqual([])
})

test('choosing a non-best split changes the tree', async ({ page }) => {
  await open(page)
  await row(page, '1:threshold:1.5').locator('[data-action="apply-split"]').click()
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '3', T)
  await expect(row(page, '1:threshold:1.5')).toHaveAttribute('data-verify-gain', '0.092359')
  await expect(row(page, '1:threshold:1.5')).toHaveAttribute('data-verify-applied', 'true')
})

test('re-picking the applied split keeps the subtree below it', async ({ page }) => {
  await open(page, 'preset=eight&grow=auto')
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '5', T)
  await row(page, '0:threshold:2.5').locator('[data-action="apply-split"]').click()
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '5')
})

test('path tracer follows (4,4) to class 1', async ({ page }) => {
  await open(page, 'preset=eight&grow=auto')
  await page.locator('[data-trace-feature="0"]').fill('4')
  await page.locator('[data-trace-feature="1"]').fill('4')
  const path = page.locator(unit('path'))
  await expect(path).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(path).toHaveAttribute('data-verify-count', '3')
  await expect(path).toHaveAttribute('data-verify-class', '1')
  await expect(page.locator(`${unit('tree')} [data-on-path="true"]`)).toHaveCount(3)
})

test('removing a subtree turns the node back into a leaf', async ({ page }) => {
  await open(page)
  await page.locator('[data-action="grow-all"]').click()
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '5', T)
  // Node ids are preorder positions: 0 root, 1 left leaf, 2 = node R (the impure right child).
  await page.locator(`${unit('tree')} [data-node-id="2"]`).click()
  await page.locator('[data-action="remove-subtree"]').click()
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '3', T)
})

test('switching to gini keeps the questions', async ({ page }) => {
  await open(page)
  await page.locator('[data-action="grow-all"]').click()
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '5', T)
  const before = await row(page, '0:threshold:2.5').getAttribute('data-verify-gain')
  await page.locator('input[name="criterion"][value="gini"]').check()
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '5')
  await expect(row(page, '0:threshold:2.5')).not.toHaveAttribute('data-verify-gain', before ?? '')
  await expect(page).toHaveURL(/criterion=gini/)
})

test('German CSV upload (semicolon, decimal comma, BOM)', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page)
  await page.locator('input[data-field="csv-file"]').setInputFiles(fixture('weather-de.csv'))
  await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-count', '10', T)
  await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-state', 'ready')
  await expect(page.locator(unit('split-candidates'))).toHaveAttribute('data-verify-state', 'ready')
  // decimal comma is shown in German
  await expect(page.locator(`${unit('splits-data')} input[data-row="0"][data-col="1"]`)).toHaveValue('27,5')
  expect(errors).toEqual([])
})

test('single-class CSV reports SINGLE_CLASS', async ({ page }) => {
  await open(page)
  await page.locator('input[data-field="csv-file"]').setInputFiles(fixture('single-class.csv'))
  const data = page.locator(unit('splits-data'))
  await expect(data).toHaveAttribute('data-verify-state', 'error', T)
  await expect(data).toHaveAttribute('data-verify-error', 'SINGLE_CLASS')
})

test('CSV with a missing value reports MISSING_VALUES', async ({ page }) => {
  await open(page)
  await page.locator('input[data-field="csv-file"]').setInputFiles(fixture('missing.csv'))
  const data = page.locator(unit('splits-data'))
  await expect(data).toHaveAttribute('data-verify-state', 'error', T)
  await expect(data).toHaveAttribute('data-verify-error', 'MISSING_VALUES')
})

test('table editing: identical features with different classes leave no admissible question', async ({ page }) => {
  await open(page, 'preset=speed')
  const cell = (r: number, c: number) => page.locator(`${unit('splits-data')} input[data-row="${r}"][data-col="${c}"]`)
  // Row 2 gets the features of row 1 and a different class; the remaining rows are deleted.
  await cell(1, 1).fill('bumpiness')
  await cell(1, 1).blur()
  await cell(1, 3).fill('fast')
  await cell(1, 3).blur()
  await page.locator(`${unit('splits-data')} button[data-action="delete-row"][data-row="3"]`).click()
  await page.locator(`${unit('splits-data')} button[data-action="delete-row"][data-row="2"]`).click()
  await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-count', '2', T)
  await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-state', 'ready')
  const cands = page.locator(unit('split-candidates'))
  await expect(cands).toHaveAttribute('data-verify-state', 'empty', T)
  await expect(cands).toContainText('keine zulässige Frage')
})

test('adding a row copies the last row; a changed table drops choices that no longer exist', async ({ page }) => {
  await open(page, 'preset=eight&grow=auto')
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '5', T)
  await page.locator(`${unit('splits-data')} button[data-action="add-row"]`).click()
  await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-count', '9')
  // the edited table no longer matches the preset, so the address does not claim a finished preset tree
  await expect(page).not.toHaveURL(/grow=auto/)
})

test('weather preset explains Quinlan original and the course file', async ({ page }) => {
  await open(page, 'preset=weather')
  await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-count', '14')
  await expect(page.locator('[data-note="weather"]')).toContainText('Quinlan')
  await expect(page.locator('[data-note="weather"]')).toContainText('sun.csv')
  // categorical features show the multiway comparison row
  await expect(page.locator(`${unit('split-candidates')} tr[data-verify-multiway]`)).not.toHaveCount(0)
})

test('tie hint mentions sklearn and random_state', async ({ page }) => {
  await open(page)
  await expect(page.locator('[data-note="tie"]')).toContainText('random_state')
})

test('English UI and no horizontal scroll at 375 px', async ({ page }) => {
  const errors = trackErrors(page)
  await page.setViewportSize({ width: 375, height: 812 })
  for (const lang of ['de', 'en']) {
    await page.goto(`/#/splits?preset=weather&grow=auto&lang=${lang}`)
    await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-state', 'ready', T)
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(375)
  }
  expect(errors).toEqual([])
})

test('invalid URL values show the notice and fall back to defaults', async ({ page }) => {
  await page.goto('/#/splits?preset=bogus&lang=de')
  await expect(page.locator(unit('url-notice'))).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(page.locator(unit('splits-data'))).toHaveAttribute('data-verify-count', '8')
})
