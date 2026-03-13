import type { Command, TextUpdatable } from './command'
import type { Document } from '../types/document'
import type { MindMapNode, NodeId } from '../types/node'
import { addChild, addSibling, removeSubtree, restoreSubtree, moveNode } from '../document-ops'

export class AddChildCommand implements Command, TextUpdatable {
  readonly type = 'AddChild'
  private childId: NodeId | null = null
  private text: string

  constructor(
    private parentId: NodeId,
    text: string
  ) {
    this.text = text
  }

  execute(doc: Document): void {
    this.childId = addChild(doc, this.parentId, this.text, this.childId ?? undefined)
  }

  undo(doc: Document): void {
    if (this.childId) removeSubtree(doc, this.childId)
  }

  updateText(newText: string): void {
    this.text = newText
  }

  get createdNodeId(): NodeId | null {
    return this.childId
  }
}

export class AddSiblingCommand implements Command, TextUpdatable {
  readonly type = 'AddSibling'
  private newId: NodeId | null = null
  private text: string

  constructor(
    private siblingOfId: NodeId,
    text: string
  ) {
    this.text = text
  }

  execute(doc: Document): void {
    this.newId = addSibling(doc, this.siblingOfId, this.text, this.newId ?? undefined)
  }

  undo(doc: Document): void {
    if (this.newId) removeSubtree(doc, this.newId)
  }

  updateText(newText: string): void {
    this.text = newText
  }

  get createdNodeId(): NodeId | null {
    return this.newId
  }
}

export class DeleteNodeCommand implements Command {
  readonly type = 'DeleteNode'
  private removedNodes: MindMapNode[] = []
  private parentId: NodeId | null = null
  private childIndex = 0

  constructor(private nodeId: NodeId) {}

  execute(doc: Document): void {
    const node = doc.nodes.get(this.nodeId)
    if (!node) return
    this.parentId = node.parent
    if (this.parentId) {
      const parent = doc.nodes.get(this.parentId)
      if (parent) {
        this.childIndex = parent.children.indexOf(this.nodeId)
      }
    }
    this.removedNodes = removeSubtree(doc, this.nodeId)
  }

  undo(doc: Document): void {
    restoreSubtree(doc, this.removedNodes, this.parentId, this.childIndex)
  }
}

export class DeleteAndReparentCommand implements Command {
  readonly type = 'DeleteAndReparent'
  private nodeId: NodeId
  private removedNode: MindMapNode | null = null
  private parentId: NodeId | null = null
  private childIndex = 0
  private childIds: NodeId[] = []

  constructor(nodeId: NodeId) {
    this.nodeId = nodeId
  }

  execute(doc: Document): void {
    const node = doc.nodes.get(this.nodeId)
    if (!node || node.parent === null) return

    this.parentId = node.parent
    this.childIds = [...node.children]
    const parent = doc.nodes.get(this.parentId)
    if (!parent) return

    this.childIndex = parent.children.indexOf(this.nodeId)

    // Remove the node from parent's children
    parent.children.splice(this.childIndex, 1)

    // Reparent children to grandparent at the same position
    for (let i = 0; i < this.childIds.length; i++) {
      const childNode = doc.nodes.get(this.childIds[i])
      if (childNode) {
        childNode.parent = this.parentId
        parent.children.splice(this.childIndex + i, 0, this.childIds[i])
      }
    }

    // Store and remove the node itself (not its children)
    this.removedNode = node
    doc.nodes.delete(this.nodeId)
  }

  undo(doc: Document): void {
    if (!this.removedNode || this.parentId === null) return

    const parent = doc.nodes.get(this.parentId)
    if (!parent) return

    // Remove reparented children from grandparent
    for (const childId of this.childIds) {
      const idx = parent.children.indexOf(childId)
      if (idx !== -1) parent.children.splice(idx, 1)
    }

    // Re-insert the node
    doc.nodes.set(this.nodeId, this.removedNode)
    parent.children.splice(this.childIndex, 0, this.nodeId)

    // Restore children back to the node
    this.removedNode.children = [...this.childIds]
    for (const childId of this.childIds) {
      const childNode = doc.nodes.get(childId)
      if (childNode) childNode.parent = this.nodeId
    }
  }
}

export class EditTextCommand implements Command {
  readonly type = 'EditText'
  private oldText = ''

  constructor(
    private nodeId: NodeId,
    private newText: string
  ) {}

  execute(doc: Document): void {
    const node = doc.nodes.get(this.nodeId)
    if (!node) return
    this.oldText = node.content.text
    node.content.text = this.newText
  }

  undo(doc: Document): void {
    const node = doc.nodes.get(this.nodeId)
    if (!node) return
    node.content.text = this.oldText
  }
}

export class MoveNodeCommand implements Command {
  readonly type = 'MoveNode'
  private oldParentId: NodeId | null = null
  private oldIndex = 0

  constructor(
    private nodeId: NodeId,
    private newParentId: NodeId,
    private insertIndex: number
  ) {}

  execute(doc: Document): void {
    const result = moveNode(doc, this.nodeId, this.newParentId, this.insertIndex)
    if (result) {
      this.oldParentId = result.oldParentId
      this.oldIndex = result.oldIndex
    }
  }

  undo(doc: Document): void {
    if (this.oldParentId !== null) {
      moveNode(doc, this.nodeId, this.oldParentId, this.oldIndex)
    }
  }
}

export class ResizeNodeCommand implements Command {
  readonly type = 'ResizeNode'
  private oldWidths: Map<NodeId, number | null> = new Map()

  constructor(
    private nodeIds: NodeId[],
    private newWidth: number
  ) {}

  execute(doc: Document): void {
    for (const id of this.nodeIds) {
      const node = doc.nodes.get(id)
      if (node) {
        this.oldWidths.set(id, node.manual_width)
        node.manual_width = this.newWidth
      }
    }
  }

  undo(doc: Document): void {
    for (const [id, oldWidth] of this.oldWidths) {
      const node = doc.nodes.get(id)
      if (node) {
        node.manual_width = oldWidth
      }
    }
  }
}
