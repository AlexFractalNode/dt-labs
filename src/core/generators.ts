/**
 * Deterministic synthetic 2-D data sets (Spec 3.6). Every generator is a pure function of
 * (n, noise, seed) via `createRng`, has fixed bounds, and yields balanced classes
 * (n0 = ceil(n / 2), n1 = floor(n / 2)). Points are clamped into the bounds, so they always lie
 * inside even for large noise. Rows are shuffled so that data order carries no label information.
 */
import { DtError } from './errors'
import { createRng } from './rng'

export type GeneratorName = 'xor' | 'moons' | 'circles' | 'diagonal'

export interface Bounds {
  x0: number
  x1: number
  y0: number
  y1: number
}

type Rng = ReturnType<typeof createRng>

const BOUNDS: Record<GeneratorName, Bounds> = {
  xor: { x0: -3, x1: 3, y0: -3, y1: 3 },
  moons: { x0: -2, x1: 3, y0: -1.5, y1: 2 },
  circles: { x0: -2.5, x1: 2.5, y0: -2.5, y1: 2.5 },
  diagonal: { x0: 0, x1: 1, y0: 0, y1: 1 },
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Evenly spaced angles on [0, span]; `endpoint` false excludes `span` (full circle). */
function angles(count: number, span: number, endpoint: boolean): number[] {
  if (count === 1) return [0]
  const div = endpoint ? count - 1 : count
  return Array.from({ length: count }, (_, i) => (span * i) / div)
}

function shuffle(rng: Rng, X: number[][], y: number[]): void {
  for (let i = X.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[X[i], X[j]] = [X[j], X[i]]
    ;[y[i], y[j]] = [y[j], y[i]]
  }
}

export function generate(
  name: GeneratorName,
  n: number,
  noise: number,
  seed: number,
): { X: number[][]; y: number[]; bounds: Bounds } {
  if (!(name in BOUNDS)) throw new DtError('BAD_PARAM', { param: 'name' })
  if (!Number.isInteger(n) || n < 2) throw new DtError('BAD_PARAM', { param: 'n' })
  if (!Number.isFinite(noise) || noise < 0) throw new DtError('BAD_PARAM', { param: 'noise' })
  const bounds = BOUNDS[name]
  const rng = createRng(seed)
  const n0 = Math.ceil(n / 2)
  const n1 = n - n0
  const X: number[][] = []
  const y: number[] = []
  const push = (px: number, py: number, label: number) => {
    X.push([clamp(px, bounds.x0, bounds.x1), clamp(py, bounds.y0, bounds.y1)])
    y.push(label)
  }

  if (name === 'moons') {
    // like sklearn make_moons: upper arc (class 0) and shifted lower arc (class 1), Gaussian noise
    for (const t of angles(n0, Math.PI, true)) push(Math.cos(t) + noise * rng.normal(), Math.sin(t) + noise * rng.normal(), 0)
    for (const t of angles(n1, Math.PI, true)) {
      push(1 - Math.cos(t) + noise * rng.normal(), 0.5 - Math.sin(t) + noise * rng.normal(), 1)
    }
  } else if (name === 'circles') {
    // like sklearn make_circles(factor=0.5): outer ring radius 1 (class 0), inner ring radius 0.5 (class 1)
    for (const t of angles(n0, 2 * Math.PI, false)) push(Math.cos(t) + noise * rng.normal(), Math.sin(t) + noise * rng.normal(), 0)
    for (const t of angles(n1, 2 * Math.PI, false)) {
      push(0.5 * Math.cos(t) + noise * rng.normal(), 0.5 * Math.sin(t) + noise * rng.normal(), 1)
    }
  } else if (name === 'xor') {
    // four Gaussian blobs (sd = noise) at (+-1, +-1); label 1 where the signs of x and y differ.
    // Class 0 alternates between (+,+) and (-,-), class 1 between (+,-) and (-,+), so classes stay balanced.
    for (let i = 0; i < n0; i++) {
      const s = i % 2 === 0 ? 1 : -1
      push(s + noise * rng.normal(), s + noise * rng.normal(), 0)
    }
    for (let i = 0; i < n1; i++) {
      const s = i % 2 === 0 ? 1 : -1
      push(s + noise * rng.normal(), -s + noise * rng.normal(), 1)
    }
  } else {
    // uniform unit square, label = x > y. Each class-0 point (x <= y) is paired with a class-1 point
    // (x > y); with probability noise / 2 the pair swaps its two labels. This flips each point's label
    // with probability noise / 2 while keeping the class counts exactly balanced. An unpaired point
    // (odd n) is never flipped.
    const flipP = Math.min(1, noise / 2)
    for (let i = 0; i < n1; i++) {
      const u = rng.uniform()
      const v = rng.uniform()
      const flip = rng.uniform() < flipP
      push(Math.min(u, v), Math.max(u, v), flip ? 1 : 0) // x <= y: truly class 0
      push(Math.max(u, v), Math.min(u, v), flip ? 0 : 1) // x >= y: truly class 1
    }
    if (n0 > n1) {
      const u = rng.uniform()
      const v = rng.uniform()
      push(Math.min(u, v), Math.max(u, v), 0)
    }
  }
  shuffle(rng, X, y)
  return { X, y, bounds }
}
