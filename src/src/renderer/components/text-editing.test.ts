import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store'
import { createDemoDocument } from '../../shared/demo-document'
import { CommandHistory } from '../../shared/commands/history'
import { AddChildCommand, EditTextCommand } from '../../shared/commands/node-commands'

function resetStore() {
  const doc = createDemoDocument()
  useStore.setState({
    document: doc,
    filePath: null,
    dirty: false,
    selectedNodeIds: new Set(),
    selectedBoundaryId: null,
    editingNodeId: null,
    isNewNode: false,
    contextMenuPosition: null,
    contextMenuTargetId: null,
    stylePanelOpen: false,
    history: new CommandHistory()
  })
}

function getRootId() {
  return useStore.getState().document.root_id!
}

function getFirstBranchId() {
  const doc = useStore.getState().document
  const root = doc.nodes.get(doc.root_id!)!
  return root.children[0]
}

describe('Text editing lifecycle', () => {
  beforeEach(resetStore)

  it('startEditing sets editingNodeId and isNewNode', () => {
    useStore.getState().startEditing('node-1', true)
    expect(useStore.getState().editingNodeId).toBe('node-1')
    expect(useStore.getState().isNewNode).toBe(true)
  })

  it('clearing editing resets both fields', () => {
    useStore.getState().startEditing('node-1', true)
    useStore.getState().setEditingNodeId(null)
    useStore.getState().setIsNewNode(false)
    expect(useStore.getState().editingNodeId).toBeNull()
    expect(useStore.getState().isNewNode).toBe(false)
  })

  it('EditTextCommand changes node text', () => {
    const branchId = getFirstBranchId()
    const oldText = useStore.getState().document.nodes.get(branchId)!.content.text

    useStore.getState().executeCommand(new EditTextCommand(branchId, 'New Text'))
    expect(useStore.getState().document.nodes.get(branchId)!.content.text).toBe('New Text')

    useStore.getState().undo()
    expect(useStore.getState().document.nodes.get(branchId)!.content.text).toBe(oldText)
  })

  it('new node cancel (undo) removes the node', () => {
    const branchId = getFirstBranchId()
    const initialChildCount = useStore.getState().document.nodes.get(branchId)!.children.length

    const cmd = new AddChildCommand(branchId, '')
    useStore.getState().executeCommand(cmd)
    expect(cmd.createdNodeId).toBeTruthy()
    expect(useStore.getState().document.nodes.has(cmd.createdNodeId!)).toBe(true)

    // Simulate cancel — undo the add
    useStore.getState().undo()
    expect(useStore.getState().document.nodes.has(cmd.createdNodeId!)).toBe(false)
    expect(useStore.getState().document.nodes.get(branchId)!.children.length).toBe(initialChildCount)
  })

  it('updateLastText updates the AddChild command text', () => {
    const branchId = getFirstBranchId()
    const cmd = new AddChildCommand(branchId, '')
    useStore.getState().executeCommand(cmd)
    const newId = cmd.createdNodeId!

    useStore.getState().updateLastText('Updated Name')
    useStore.getState().updateDocument((doc) => {
      const node = doc.nodes.get(newId)
      if (node) node.content.text = 'Updated Name'
    })

    expect(useStore.getState().document.nodes.get(newId)!.content.text).toBe('Updated Name')

    // Undo should remove the node
    useStore.getState().undo()
    expect(useStore.getState().document.nodes.has(newId)).toBe(false)

    // Redo should bring it back with the updated text
    useStore.getState().redo()
    expect(useStore.getState().document.nodes.get(newId)!.content.text).toBe('Updated Name')
  })
})

describe('Context menu state', () => {
  beforeEach(resetStore)

  it('openContextMenu sets position and target', () => {
    useStore.getState().openContextMenu(100, 200, 'node-1')
    expect(useStore.getState().contextMenuPosition).toEqual({ x: 100, y: 200 })
    expect(useStore.getState().contextMenuTargetId).toBe('node-1')
  })

  it('closeContextMenu clears state', () => {
    useStore.getState().openContextMenu(100, 200, 'node-1')
    useStore.getState().closeContextMenu()
    expect(useStore.getState().contextMenuPosition).toBeNull()
    expect(useStore.getState().contextMenuTargetId).toBeNull()
  })
})
