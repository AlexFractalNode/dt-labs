/** Colour helpers for the canvas-based probability grid (no formulas of the model live here). */

export type Rgb = [number, number, number]

/** `#rgb` or `#rrggbb`; null for anything else. */
export function parseHexColor(s: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/**
 * RGBA pixels (canvas order: top row first) of a `G x G` class-probability grid in the layout of `probaGrid`
 * (row 0 = lowest y), so the grid is flipped vertically. Each pixel is the probability-weighted mean of the
 * class colours.
 */
export function mixGrid(
  grid: ArrayLike<number>,
  G: number,
  nClasses: number,
  colors: Rgb[],
  alpha = 160,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(G * G * 4)
  for (let r = 0; r < G; r++) {
    const canvasRow = G - 1 - r
    for (let c = 0; c < G; c++) {
      const base = (r * G + c) * nClasses
      let R = 0
      let Gc = 0
      let B = 0
      for (let k = 0; k < nClasses; k++) {
        const p = grid[base + k]
        const col = colors[k % colors.length]
        R += p * col[0]
        Gc += p * col[1]
        B += p * col[2]
      }
      const o = (canvasRow * G + c) * 4
      out[o] = Math.round(R)
      out[o + 1] = Math.round(Gc)
      out[o + 2] = Math.round(B)
      out[o + 3] = alpha
    }
  }
  return out
}
