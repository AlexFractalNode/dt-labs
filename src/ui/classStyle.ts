/**
 * Class palette helpers: six colours (--c-class-0..5 in styles.css) plus six distinct marker shapes, so classes are
 * never told apart by colour alone. Datasets are capped at six classes (core/dataset.ts); `% CLASS_STYLES` only keeps
 * a stray index inside the palette.
 */
export const CLASS_STYLES = 6

/** Marker glyphs for text legends, index = class code. */
export const CLASS_GLYPHS = ['●', '■', '▲', '◆', '▼', '✚'] as const

export function classIndex(k: number): number {
  return ((k % CLASS_STYLES) + CLASS_STYLES) % CLASS_STYLES
}

export function classColor(k: number): string {
  return `var(--c-class-${classIndex(k)})`
}

export function classGlyph(k: number): string {
  return CLASS_GLYPHS[classIndex(k)]
}

/** Colour list for components that take one colour per class (region fills, class-share bars). */
export function classColors(n: number): string[] {
  return Array.from({ length: Math.min(n, CLASS_STYLES) }, (_, k) => classColor(k))
}

/** Polygon points of the marker for class `k` (k >= 2) around (cx, cy), roughly the weight of a radius-5 circle. */
export function classPolygon(k: number, cx: number, cy: number): string {
  const pts: [number, number][] = (() => {
    switch (classIndex(k)) {
      case 2: // triangle up
        return [[0, -6], [5.5, 4], [-5.5, 4]]
      case 3: // diamond
        return [[0, -6.5], [6.5, 0], [0, 6.5], [-6.5, 0]]
      case 4: // triangle down
        return [[0, 6], [5.5, -4], [-5.5, -4]]
      default: // plus
        return [[-2, -6], [2, -6], [2, -2], [6, -2], [6, 2], [2, 2], [2, 6], [-2, 6], [-2, 2], [-6, 2], [-6, -2], [-2, -2]]
    }
  })()
  return pts.map(([dx, dy]) => `${cx + dx},${cy + dy}`).join(' ')
}
