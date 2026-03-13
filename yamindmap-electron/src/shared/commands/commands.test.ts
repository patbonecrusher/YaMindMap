import { describe, it, expect } from 'vitest'
import { createDocumentWithRoot } from '../types/document'
import { addChild } from '../document-ops'
import { CommandHistory } from './history'
import { AddChildCommand, AddSiblingCommand, DeleteNodeCommand, DeleteAndReparentCommand, EditTextCommand, MoveNodeCommand, ResizeNodeCommand } from './node-commands'
import { AddAttachmentCommand, RemoveAttachmentCommand } from './attachment-commands'
import { AddBoundaryCommand, DeleteBoundaryCommand, EditBoundaryLabelCommand } from './boundary-commands'

function makeDoc() {
  const doc = createDocumentWithRoot('Root')
  const b1 = addChild(doc, doc.root_id!, 'Branch 1')
  const b2 = addChild(doc, doc.root_id!, 'Branch 2')
  const s11 = addChild(doc, b1, 'Sub 1.1')
  const s12 = addChild(doc, b1, 'Sub 1.2')
  return { doc, b1, b2, s11, s12 }
}

describe('AddChildCommand', () => {
  it('execute creates child, undo removes it', () => {
    const { doc } = makeDoc()
    const history = new CommandHistory()
    const cmd = new AddChildCommand(doc.root_id!, 'New Child')
    history.execute(cmd, doc)

    const childId = cmd.createdNodeId!
    expect(doc.nodes.has(childId)).toBe(true)
    expect(doc.nodes.get(childId)!.content.text).toBe('New Child')

    history.undo(doc)
    expect(doc.nodes.has(childId)).toBe(false)
  })

  it('redo reuses same ID', () => {
    const { doc } = makeDoc()
    const history = new CommandHistory()
    const cmd = new AddChildCommand(doc.root_id!, 'Child')
    history.execute(cmd, doc)

    const firstId = cmd.createdNodeId!
    history.undo(doc)
    history.redo(doc)

    expect(cmd.createdNodeId).toBe(firstId)
    expect(doc.nodes.has(firstId)).toBe(true)
  })
})

describe('AddSiblingCommand', () => {
  it('execute creates sibling, undo removes it', () => {
    const { doc, b1, b2 } = makeDoc()
    const history = new CommandHistory()
    const cmd = new AddSiblingCommand(b1, 'Sibling')
    history.execute(cmd, doc)

    const sibId = cmd.createdNodeId!
    const root = doc.nodes.get(doc.root_id!)!
    expect(root.children).toEqual([b1, sibId, b2])

    history.undo(doc)
    expect(root.children).toEqual([b1, b2])
  })
})

describe('DeleteNodeCommand', () => {
  it('removes subtree, undo restores it', () => {
    const { doc, b1, s11, s12 } = makeDoc()
    const history = new CommandHistory()
    const cmd = new DeleteNodeCommand(b1)
    history.execute(cmd, doc)

    expect(doc.nodes.has(b1)).toBe(false)
    expect(doc.nodes.has(s11)).toBe(false)
    expect(doc.nodes.has(s12)).toBe(false)

    history.undo(doc)
    expect(doc.nodes.has(b1)).toBe(true)
    expect(doc.nodes.has(s11)).toBe(true)
    expect(doc.nodes.has(s12)).toBe(true)
    expect(doc.nodes.get(b1)!.children).toEqual([s11, s12])
  })
})

describe('DeleteAndReparentCommand', () => {
  it('removes node, promotes children to grandparent', () => {
    const { doc, b1, s11, s12, b2 } = makeDoc()
    const history = new CommandHistory()
    const cmd = new DeleteAndReparentCommand(b1)
    history.execute(cmd, doc)

    expect(doc.nodes.has(b1)).toBe(false)
    expect(doc.nodes.has(s11)).toBe(true)
    expect(doc.nodes.has(s12)).toBe(true)

    const root = doc.nodes.get(doc.root_id!)!
    expect(root.children).toEqual([s11, s12, b2])
    expect(doc.nodes.get(s11)!.parent).toBe(doc.root_id)
    expect(doc.nodes.get(s12)!.parent).toBe(doc.root_id)
  })

  it('undo reverses reparenting', () => {
    const { doc, b1, s11, s12, b2 } = makeDoc()
    const history = new CommandHistory()
    const cmd = new DeleteAndReparentCommand(b1)
    history.execute(cmd, doc)
    history.undo(doc)

    expect(doc.nodes.has(b1)).toBe(true)
    const root = doc.nodes.get(doc.root_id!)!
    expect(root.children).toEqual([b1, b2])
    expect(doc.nodes.get(b1)!.children).toEqual([s11, s12])
    expect(doc.nodes.get(s11)!.parent).toBe(b1)
  })
})

describe('EditTextCommand', () => {
  it('changes text, undo restores old text', () => {
    const { doc, b1 } = makeDoc()
    const history = new CommandHistory()
    const cmd = new EditTextCommand(b1, 'Updated')
    history.execute(cmd, doc)

    expect(doc.nodes.get(b1)!.content.text).toBe('Updated')

    history.undo(doc)
    expect(doc.nodes.get(b1)!.content.text).toBe('Branch 1')
  })
})

describe('MoveNodeCommand', () => {
  it('reparents node, undo moves it back', () => {
    const { doc, b1, b2, s11 } = makeDoc()
    const history = new CommandHistory()
    const cmd = new MoveNodeCommand(s11, b2, 0)
    history.execute(cmd, doc)

    expect(doc.nodes.get(s11)!.parent).toBe(b2)
    expect(doc.nodes.get(b2)!.children).toContain(s11)

    history.undo(doc)
    expect(doc.nodes.get(s11)!.parent).toBe(b1)
    expect(doc.nodes.get(b1)!.children).toContain(s11)
  })
})

describe('AddAttachmentCommand', () => {
  it('adds attachment, undo removes it', () => {
    const { doc, b1 } = makeDoc()
    const history = new CommandHistory()
    const attachment = { kind: { type: 'Url' as const, url: 'https://example.com' }, label: 'Test' }
    const cmd = new AddAttachmentCommand(b1, attachment)
    history.execute(cmd, doc)

    expect(doc.nodes.get(b1)!.content.attachments.length).toBe(1)

    history.undo(doc)
    expect(doc.nodes.get(b1)!.content.attachments.length).toBe(0)
  })
})

describe('RemoveAttachmentCommand', () => {
  it('removes attachment at index, undo restores it', () => {
    const { doc, b1 } = makeDoc()
    const node = doc.nodes.get(b1)!
    node.content.attachments = [
      { kind: { type: 'Url', url: 'https://a.com' } },
      { kind: { type: 'Document', path: '/test.pdf' } }
    ]

    const history = new CommandHistory()
    const cmd = new RemoveAttachmentCommand(b1, 0)
    history.execute(cmd, doc)

    expect(node.content.attachments.length).toBe(1)
    expect(node.content.attachments[0].kind.type).toBe('Document')

    history.undo(doc)
    expect(node.content.attachments.length).toBe(2)
    expect(node.content.attachments[0].kind.type).toBe('Url')
  })
})

describe('AddBoundaryCommand', () => {
  it('creates boundary, undo removes it', () => {
    const { doc, b1, s11, s12 } = makeDoc()
    const history = new CommandHistory()
    const cmd = new AddBoundaryCommand([b1, s11, s12], 'My Group')
    history.execute(cmd, doc)

    expect(doc.boundaries.size).toBe(1)
    const boundary = doc.boundaries.get(cmd.createdBoundaryId!)!
    expect(boundary.label).toBe('My Group')
    expect(boundary.node_ids).toEqual([b1, s11, s12])

    history.undo(doc)
    expect(doc.boundaries.size).toBe(0)
  })

  it('redo reuses same boundary ID', () => {
    const { doc, b1 } = makeDoc()
    const history = new CommandHistory()
    const cmd = new AddBoundaryCommand([b1])
    history.execute(cmd, doc)

    const firstId = cmd.createdBoundaryId!
    history.undo(doc)
    history.redo(doc)
    expect(cmd.createdBoundaryId).toBe(firstId)
  })
})

describe('DeleteBoundaryCommand', () => {
  it('removes boundary, undo restores it', () => {
    const { doc, b1 } = makeDoc()
    const addCmd = new AddBoundaryCommand([b1], 'Group')
    const history = new CommandHistory()
    history.execute(addCmd, doc)

    const bId = addCmd.createdBoundaryId!
    const delCmd = new DeleteBoundaryCommand(bId)
    history.execute(delCmd, doc)
    expect(doc.boundaries.size).toBe(0)

    history.undo(doc)
    expect(doc.boundaries.size).toBe(1)
    expect(doc.boundaries.get(bId)!.label).toBe('Group')
  })
})

describe('EditBoundaryLabelCommand', () => {
  it('changes label, undo restores old label', () => {
    const { doc, b1 } = makeDoc()
    const history = new CommandHistory()
    const addCmd = new AddBoundaryCommand([b1], 'Old')
    history.execute(addCmd, doc)

    const bId = addCmd.createdBoundaryId!
    const editCmd = new EditBoundaryLabelCommand(bId, 'New')
    history.execute(editCmd, doc)
    expect(doc.boundaries.get(bId)!.label).toBe('New')

    history.undo(doc)
    expect(doc.boundaries.get(bId)!.label).toBe('Old')
  })
})

describe('CommandHistory', () => {
  it('redo stack cleared on new command', () => {
    const { doc } = makeDoc()
    const history = new CommandHistory()

    history.execute(new AddChildCommand(doc.root_id!, 'A'), doc)
    history.execute(new AddChildCommand(doc.root_id!, 'B'), doc)
    history.undo(doc)
    expect(history.canRedo).toBe(true)

    history.execute(new AddChildCommand(doc.root_id!, 'C'), doc)
    expect(history.canRedo).toBe(false)
  })

  it('updateLastText updates the last command text', () => {
    const { doc } = makeDoc()
    const history = new CommandHistory()
    const cmd = new AddChildCommand(doc.root_id!, '')
    history.execute(cmd, doc)

    const childId = cmd.createdNodeId!
    history.updateLastText('Final Text')

    // Undo and redo to verify the text was updated
    history.undo(doc)
    history.redo(doc)
    expect(doc.nodes.get(childId)!.content.text).toBe('Final Text')
  })

  it('reports canUndo/canRedo correctly', () => {
    const { doc } = makeDoc()
    const history = new CommandHistory()

    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)

    history.execute(new EditTextCommand(doc.root_id!, 'X'), doc)
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)

    history.undo(doc)
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
  })
})

describe('ResizeNodeCommand', () => {
  it('sets manual_width on single node', () => {
    const { doc, b1 } = makeDoc()
    const history = new CommandHistory()

    expect(doc.nodes.get(b1)!.manual_width).toBeNull()
    history.execute(new ResizeNodeCommand([b1], 200), doc)
    expect(doc.nodes.get(b1)!.manual_width).toBe(200)
  })

  it('undo restores original width', () => {
    const { doc, b1 } = makeDoc()
    const history = new CommandHistory()

    history.execute(new ResizeNodeCommand([b1], 200), doc)
    history.undo(doc)
    expect(doc.nodes.get(b1)!.manual_width).toBeNull()
  })

  it('resizes multiple nodes at once', () => {
    const { doc, b1, b2 } = makeDoc()
    const history = new CommandHistory()

    history.execute(new ResizeNodeCommand([b1, b2], 150), doc)
    expect(doc.nodes.get(b1)!.manual_width).toBe(150)
    expect(doc.nodes.get(b2)!.manual_width).toBe(150)
  })

  it('undo restores all original widths in multi-resize', () => {
    const { doc, b1, b2 } = makeDoc()
    const history = new CommandHistory()

    // Set b1 to have an existing manual_width
    doc.nodes.get(b1)!.manual_width = 100
    history.execute(new ResizeNodeCommand([b1, b2], 200), doc)
    history.undo(doc)
    expect(doc.nodes.get(b1)!.manual_width).toBe(100)
    expect(doc.nodes.get(b2)!.manual_width).toBeNull()
  })
})
