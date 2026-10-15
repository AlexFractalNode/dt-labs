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

async function open(page: Page, query = '') {
  await page.goto(`/#/complexity?${query ? `${query}&` : ''}lang=de`)
  await expect(page.locator(unit('complexity-plot'))).toHaveAttribute('data-verify-state', 'ready', T)
}

const slider = (page: Page, param: string) => page.locator(`[data-param="${param}"] input[type="range"]`)

test('eight preset reproduces textbook pruning', async ({ page }) => {
  const errors = trackErrors(page)
  for (const [alpha, leaves] of [
    ['0.2', '3'],
    ['0.45', '2'],
    ['0.6', '1'],
  ]) {
    await open(page, `preset=eight&criterion=entropy&alpha=${alpha}`)
    const path = page.locator(unit('pruning-path'))
    await expect(path).toHaveAttribute('data-verify-state', 'ready', T)
    await expect(path).toHaveAttribute('data-verify-count', '3')
    await expect(path).toHaveAttribute('data-verify-selected', leaves)
    await expect(page.locator(unit('complexity-plot'))).toHaveAttribute('data-verify-count', '8')
    await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-state', 'ready')
  }
  const metrics = page.locator(unit('metrics'))
  await expect(metrics).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(metrics).toHaveAttribute('data-verify-k', '3')
  // the textbook data is not a generator: no fresh sample
  await expect(metrics).not.toHaveAttribute('data-verify-fresh', /.*/)
  expect(errors).toEqual([])
})

test('unbounded depth fits moons perfectly', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page)
  const metrics = page.locator(unit('metrics'))
  await expect(metrics).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(metrics).toHaveAttribute('data-verify-train', '1')
  await expect(metrics).toHaveAttribute('data-verify-k', '5')
  await expect(metrics).toHaveAttribute('data-verify-fresh', /^0\.\d+$/)
  await expect(page.locator(unit('complexity-plot'))).toHaveAttribute('data-verify-count', '200')
  expect(errors).toEqual([])
})

test('validation curve finishes and marks the current value', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page, 'depth=4')
  const curve = page.locator(unit('validation-curve'))
  await expect(curve).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(curve).toHaveAttribute('data-verify-count', '20')
  await expect(curve).toHaveAttribute('data-verify-current', '4')
  const k = Number(await page.locator(unit('metrics')).getAttribute('data-verify-k'))
  expect(k).toBe(5)
  await expect(page.locator(unit('grid-size'))).toHaveAttribute('data-verify-count', String(20 * k + 1))
  expect(errors).toEqual([])
})

test('alpha curve uses at most 20 path alphas and marks the current alpha', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page, 'curve=ccpAlpha&alpha=0.01')
  const curve = page.locator(unit('validation-curve'))
  await expect(curve).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(curve).toHaveAttribute('data-verify-param', 'ccpAlpha')
  await expect(curve).toHaveAttribute('data-verify-current', '0.01')
  const count = Number(await curve.getAttribute('data-verify-count'))
  expect(count).toBeGreaterThan(1)
  expect(count).toBeLessThanOrEqual(20)
  await expect(page.locator(unit('grid-size'))).toHaveAttribute('data-verify-count', String(count * 5 + 1))
  expect(errors).toEqual([])
})

test('too few cases per class: metrics and curve report TOO_FEW_PER_CLASS, the plot stays ready', async ({ page }) => {
  await open(page, 'preset=moons&n=3')
  const metrics = page.locator(unit('metrics'))
  await expect(metrics).toHaveAttribute('data-verify-state', 'error', T)
  await expect(metrics).toHaveAttribute('data-verify-error', 'TOO_FEW_PER_CLASS')
  const curve = page.locator(unit('validation-curve'))
  await expect(curve).toHaveAttribute('data-verify-state', 'error', T)
  await expect(curve).toHaveAttribute('data-verify-error', 'TOO_FEW_PER_CLASS')
  await expect(page.locator(unit('complexity-plot'))).toHaveAttribute('data-verify-state', 'ready')
  await expect(page.locator(unit('complexity-plot'))).toHaveAttribute('data-verify-count', '3')
})

test('large noisy data: tree is ready quickly and rapid slider changes settle on the last value', async ({ page }) => {
  const errors = trackErrors(page)
  const base = 'preset=moons&n=1000&noise=0.5'
  // reference: the number of leaves for min_samples_leaf = 17 when opened directly
  await open(page, `${base}&leaf=17`)
  const ref = page.locator(unit('metrics'))
  await expect(ref).toHaveAttribute('data-verify-state', 'ready', T)
  const expectedLeaves = await ref.getAttribute('data-verify-leaves')
  expect(Number(expectedLeaves)).toBeGreaterThan(1)

  await open(page, base)
  const tree = page.locator(unit('tree'))
  await expect(tree).toHaveAttribute('data-verify-state', 'ready', T)
  expect(Number(await tree.getAttribute('data-verify-count'))).toBeLessThanOrEqual(127)
  const leaf = slider(page, 'leaf')
  for (const v of [3, 8, 2, 30, 5, 41, 12, 26, 9, 17]) await leaf.fill(String(v))
  const metrics = page.locator(unit('metrics'))
  await expect(metrics).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(metrics).toHaveAttribute('data-verify-leaves', expectedLeaves ?? '')
  await expect(tree).toHaveAttribute('data-verify-state', 'ready')
  await expect(page).toHaveURL(/leaf=17/)
  await expect(page).toHaveURL(/lang=de/)
  expect(errors).toEqual([])
})

test('invalid URL values are reported and the view falls back to defaults', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page, 'depth=-3&preset=foo')
  await expect(page.locator(unit('url-notice'))).toHaveAttribute('data-verify-count', '2')
  await expect(page.locator(unit('metrics'))).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(page.locator(unit('complexity-plot'))).toHaveAttribute('data-verify-count', '200')
  expect(errors).toEqual([])
})

test('moving the alpha slider prunes the tree and updates the address', async ({ page }) => {
  await open(page, 'preset=eight&criterion=entropy')
  const path = page.locator(unit('pruning-path'))
  await expect(path).toHaveAttribute('data-verify-selected', '3')
  await slider(page, 'alpha').fill('1')
  await expect(path).toHaveAttribute('data-verify-selected', '1')
  await expect(page.locator(unit('tree'))).toHaveAttribute('data-verify-count', '1')
  await expect(page).toHaveURL(/alpha=1/)
  await expect(page).toHaveURL(/preset=eight/)
})

test('English UI renders the same contracts', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/#/complexity?preset=eight&criterion=entropy&alpha=0.45&lang=en')
  await expect(page.locator(unit('metrics'))).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(page.locator(unit('pruning-path'))).toHaveAttribute('data-verify-selected', '2')
  await expect(page.locator('h2').first()).toHaveText('Complexity Lab')
  expect(errors).toEqual([])
})

test('no horizontal scroll at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page)
  await expect(page.locator(unit('validation-curve'))).toHaveAttribute('data-verify-state', 'ready', T)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
