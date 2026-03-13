import type { Command } from './command'
import type { Document } from '../types/document'
import type { NodeId, Attachment } from '../types/node'

export class AddAttachmentCommand implements Command {
  readonly type = 'AddAttachment'

  constructor(
    private nodeId: NodeId,
    private attachment: Attachment
  ) {}

  execute(doc: Document): void {
    const node = doc.nodes.get(this.nodeId)
    if (!node) return
    node.content.attachments.push(this.attachment)
  }

  undo(doc: Document): void {
    const node = doc.nodes.get(this.nodeId)
    if (!node) return
    node.content.attachments.pop()
  }
}

export class RemoveAttachmentCommand implements Command {
  readonly type = 'RemoveAttachment'
  private removedAttachment: Attachment | null = null

  constructor(
    private nodeId: NodeId,
    private index: number
  ) {}

  execute(doc: Document): void {
    const node = doc.nodes.get(this.nodeId)
    if (!node) return
    const removed = node.content.attachments.splice(this.index, 1)
    this.removedAttachment = removed[0] ?? null
  }

  undo(doc: Document): void {
    const node = doc.nodes.get(this.nodeId)
    if (!node || !this.removedAttachment) return
    node.content.attachments.splice(this.index, 0, this.removedAttachment)
  }
}
