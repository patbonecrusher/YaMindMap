import { describe, it, expect } from 'vitest'
import { createDocumentWithRoot } from '../types/document'
import { addChild } from '../document-ops'
import { createBoundary } from '../types/boundary'
import { balancedLayout } from './balanced'
import { bezierBetween } from './routing'
import type { NodeSizeMap } from './types'
import type { NodeId } from '../types/node'
import type { Size } from '../types/geometry'

function fixedSizes(map: Record<string, Size>): NodeSizeMap {
  return {
    get(id: NodeId) {
      return map[id] ?? { width: 100, height: 40 }
    }
  }
}

function makeTree() {
  const doc = createDocumentWithRoot('Root')
  const b1 = addChild(doc, doc.root_id!, 'Branch 1')
  const b2 = addChild(doc, doc.root_id!, 'Branch 2')
  const s11 = addChild(doc, b1, 'Sub 1.1')
  const s12 = addChild(doc, b1, 'Sub 1.2')
  const s21 = addChild(doc, b2, 'Sub 2.1')
  return { doc, b1, b2, s11, s12, s21 }
}

describe('balancedLayout', () => {
  it('places root centered at origin', () => {
    const doc = createDocumentWithRoot('Root')
    const sizes = fixedSizes({ [doc.root_id!]: { width: 120, height: 50 } })
    const result = balancedLayout(doc, sizes)

    const rootRect = result.positions.get(doc.root_id!)!
    expect(rootRect.x).toBe(-60)
    expect(rootRect.y).toBe(-25)
    expect(rootRect.width).toBe(120)
    expect(rootRect.height).toBe(50)
  })

  it('balanced partition splits children to both sides', () => {
    const { doc, b1, b2 } = makeTree()
    const sizes = fixedSizes({})
    const result = balancedLayout(doc, sizes)

    const rootRect = result.positions.get(doc.root_id!)!
    const b1Rect = result.positions.get(b1)!
    const b2Rect = result.positions.get(b2)!

    // With balanced direction, first child goes right, second goes left
    // (since right starts with 0 height <= left's 0 height)
    expect(b1Rect.x).toBeGreaterThan(rootRect.x + rootRect.width)
    expect(b2Rect.x + b2Rect.width).toBeLessThan(rootRect.x)
  })

  it('RightOnly places all children to the right', () => {
    const { doc, b1, b2 } = makeTree()
    doc.layout_config.direction = 'RightOnly'
    const sizes = fixedSizes({})
    const result = balancedLayout(doc, sizes)

    const rootRect = result.positions.get(doc.root_id!)!
    const b1Rect = result.positions.get(b1)!
    const b2Rect = result.positions.get(b2)!

    expect(b1Rect.x).toBeGreaterThan(rootRect.x)
    expect(b2Rect.x).toBeGreaterThan(rootRect.x)
  })

  it('LeftOnly places all children to the left', () => {
    const { doc, b1, b2 } = makeTree()
    doc.layout_config.direction = 'LeftOnly'
    const sizes = fixedSizes({})
    const result = balancedLayout(doc, sizes)

    const rootRect = result.positions.get(doc.root_id!)!
    const b1Rect = result.positions.get(b1)!
    const b2Rect = result.positions.get(b2)!

    expect(b1Rect.x + b1Rect.width).toBeLessThan(rootRect.x)
    expect(b2Rect.x + b2Rect.width).toBeLessThan(rootRect.x)
  })

  it('collapsed subtrees are excluded from layout', () => {
    const { doc, b1, s11, s12 } = makeTree()
    doc.nodes.get(b1)!.collapsed = true
    const sizes = fixedSizes({})
    const result = balancedLayout(doc, sizes)

    // b1 is positioned, but its children are not
    expect(result.positions.has(b1)).toBe(true)
    expect(result.positions.has(s11)).toBe(false)
    expect(result.positions.has(s12)).toBe(false)
  })

  it('adds boundary gap between siblings in different boundaries', () => {
    const doc = createDocumentWithRoot('Root')
    doc.layout_config.direction = 'RightOnly'
    const c1 = addChild(doc, doc.root_id!, 'C1')
    const c2 = addChild(doc, doc.root_id!, 'C2')
    const c3 = addChild(doc, doc.root_id!, 'C3')

    // c1 in boundary A, c2 in boundary B, c3 not in any
    const bA = createBoundary(crypto.randomUUID(), [c1])
    bA.padding = 10
    doc.boundaries.set(bA.id, bA)

    const bB = createBoundary(crypto.randomUUID(), [c2])
    bB.padding = 10
    doc.boundaries.set(bB.id, bB)

    const sizes = fixedSizes({})
    const result = balancedLayout(doc, sizes)

    const c1Rect = result.positions.get(c1)!
    const c2Rect = result.positions.get(c2)!
    const c3Rect = result.positions.get(c3)!

    // Gap between c1 and c2 should be larger than between c2 and c3
    const gap12 = c2Rect.y - (c1Rect.y + c1Rect.height)
    const gap23 = c3Rect.y - (c2Rect.y + c2Rect.height)

    expect(gap12).toBeGreaterThan(gap23)
  })

  it('generates edge routes for all parent-child connections', () => {
    const { doc, b1, b2 } = makeTree()
    const sizes = fixedSizes({})
    const result = balancedLayout(doc, sizes)

    // Root -> b1, Root -> b2
    expect(result.edgeRoutes.size).toBeGreaterThanOrEqual(2)
  })

  it('handles empty document', () => {
    const doc = createDocumentWithRoot('Root')
    doc.root_id = null
    const sizes = fixedSizes({})
    const result = balancedLayout(doc, sizes)
    expect(result.positions.size).toBe(0)
  })
})

describe('bezierBetween', () => {
  it('generates S-curve with 50% horizontal offset', () => {
    const parent = { x: 0, y: 0, width: 100, height: 40 }
    const child = { x: 200, y: 20, width: 80, height: 30 }

    const route = bezierBetween(parent, child)

    // From: right center of parent
    expect(route.from.x).toBe(100) // parent.x + parent.width
    expect(route.from.y).toBe(20)  // parent center y

    // To: left center of child
    expect(route.to.x).toBe(200) // child.x
    expect(route.to.y).toBe(35)  // child center y

    // Control points: 50% horizontal offset
    const dx = (route.to.x - route.from.x) * 0.5
    expect(route.ctrl1.x).toBe(route.from.x + dx)
    expect(route.ctrl1.y).toBe(route.from.y)
    expect(route.ctrl2.x).toBe(route.to.x - dx)
    expect(route.ctrl2.y).toBe(route.to.y)
  })

  it('connects from left when child is to the left', () => {
    const parent = { x: 200, y: 0, width: 100, height: 40 }
    const child = { x: 0, y: 10, width: 80, height: 30 }

    const route = bezierBetween(parent, child)

    // From: left center of parent
    expect(route.from.x).toBe(200) // parent.x
    // To: right center of child
    expect(route.to.x).toBe(80) // child.x + child.width
  })
})
