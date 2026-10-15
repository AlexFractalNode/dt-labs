import { expect, test, type Page } from '@playwright/test'
import type { ToolId } from '../../src/tools/scenarios'

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
const helpBtn = (page: Page) => page.locator('[data-action="help"]')
const drawer = (page: Page) => page.locator(unit('help'))
const heading = (page: Page) => page.locator('#help-title')
const note = (page: Page) => page.locator(unit('scenario-note'))
const closeBtn = (page: Page) => drawer(page).locator('[data-action="help-close"]')
const inert = (page: Page) => page.locator('main').evaluate((el) => el.hasAttribute('inert'))

/** One unit per tool that is rendered once the view is up. */
const READY: Record<ToolId, string> = { splits: 'splits-data', complexity: 'metrics', forest: 'forest-plot' }
const TOOLS: ToolId[] = ['splits', 'complexity', 'forest']

async function openTool(page: Page, tool: ToolId, lang = 'de') {
  await page.goto(`/#/${tool}?lang=${lang}`)
  await expect(page.locator(unit(READY[tool]))).toHaveAttribute('data-verify-state', /^(ready|loading)$/, T)
}

async function openHelp(page: Page, tool: ToolId, lang = 'de') {
  await openTool(page, tool, lang)
  await helpBtn(page).click()
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'ready', T)
}

test('there is no help button on the home page', async ({ page }) => {
  await page.goto('/#/?lang=de')
  await expect(page.locator(unit('home'))).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(helpBtn(page)).toHaveCount(0)
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'empty')
})

for (const tool of TOOLS) {
  test(`help opens on ${tool}: ready, tool contract, focus on the heading`, async ({ page }) => {
    const errors = trackErrors(page)
    await openTool(page, tool)
    const btn = helpBtn(page)
    await expect(btn).toHaveAttribute('aria-expanded', 'false')
    await expect(btn).toHaveAttribute('aria-controls', 'help-drawer')
    await expect(drawer(page)).toHaveAttribute('data-verify-state', 'empty')
    await expect(drawer(page)).toBeHidden()
    await btn.click()
    await expect(drawer(page)).toHaveAttribute('data-verify-state', 'ready', T)
    await expect(drawer(page)).toHaveAttribute('data-verify-tool', tool)
    await expect(btn).toHaveAttribute('aria-expanded', 'true')
    await expect(heading(page)).toBeFocused()
    await expect(page.getByRole('complementary', { name: /Hilfe/ })).toBeVisible()
    // the help button sits left of the language button
    const hb = (await btn.boundingBox())!
    const lb = (await page.locator(unit('lang-toggle')).boundingBox())!
    expect(hb.x + hb.width).toBeLessThanOrEqual(lb.x)
    // sections: purpose, reading lines, controls, course reference, scenarios
    await expect(drawer(page).locator('[data-help="purpose"]')).toHaveCount(1)
    expect(await drawer(page).locator('[data-help="read"] li').count()).toBeGreaterThanOrEqual(5)
    expect(await drawer(page).locator('[data-help="controls"] li').count()).toBeGreaterThanOrEqual(4)
    await expect(drawer(page).locator('[data-help="course"]')).toContainText('Kap.')
    await expect(drawer(page).locator('a[data-help-scenario]')).toHaveCount(3)
    expect(errors).toEqual([])
  })
}

test('the help texts follow the language', async ({ page }) => {
  await openHelp(page, 'forest', 'en')
  await expect(helpBtn(page)).toContainText('Help')
  await expect(drawer(page).locator('[data-help="course"]')).toContainText('Textbook ch.')
  await page.locator(unit('lang-toggle')).click()
  await expect(drawer(page).locator('[data-help="course"]')).toContainText('Lehrbuch Kap.')
})

test('Escape with focus in the drawer closes it and returns focus to the button', async ({ page }) => {
  await openHelp(page, 'splits')
  await page.keyboard.press('Escape')
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'empty')
  await expect(drawer(page)).toBeHidden()
  await expect(helpBtn(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(helpBtn(page)).toBeFocused()
})

test('Escape with focus in a slider does not close the drawer', async ({ page }) => {
  await openHelp(page, 'complexity')
  const slider = page.locator('[data-param="n"] input[type="range"]')
  await slider.focus()
  await expect(slider).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'ready')
  await expect(slider).toBeFocused()
})

test('the close button closes it and returns focus to the button', async ({ page }) => {
  await openHelp(page, 'forest')
  await closeBtn(page).click()
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'empty')
  await expect(helpBtn(page)).toBeFocused()
})

test('the help button toggles the drawer', async ({ page }) => {
  await openHelp(page, 'splits')
  await helpBtn(page).click()
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'empty')
  await expect(helpBtn(page)).toHaveAttribute('aria-expanded', 'false')
})

test('switching the tool with the drawer open shows the help of the new tool', async ({ page }) => {
  await openHelp(page, 'splits')
  await page.locator('nav a[href^="#/complexity"]').click()
  await expect(page.locator(unit('metrics'))).toHaveAttribute('data-verify-state', /^(ready|loading)$/, T)
  await expect(drawer(page)).toHaveAttribute('data-verify-tool', 'complexity')
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'ready')
  await page.locator('nav a[href^="#/forest"]').click()
  await expect(drawer(page)).toHaveAttribute('data-verify-tool', 'forest')
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'ready')
  // back to the start: the drawer closes and the button disappears
  await page.locator('nav a[href="#/"]').click()
  await expect(page.locator(unit('home'))).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'empty')
  await expect(helpBtn(page)).toHaveCount(0)
  // a later visit to a tool starts closed
  await page.locator('nav a[href^="#/splits"]').click()
  await expect(helpBtn(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'empty')
})

test('desktop 1280 px: the content makes room and a control on the right stays clickable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openHelp(page, 'complexity')
  const box = (await drawer(page).boundingBox())!
  expect(box.width).toBe(360)
  expect(box.x + box.width).toBe(1280)
  expect(await page.locator('main').evaluate((el) => getComputedStyle(el).paddingRight)).toBe('376px') // 360 px drawer + the usual 1rem gutter
  // the validation curve sits in the right column of the tool: it must end left of the drawer
  const radio = page.locator('input[name="complexity-curve"][value="ccpAlpha"]')
  await radio.scrollIntoViewIfNeeded()
  const r = (await radio.boundingBox())!
  expect(r.x + r.width).toBeLessThanOrEqual(box.x)
  await radio.click()
  await expect(page).toHaveURL(/curve=ccpAlpha/)
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'ready')
  // not modal: the page is not inert
  expect(await inert(page)).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)
})

test('desktop: a scenario link applies the scenario and keeps the drawer open', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openHelp(page, 'splits')
  const link = drawer(page).locator('a[data-help-scenario="s1"]')
  await expect(link).toHaveAttribute('href', /#\/splits\?.*scenario=s1/)
  await link.click()
  await expect(note(page)).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(note(page)).toHaveAttribute('data-verify-scenario', 's1')
  await expect(page).toHaveURL(/scenario=s1/)
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'ready')
  await expect(link).toBeVisible()
})

test('375 px: full-screen drawer, inert page, scenario link closes it', async ({ page }) => {
  const errors = trackErrors(page)
  await page.setViewportSize({ width: 375, height: 812 })
  for (const lang of ['de', 'en']) {
    await openHelp(page, 'complexity', lang)
    const box = (await drawer(page).boundingBox())!
    expect(box.x).toBe(0)
    expect(box.width).toBe(375)
    expect(box.height).toBeGreaterThanOrEqual(812 - 1)
    await expect(closeBtn(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    expect(await drawer(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await inert(page)).toBe(true)
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden')
    await closeBtn(page).click()
    await expect(drawer(page)).toHaveAttribute('data-verify-state', 'empty')
    expect(await inert(page)).toBe(false)
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')
  }
  await openHelp(page, 'complexity')
  await drawer(page).locator('a[data-help-scenario="c1"]').click()
  await expect(drawer(page)).toHaveAttribute('data-verify-state', 'empty')
  await expect(note(page)).toHaveAttribute('data-verify-state', 'ready', T)
  await expect(note(page)).toHaveAttribute('data-verify-scenario', 'c1')
  await expect(helpBtn(page)).toBeFocused()
  expect(await inert(page)).toBe(false)
  expect(errors).toEqual([])
})
