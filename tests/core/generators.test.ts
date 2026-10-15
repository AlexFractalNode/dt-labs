import { describe, expect, it } from 'vitest'
import { generate, type GeneratorName } from '../../src/core/generators'

const NAMES: GeneratorName[] = ['xor', 'moons', 'circles', 'diagonal']

describe('generators', () => {
  it.each(NAMES)('is deterministic per seed and inside bounds (%s)', (name) => {
    for (const noise of [0, 0.3, 1]) {
      const a = generate(name, 150, noise, 7)
      const b = generate(name, 150, noise, 7)
      const c = generate(name, 150, noise, 8)
      expect(a).toEqual(b)
      expect(a.X).not.toEqual(c.X)
      expect(a.X.length).toBe(150)
      expect(a.y.length).toBe(150)
      const { x0, x1, y0, y1 } = a.bounds
      expect(x0).toBeLessThan(x1)
      expect(y0).toBeLessThan(y1)
      for (const [x, y] of a.X) {
        expect(x).toBeGreaterThanOrEqual(x0)
        expect(x).toBeLessThanOrEqual(x1)
        expect(y).toBeGreaterThanOrEqual(y0)
        expect(y).toBeLessThanOrEqual(y1)
      }
    }
  })

  it.each(NAMES)('balances classes (%s)', (name) => {
    for (const n of [2, 3, 10, 99, 200, 1000]) {
      for (const noise of [0, 0.5, 1]) {
        const { y } = generate(name, n, noise, 11)
        const n1 = y.reduce((s, v) => s + v, 0)
        expect(Math.abs(n - n1 - n1), `${name} n=${n} noise=${noise}`).toBeLessThanOrEqual(1)
        expect(y.every((v) => v === 0 || v === 1)).toBe(true)
      }
    }
  })

  it('uses fixed bounds per generator', () => {
    for (const name of NAMES) {
      expect(generate(name, 20, 0.1, 1).bounds).toEqual(generate(name, 500, 0.9, 2).bounds)
    }
  })

  it('separates classes without noise', () => {
    const d = generate('diagonal', 200, 0, 5)
    d.X.forEach(([x, y], i) => expect(x > y ? 1 : 0).toBe(d.y[i]))
    const xor = generate('xor', 200, 0, 5)
    xor.X.forEach(([x, y], i) => expect(x > 0 !== y > 0 ? 1 : 0).toBe(xor.y[i]))
  })
})
