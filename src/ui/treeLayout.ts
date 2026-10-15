/**
 * Tidy layout for the tree diagram. Pure and iterative (trees can have thousands of nodes).
 *
 * Coordinates are in diagram units: `y` is the depth (root 0) and `x` is the horizontal slot position. Every
 * visible leaf takes the next free integer slot from left to right and a parent is centred over its children, so
 * two nodes on one level are always at least 1 apart. `width` is the number of slots, `height` the number of
 * levels. The component scales the units to pixels.
 */

export interface DiagramNode {
  id: number
  /** Parent id, -1 for the root. */
  parent: number
  /** Which branch of the parent this node is (left = condition true); null for the root. */
  side: 'L' | 'R' | null
  title: string
  detail: string
  /** Class counts (or weights) in this node. */
  counts: number[]
  leaf: boolean
  /** Set by `layoutTree`: number of hidden descendants of a node cut off at `collapseDepth`. */
  collapsed?: number
}

export type PlacedNode = DiagramNode & { x: number; y: number }

export function layoutTree(
  nodes: DiagramNode[],
  collapseDepth: number,
): { nodes: PlacedNode[]; width: number; height: number } {
  if (nodes.length === 0) return { nodes: [], width: 0, height: 0 }

  const byId = new Map<number, DiagramNode>()
  for (const n of nodes) byId.set(n.id, n)
  const children = new Map<number, DiagramNode[]>()
  const roots: DiagramNode[] = []
  for (const n of nodes) {
    if (n.parent === -1 || !byId.has(n.parent)) {
      roots.push(n)
    } else {
      const list = children.get(n.parent)
      if (list) list.push(n)
      else children.set(n.parent, [n])
    }
  }
  const rank = (n: DiagramNode) => (n.side === 'L' ? 0 : n.side === 'R' ? 1 : 2)
  for (const list of children.values()) list.sort((a, b) => rank(a) - rank(b) || a.id - b.id)

  // Descendant counts for collapsed nodes: post-order over an explicit stack.
  const size = new Map<number, number>()
  const order: { node: DiagramNode; depth: number }[] = []
  const stack = roots.map((node) => ({ node, depth: 0 })).reverse()
  while (stack.length > 0) {
    const item = stack.pop()!
    order.push(item)
    const kids = children.get(item.node.id)
    if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], depth: item.depth + 1 })
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i].node.id
    let s = 1
    for (const k of children.get(id) ?? []) s += size.get(k.id)!
    size.set(id, s)
  }

  // `order` is preorder (left to right), so leaf slots are assigned in reading order; parents come before children,
  // hence the centring pass runs over `order` reversed.
  const visible: { node: DiagramNode; depth: number; kids: DiagramNode[] }[] = []
  for (const item of order) {
    if (item.depth > collapseDepth) continue
    const kids = item.depth < collapseDepth ? (children.get(item.node.id) ?? []) : []
    visible.push({ ...item, kids })
  }
  let slot = 0
  const xOf = new Map<number, number>()
  for (const v of visible) if (v.kids.length === 0) xOf.set(v.node.id, slot++)
  for (let i = visible.length - 1; i >= 0; i--) {
    const v = visible[i]
    if (v.kids.length > 0) {
      const first = xOf.get(v.kids[0].id)!
      const last = xOf.get(v.kids[v.kids.length - 1].id)!
      xOf.set(v.node.id, (first + last) / 2)
    }
  }
  let maxDepth = 0
  const out: PlacedNode[] = []
  for (const v of visible) {
    const hidden = v.kids.length === 0 ? size.get(v.node.id)! - 1 : 0
    const base: DiagramNode = { ...v.node }
    if (hidden > 0) base.collapsed = hidden
    else delete base.collapsed
    const p: PlacedNode = { ...base, x: xOf.get(v.node.id)!, y: v.depth }
    out.push(p)
    if (v.depth > maxDepth) maxDepth = v.depth
  }
  return { nodes: out, width: slot, height: maxDepth + 1 }
}
