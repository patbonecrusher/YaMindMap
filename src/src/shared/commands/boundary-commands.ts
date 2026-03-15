import type { Command } from './command'
import type { Document } from '../types/document'
import type { NodeId } from '../types/node'
import type { Boundary, BoundaryId } from '../types/boundary'
import { createBoundary } from '../types/boundary'

export class AddBoundaryCommand implements Command {
  readonly type = 'AddBoundary'
  private boundaryId: BoundaryId | null = null

  constructor(
    private nodeIds: NodeId[],
    private label: string = ''
  ) {}

  execute(doc: Document): void {
    const id = this.boundaryId ?? crypto.randomUUID()
    this.boundaryId = id
    const boundary = createBoundary(id, this.nodeIds, doc.default_boundary_style)
    boundary.label = this.label
    doc.boundaries.set(id, boundary)
  }

  undo(doc: Document): void {
    if (this.boundaryId) {
      doc.boundaries.delete(this.boundaryId)
    }
  }

  get createdBoundaryId(): BoundaryId | null {
    return this.boundaryId
  }
}

export class DeleteBoundaryCommand implements Command {
  readonly type = 'DeleteBoundary'
  private storedBoundary: Boundary | null = null

  constructor(private boundaryId: BoundaryId) {}

  execute(doc: Document): void {
    this.storedBoundary = doc.boundaries.get(this.boundaryId) ?? null
    doc.boundaries.delete(this.boundaryId)
  }

  undo(doc: Document): void {
    if (this.storedBoundary) {
      doc.boundaries.set(this.boundaryId, this.storedBoundary)
    }
  }
}

export class EditBoundaryLabelCommand implements Command {
  readonly type = 'EditBoundaryLabel'
  private oldLabel = ''

  constructor(
    private boundaryId: BoundaryId,
    private newLabel: string
  ) {}

  execute(doc: Document): void {
    const boundary = doc.boundaries.get(this.boundaryId)
    if (!boundary) return
    this.oldLabel = boundary.label
    boundary.label = this.newLabel
  }

  undo(doc: Document): void {
    const boundary = doc.boundaries.get(this.boundaryId)
    if (!boundary) return
    boundary.label = this.oldLabel
  }
}
