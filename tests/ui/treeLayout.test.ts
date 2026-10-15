import { describe, expect, it } from 'vitest'
import { layoutTree, type DiagramNode } from '../../src/ui/treeLayout'

/** Complete binary tree of the given depth in preorder-free breadth-first ids (children 2i+1, 2i+2). */
function fullTree(depth: number): DiagramNode[] {
  const total = 2 ** (depth + 1) - 1
  const nodes: DiagramNode[] = []
  for (let id = 0; id < total; id++) {
    const d = Math.floor(Math.log2(id + 1))
    nodes.push({
      id,
      parent: id === 0 ? -1 : Math.floor((id - 1) / 2),
      side: id === 0 ? null : id % 2 === 1 ? 'L' : 'R',
      title: `n${id}`,
      detail: '',
      counts: [1, 1],
      leaf: d === depth,
    })
  }
  return nodes
}

describe('layoutTree', () => {
  it('lays out a small tree with parents centred above their children', () => {
    const out = layoutTree(fullTree(2), 6)
    expect(out.nodes.length).toBe(7)
    const at = (id: number) => out.nodes.find((n) => n.id === id)!
    expect(at(3).x).toBe(0)
    expect(at(4).x).toBe(1)
    expect(at(1).x).toBe(0.5)
    expect(at(0).x).toBe(1.5)
    expect(at(0).y).toBe(0)
    expect(at(6).y).toBe(2)
    expect(out.width).toBe(4)
    expect(out.height).toBe(3)
  })

  it('collapses below collapseDepth', () => {
    const nodes = fullTree(12)
    expect(nodes.length).toBe(8191)
    const out = layoutTree(nodes, 6)
    expect(out.nodes.length).toBe(127)
    const atDepth6 = out.nodes.filter((n) => n.y === 6)
    expect(atDepth6.length).toBe(64)
    for (const n of atDepth6) expect(n.collapsed).toBeGreaterThan(0)
    expect(atDepth6[0].collapsed).toBe(2 ** 7 - 2) // all descendants of a depth-6 node: 2^7 - 2
    expect(out.nodes.filter((n) => n.y < 6).every((n) => n.collapsed === undefined)).toBe(true)
    // neighbours on one level are at least one unit apart
    for (let d = 0; d <= 6; d++) {
      const xs = out.nodes.filter((n) => n.y === d).map((n) => n.x).sort((a, b) => a - b)
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(1)
    }
    expect(out.height).toBe(7)
  })

  it('does not mark real leaves at the collapse depth as collapsed', () => {
    const out = layoutTree(fullTree(3), 3)
    expect(out.nodes.length).toBe(15)
    expect(out.nodes.every((n) => n.collapsed === undefined)).toBe(true)
  })

  it('is independent of the order of the input nodes and handles an empty tree', () => {
    const a = layoutTree(fullTree(3), 6)
    const b = layoutTree([...fullTree(3)].reverse(), 6)
    const key = (r: typeof a) => r.nodes.map((n) => [n.id, n.x, n.y]).sort((p, q) => p[0] - q[0])
    expect(key(b)).toEqual(key(a))
    expect(layoutTree([], 6)).toEqual({ nodes: [], width: 0, height: 0 })
  })

  it('handles a single-node tree', () => {
    const out = layoutTree([{ id: 0, parent: -1, side: null, title: 'r', detail: '', counts: [3], leaf: true }], 6)
    expect(out.nodes.map((n) => [n.x, n.y])).toEqual([[0, 0]])
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
  })
})
