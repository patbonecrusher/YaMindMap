import { describe, it, expect } from 'vitest'
import { createDocumentWithRoot } from './types/document'
import {
  addChild,
  addSibling,
  removeSubtree,
  restoreSubtree,
  moveNode,
  depthOf,
  isAncestorOf,
  visibleNodeIds
} from './document-ops'

function makeTree() {
  const doc = createDocumentWithRoot('Root')
  const b1 = addChild(doc, doc.root_id!, 'Branch 1')
  const b2 = addChild(doc, doc.root_id!, 'Branch 2')
  const s11 = addChild(doc, b1, 'Sub 1.1')
  const s12 = addChild(doc, b1, 'Sub 1.2')
  const s21 = addChild(doc, b2, 'Sub 2.1')
  return { doc, b1, b2, s11, s12, s21 }
}

describe('addChild', () => {
  it('creates a child node', () => {
    const doc = createDocumentWithRoot('Root')
    const childId = addChild(doc, doc.root_id!, 'Child')
    expect(doc.nodes.has(childId)).toBe(true)
    expect(doc.nodes.get(childId)!.content.text).toBe('Child')
    expect(doc.nodes.get(childId)!.parent).toBe(doc.root_id)
    expect(doc.nodes.get(doc.root_id!)!.children).toContain(childId)
  })

  it('appends to end of children list', () => {
    const doc = createDocumentWithRoot('Root')
    const c1 = addChild(doc, doc.root_id!, 'C1')
    const c2 = addChild(doc, doc.root_id!, 'C2')
    const root = doc.nodes.get(doc.root_id!)!
    expect(root.children).toEqual([c1, c2])
  })

  it('reuses provided ID (for redo)', () => {
    const doc = createDocumentWithRoot('Root')
    const specificId = 'my-specific-id'
    const result = addChild(doc, doc.root_id!, 'Child', specificId)
    expect(result).toBe(specificId)
    expect(doc.nodes.has(specificId)).toBe(true)
  })
})

describe('addSibling', () => {
  it('inserts after the specified sibling', () => {
    const { doc, b1, b2 } = makeTree()
    const sib = addSibling(doc, b1, 'New Sibling')!
    const root = doc.nodes.get(doc.root_id!)!
    expect(root.children).toEqual([b1, sib, b2])
  })

  it('returns null for root node (no parent)', () => {
    const doc = createDocumentWithRoot('Root')
    const result = addSibling(doc, doc.root_id!, 'Sibling')
    expect(result).toBeNull()
  })

  it('reuses provided ID (for redo)', () => {
    const { doc, b1 } = makeTree()
    const specificId = 'sibling-id'
    const result = addSibling(doc, b1, 'Sib', specificId)
    expect(result).toBe(specificId)
  })

  it('sets correct parent', () => {
    const { doc, b1 } = makeTree()
    const sib = addSibling(doc, b1, 'Sib')!
    expect(doc.nodes.get(sib)!.parent).toBe(doc.root_id)
  })
})

describe('removeSubtree', () => {
  it('removes node and all descendants', () => {
    const { doc, b1, s11, s12 } = makeTree()
    const removed = removeSubtree(doc, b1)
    expect(removed.length).toBe(3) // b1, s11, s12
    expect(doc.nodes.has(b1)).toBe(false)
    expect(doc.nodes.has(s11)).toBe(false)
    expect(doc.nodes.has(s12)).toBe(false)
  })

  it('removes from parent children list', () => {
    const { doc, b1, b2 } = makeTree()
    removeSubtree(doc, b1)
    const root = doc.nodes.get(doc.root_id!)!
    expect(root.children).toEqual([b2])
  })

  it('returns removed nodes for undo', () => {
    const { doc, b1 } = makeTree()
    const removed = removeSubtree(doc, b1)
    expect(removed[0].id).toBe(b1)
    expect(removed[0].content.text).toBe('Branch 1')
  })

  it('returns empty array for non-existent node', () => {
    const { doc } = makeTree()
    const removed = removeSubtree(doc, 'nonexistent')
    expect(removed).toEqual([])
  })
})

describe('restoreSubtree', () => {
  it('re-inserts removed nodes', () => {
    const { doc, b1, b2, s11, s12 } = makeTree()
    const removed = removeSubtree(doc, b1)
    restoreSubtree(doc, removed, doc.root_id!, 0)

    expect(doc.nodes.has(b1)).toBe(true)
    expect(doc.nodes.has(s11)).toBe(true)
    expect(doc.nodes.has(s12)).toBe(true)
    const root = doc.nodes.get(doc.root_id!)!
    expect(root.children).toEqual([b1, b2])
  })
})

describe('moveNode', () => {
  it('reparents node and returns old position', () => {
    const { doc, b1, b2, s11 } = makeTree()
    const result = moveNode(doc, s11, b2, 0)
    expect(result).toEqual({ oldParentId: b1, oldIndex: 0 })
    expect(doc.nodes.get(s11)!.parent).toBe(b2)
    expect(doc.nodes.get(b2)!.children).toContain(s11)
    expect(doc.nodes.get(b1)!.children).not.toContain(s11)
  })

  it('rejects move into own subtree', () => {
    const { doc, b1, s11 } = makeTree()
    const result = moveNode(doc, b1, s11, 0)
    expect(result).toBeNull()
  })

  it('rejects move of root', () => {
    const { doc, b1 } = makeTree()
    const result = moveNode(doc, doc.root_id!, b1, 0)
    expect(result).toBeNull()
  })

  it('adjusts index when moving within same parent', () => {
    const { doc, b1, b2 } = makeTree()
    // Move b1 (index 0) to index 1 within same parent
    // After removal of b1, b2 is at index 0, so insertIndex 1 becomes 0
    const result = moveNode(doc, b1, doc.root_id!, 2)
    expect(result).toEqual({ oldParentId: doc.root_id!, oldIndex: 0 })
    const root = doc.nodes.get(doc.root_id!)!
    // b1 moved after b2
    expect(root.children).toEqual([b2, b1])
  })

  it('moves to specific index in new parent', () => {
    const { doc, b2, s11, s12 } = makeTree()
    // Move s11 from b1 to b2 at index 1 (after s21)
    moveNode(doc, s11, b2, 1)
    const b2Node = doc.nodes.get(b2)!
    expect(b2Node.children[1]).toBe(s11)
  })
})

describe('depthOf', () => {
  it('root is depth 0', () => {
    const { doc } = makeTree()
    expect(depthOf(doc, doc.root_id!)).toBe(0)
  })

  it('branches are depth 1', () => {
    const { doc, b1, b2 } = makeTree()
    expect(depthOf(doc, b1)).toBe(1)
    expect(depthOf(doc, b2)).toBe(1)
  })

  it('sub-topics are depth 2', () => {
    const { doc, s11, s12, s21 } = makeTree()
    expect(depthOf(doc, s11)).toBe(2)
    expect(depthOf(doc, s12)).toBe(2)
    expect(depthOf(doc, s21)).toBe(2)
  })
})

describe('isAncestorOf', () => {
  it('node is ancestor of itself', () => {
    const { doc, b1 } = makeTree()
    expect(isAncestorOf(doc, b1, b1)).toBe(true)
  })

  it('root is ancestor of all nodes', () => {
    const { doc, b1, s11 } = makeTree()
    expect(isAncestorOf(doc, doc.root_id!, b1)).toBe(true)
    expect(isAncestorOf(doc, doc.root_id!, s11)).toBe(true)
  })

  it('child is not ancestor of parent', () => {
    const { doc, b1 } = makeTree()
    expect(isAncestorOf(doc, b1, doc.root_id!)).toBe(false)
  })

  it('siblings are not ancestors of each other', () => {
    const { doc, b1, b2 } = makeTree()
    expect(isAncestorOf(doc, b1, b2)).toBe(false)
    expect(isAncestorOf(doc, b2, b1)).toBe(false)
  })
})

describe('visibleNodeIds', () => {
  it('returns all nodes when none collapsed', () => {
    const { doc } = makeTree()
    const visible = visibleNodeIds(doc)
    expect(visible.length).toBe(6) // root + 2 branches + 3 subtopics
  })

  it('skips children of collapsed nodes', () => {
    const { doc, b1, s11, s12 } = makeTree()
    doc.nodes.get(b1)!.collapsed = true
    const visible = visibleNodeIds(doc)
    expect(visible).not.toContain(s11)
    expect(visible).not.toContain(s12)
    expect(visible).toContain(b1) // collapsed node itself is visible
    expect(visible.length).toBe(4) // root, b1, b2, s21
  })

  it('returns empty for document with no root', () => {
    const { doc } = makeTree()
    doc.root_id = null
    expect(visibleNodeIds(doc)).toEqual([])
  })

  it('deeply collapsed subtree is fully hidden', () => {
    const { doc, b1, s11, s12 } = makeTree()
    // Add grandchild
    const gc = addChild(doc, s11, 'Grandchild')
    doc.nodes.get(b1)!.collapsed = true

    const visible = visibleNodeIds(doc)
    expect(visible).not.toContain(s11)
    expect(visible).not.toContain(s12)
    expect(visible).not.toContain(gc)
  })
})
