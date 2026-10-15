import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLASS_GLYPHS, CLASS_STYLES, classColor, classColors, classGlyph, classPolygon } from '../../src/ui/classStyle'

describe('class style', () => {
  it('has six distinct colours, glyphs and marker shapes', () => {
    expect(CLASS_STYLES).toBe(6)
    expect(new Set(classColors(6)).size).toBe(6)
    expect(new Set(CLASS_GLYPHS).size).toBe(6)
    expect(new Set([2, 3, 4, 5].map((k) => classPolygon(k, 0, 0))).size).toBe(4)
    expect(classColor(7)).toBe(classColor(1))
    expect(classGlyph(0)).toBe('●')
  })

  it('defines --c-class-0..5 for light and dark mode', () => {
    const css = readFileSync('src/styles.css', 'utf8')
    const dark = css.slice(css.indexOf('prefers-color-scheme: dark'))
    const light = css.slice(0, css.indexOf('prefers-color-scheme: dark'))
    for (let k = 0; k < 6; k++) {
      expect(light).toMatch(new RegExp(`--c-class-${k}: #[0-9a-f]{6}`))
      expect(dark).toMatch(new RegExp(`--c-class-${k}: #[0-9a-f]{6}`))
    }
  })
})
