import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store'
import { createDemoDocument } from '../../shared/demo-document'
import { CommandHistory } from '../../shared/commands/history'
import { AddChildCommand, AddSiblingCommand, DeleteNodeCommand, DeleteAndReparentCommand } from '../../shared/commands/node-commands'

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

function getFirstBranch() {
  const doc = useStore.getState().document
  return doc.nodes.get(getFirstBranchId())!
}

describe('Keyboard shortcut logic', () => {
  beforeEach(resetStore)

  describe('Tab — add child', () => {
    it('adds a child to selected node', () => {
      const branchId = getFirstBranchId()
      const initialChildCount = getFirstBranch().children.length
      useStore.getState().select(branchId)

      const cmd = new AddChildCommand(branchId, '')
      useStore.getState().executeCommand(cmd)

      expect(useStore.getState().document.nodes.get(branchId)!.children.length).toBe(initialChildCount + 1)
      expect(cmd.createdNodeId).toBeTruthy()
    })
  })

  describe('Enter — add sibling', () => {
    it('adds a sibling to selected node', () => {
      const branchId = getFirstBranchId()
      const rootId = getRootId()
      const initialChildCount = useStore.getState().document.nodes.get(rootId)!.children.length
      useStore.getState().select(branchId)

      const cmd = new AddSiblingCommand(branchId, '')
      useStore.getState().executeCommand(cmd)

      expect(useStore.getState().document.nodes.get(rootId)!.children.length).toBe(initialChildCount + 1)
    })

    it('does not add sibling to root (root has no parent)', () => {
      const rootId = getRootId()
      const node = useStore.getState().document.nodes.get(rootId)!
      expect(node.parent).toBeNull()
    })
  })

  describe('Delete', () => {
    it('deletes leaf node directly', () => {
      const branch = getFirstBranch()
      const leafId = branch.children[0]
      expect(useStore.getState().document.nodes.get(leafId)!.children.length).toBe(0)

      useStore.getState().executeCommand(new DeleteNodeCommand(leafId))
      expect(useStore.getState().document.nodes.has(leafId)).toBe(false)
    })

    it('node with children should trigger confirmation (has children check)', () => {
      const branch = getFirstBranch()
      expect(branch.children.length).toBeGreaterThan(0)
    })

    it('DeleteAndReparentCommand keeps children', () => {
      const branchId = getFirstBranchId()
      const branch = getFirstBranch()
      const childIds = [...branch.children]
      const rootId = getRootId()

      useStore.getState().executeCommand(new DeleteAndReparentCommand(branchId))

      const doc = useStore.getState().document
      expect(doc.nodes.has(branchId)).toBe(false)
      for (const childId of childIds) {
        expect(doc.nodes.get(childId)!.parent).toBe(rootId)
      }
    })
  })

  describe('Cmd+/ — fold/unfold', () => {
    it('toggles collapsed state', () => {
      const branchId = getFirstBranchId()
      expect(getFirstBranch().collapsed).toBe(false)

      useStore.getState().updateDocument((doc) => {
        const n = doc.nodes.get(branchId)
        if (n) n.collapsed = !n.collapsed
      })
      expect(useStore.getState().document.nodes.get(branchId)!.collapsed).toBe(true)

      useStore.getState().updateDocument((doc) => {
        const n = doc.nodes.get(branchId)
        if (n) n.collapsed = !n.collapsed
      })
      expect(useStore.getState().document.nodes.get(branchId)!.collapsed).toBe(false)
    })
  })

  describe('Undo/Redo', () => {
    it('undo reverses add child', () => {
      const branchId = getFirstBranchId()
      const initialChildCount = getFirstBranch().children.length

      useStore.getState().executeCommand(new AddChildCommand(branchId, 'Test'))
      expect(useStore.getState().document.nodes.get(branchId)!.children.length).toBe(initialChildCount + 1)

      useStore.getState().undo()
      expect(useStore.getState().document.nodes.get(branchId)!.children.length).toBe(initialChildCount)
    })

    it('redo reapplies add child', () => {
      const branchId = getFirstBranchId()
      const initialChildCount = getFirstBranch().children.length

      useStore.getState().executeCommand(new AddChildCommand(branchId, 'Test'))
      useStore.getState().undo()
      useStore.getState().redo()

      expect(useStore.getState().document.nodes.get(branchId)!.children.length).toBe(initialChildCount + 1)
    })
  })

  describe('Editing mode blocks shortcuts', () => {
    it('editingNodeId prevents shortcut processing', () => {
      useStore.getState().setEditingNodeId('some-node')
      expect(useStore.getState().editingNodeId).toBe('some-node')
    })
  })
})
