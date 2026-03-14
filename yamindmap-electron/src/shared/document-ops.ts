import type { Document } from './types/document'
import type { MindMapNode, NodeId } from './types/node'
import { createNode } from './types/node'

/**
 * Add a child node to a parent. Returns the new node's ID.
 * If `childId` is provided, reuses that ID (for redo).
 */
export function addChild(
  doc: Document,
  parentId: NodeId,
  text: string,
  childId?: NodeId
): NodeId {
  const parent = doc.nodes.get(parentId)
  if (!parent) throw new Error(`Parent node ${parentId} not found`)

  const id = childId ?? crypto.randomUUID()
  const node = createNode(id, text)
  node.parent = parentId
  doc.nodes.set(id, node)
  parent.children.push(id)
  return id
}

/**
 * Add a sibling node after `siblingOfId`. Returns the new node's ID.
 * If `newId` is provided, reuses that ID (for redo).
 * Returns null if siblingOf is root (root has no parent to add sibling to).
 */
export function addSibling(
  doc: Document,
  siblingOfId: NodeId,
  text: string,
  newId?: NodeId
): NodeId | null {
  const sibling = doc.nodes.get(siblingOfId)
  if (!sibling || sibling.parent === null) return null

  const parent = doc.nodes.get(sibling.parent)
  if (!parent) return null

  const id = newId ?? crypto.randomUUID()
  const node = createNode(id, text)
  node.parent = parent.id

  const siblingIndex = parent.children.indexOf(siblingOfId)
  parent.children.splice(siblingIndex + 1, 0, id)
  doc.nodes.set(id, node)
  return id
}

/**
 * Remove a node and all its descendants. Returns all removed nodes
 * (in order suitable for re-insertion during undo).
 */
export function removeSubtree(doc: Document, id: NodeId): MindMapNode[] {
  const node = doc.nodes.get(id)
  if (!node) return []

  // Remove from parent's children list
  if (node.parent !== null) {
    const parent = doc.nodes.get(node.parent)
    if (parent) {
      const idx = parent.children.indexOf(id)
      if (idx !== -1) parent.children.splice(idx, 1)
    }
  }

  // Collect all descendants (BFS)
  const removed: MindMapNode[] = []
  const queue: NodeId[] = [id]
  while (queue.length > 0) {
    const curId = queue.shift()!
    const cur = doc.nodes.get(curId)
    if (!cur) continue
    removed.push(cur)
    queue.push(...cur.children)
    doc.nodes.delete(curId)
  }

  return removed
}

/**
 * Re-insert a previously removed subtree. Used for undo of removeSubtree.
 * `removedNodes` should be the array returned by removeSubtree.
 * `parentId` is the parent to reattach to, `childIndex` is the insertion position.
 */
export function restoreSubtree(
  doc: Document,
  removedNodes: MindMapNode[],
  parentId: NodeId | null,
  childIndex: number
): void {
  if (removedNodes.length === 0) return

  // Re-insert all nodes
  for (const node of removedNodes) {
    doc.nodes.set(node.id, node)
  }

  // Reattach root of subtree to parent
  const subtreeRoot = removedNodes[0]
  subtreeRoot.parent = parentId

  if (parentId !== null) {
    const parent = doc.nodes.get(parentId)
    if (parent) {
      parent.children.splice(childIndex, 0, subtreeRoot.id)
    }
  }
}

/**
 * Move a node to a new parent at a given index.
 * Returns `{ oldParentId, oldIndex }` for undo, or null if move is invalid.
 */
export function moveNode(
  doc: Document,
  nodeId: NodeId,
  newParentId: NodeId,
  insertIndex: number
): { oldParentId: NodeId; oldIndex: number } | null {
  const node = doc.nodes.get(nodeId)
  if (!node) return null

  // Cannot move root
  if (node.parent === null) return null

  // Cannot move into own subtree
  if (isAncestorOf(doc, nodeId, newParentId)) return null

  const oldParentId = node.parent
  const oldParent = doc.nodes.get(oldParentId)
  if (!oldParent) return null

  const oldIndex = oldParent.children.indexOf(nodeId)
  if (oldIndex === -1) return null

  // Remove from old parent
  oldParent.children.splice(oldIndex, 1)

  // Adjust insert index if moving within same parent and removal shifted indices
  let adjustedIndex = insertIndex
  if (oldParentId === newParentId && oldIndex < insertIndex) {
    adjustedIndex--
  }

  // Insert into new parent
  const newParent = doc.nodes.get(newParentId)
  if (!newParent) return null

  adjustedIndex = Math.min(adjustedIndex, newParent.children.length)
  newParent.children.splice(adjustedIndex, 0, nodeId)
  node.parent = newParentId

  return { oldParentId, oldIndex }
}

/**
 * Get the depth of a node (number of ancestors to root). Root is depth 0.
 */
export function depthOf(doc: Document, id: NodeId): number {
  let depth = 0
  let currentId: NodeId | null = id
  while (currentId !== null) {
    const node = doc.nodes.get(currentId)
    if (!node || node.parent === null) break
    currentId = node.parent
    depth++
  }
  return depth
}

/**
 * Check if `ancestorId` is an ancestor of `descendantId`.
 */
export function isAncestorOf(doc: Document, ancestorId: NodeId, descendantId: NodeId): boolean {
  if (ancestorId === descendantId) return true
  let currentId: NodeId | null = descendantId
  while (currentId !== null) {
    if (currentId === ancestorId) return true
    const node = doc.nodes.get(currentId)
    if (!node) return false
    currentId = node.parent
  }
  return false
}

/**
 * Collect a node and all its descendants (BFS).
 */
export function collectDescendants(doc: Document, nodeId: NodeId): NodeId[] {
  const result: NodeId[] = [nodeId]
  const queue: NodeId[] = [nodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const node = doc.nodes.get(current)
    if (!node) continue
    for (const childId of node.children) {
      result.push(childId)
      queue.push(childId)
    }
  }
  return result
}

/**
 * Get all visible node IDs (BFS from root, skipping children of collapsed nodes).
 */
export function visibleNodeIds(doc: Document): NodeId[] {
  if (!doc.root_id) return []

  const result: NodeId[] = []
  const queue: NodeId[] = [doc.root_id]

  while (queue.length > 0) {
    const id = queue.shift()!
    const node = doc.nodes.get(id)
    if (!node) continue

    result.push(id)

    if (!node.collapsed) {
      queue.push(...node.children)
    }
  }

  return result
}
