import { describe, expect, it } from 'vitest'
import { loadGolden } from '../helpers/golden'
import { leafRegions, probaGrid } from '../../src/core/regions'
import { DEFAULT_TREE_PARAMS, fitTree, nLeaves, predictProba } from '../../src/core/tree'

const moons = loadGolden('cart').cases.find((c: any) => c.name === 'moons_default')
const bounds = { x0: -2, x1: 3, y0: -1.5, y1: 2 }

describe('leafRegions', () => {
  const tree = fitTree(moons.X, moons.y, 2, { ...DEFAULT_TREE_PARAMS, ...moons.params })

  it('partitions the bounds', () => {
    const regions = leafRegions(tree, bounds)
    expect(regions.length).toBe(nLeaves(tree))
    const area = regions.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0)
    expect(Math.abs(area - (bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0))).toBeLessThanOrEqual(1e-9)
    for (const r of regions) {
      expect(predictProba(tree, [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2])).toEqual(r.proba)
    }
  })

  it('clamps thresholds outside the bounds and keeps the partition', () => {
    const small = { x0: -0.1, x1: 0.1, y0: -0.1, y1: 0.1 }
    const regions = leafRegions(tree, small)
    const area = regions.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0)
    expect(Math.abs(area - 0.04)).toBeLessThanOrEqual(1e-9)
  })
})

describe('probaGrid', () => {
  it('samples cell centres row-major from y0 upward', () => {
    const b = { x0: 0, x1: 2, y0: 0, y1: 4 }
    const grid = probaGrid((p) => [p[0], p[1], 0], b, 2, 3)
    expect(grid).toBeInstanceOf(Float64Array)
    expect(Array.from(grid)).toEqual([0.5, 1, 0, 1.5, 1, 0, 0.5, 3, 0, 1.5, 3, 0])
  })
})
