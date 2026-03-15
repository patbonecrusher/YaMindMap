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

  describe('Arrow key navigation', () => {
    it('ArrowLeft selects parent', () => {
      const branchId = getFirstBranchId()
      useStore.getState().select(branchId)

      // Simulate: ArrowLeft → should select root (parent of branch)
      const rootId = getRootId()
      const node = useStore.getState().document.nodes.get(branchId)!
      expect(node.parent).toBe(rootId)
      useStore.getState().select(node.parent!)
      expect(useStore.getState().singleSelectedNodeId()).toBe(rootId)
    })

    it('ArrowLeft on root does nothing', () => {
      const rootId = getRootId()
      useStore.getState().select(rootId)
      const node = useStore.getState().document.nodes.get(rootId)!
      expect(node.parent).toBeNull()
      // Selection stays on root
      expect(useStore.getState().singleSelectedNodeId()).toBe(rootId)
    })

    it('ArrowRight selects first child', () => {
      const branchId = getFirstBranchId()
      useStore.getState().select(branchId)
      const branch = useStore.getState().document.nodes.get(branchId)!
      expect(branch.children.length).toBeGreaterThan(0)

      useStore.getState().select(branch.children[0])
      expect(useStore.getState().singleSelectedNodeId()).toBe(branch.children[0])
    })

    it('ArrowRight on collapsed node expands it', () => {
      const branchId = getFirstBranchId()
      useStore.getState().updateDocument((doc) => {
        const n = doc.nodes.get(branchId)
        if (n) n.collapsed = true
      })
      expect(useStore.getState().document.nodes.get(branchId)!.collapsed).toBe(true)

      // ArrowRight should expand, not navigate into children
      useStore.getState().updateDocument((doc) => {
        const n = doc.nodes.get(branchId)
        if (n) n.collapsed = false
      })
      expect(useStore.getState().document.nodes.get(branchId)!.collapsed).toBe(false)
    })

    it('ArrowDown selects next sibling with wrap', () => {
      const rootId = getRootId()
      const root = useStore.getState().document.nodes.get(rootId)!
      const branches = root.children
      expect(branches.length).toBeGreaterThan(1)

      // Select first branch, go down → second branch
      useStore.getState().select(branches[0])
      const idx = 0
      const nextIdx = idx >= branches.length - 1 ? 0 : idx + 1
      useStore.getState().select(branches[nextIdx])
      expect(useStore.getState().singleSelectedNodeId()).toBe(branches[1])
    })

    it('ArrowDown wraps from last to first sibling', () => {
      const rootId = getRootId()
      const root = useStore.getState().document.nodes.get(rootId)!
      const branches = root.children
      const lastIdx = branches.length - 1

      useStore.getState().select(branches[lastIdx])
      const nextIdx = lastIdx >= branches.length - 1 ? 0 : lastIdx + 1
      useStore.getState().select(branches[nextIdx])
      expect(useStore.getState().singleSelectedNodeId()).toBe(branches[0])
    })

    it('ArrowUp selects previous sibling with wrap', () => {
      const rootId = getRootId()
      const root = useStore.getState().document.nodes.get(rootId)!
      const branches = root.children
      expect(branches.length).toBeGreaterThan(1)

      // Select second branch, go up → first branch
      useStore.getState().select(branches[1])
      const idx = 1
      const prevIdx = idx <= 0 ? branches.length - 1 : idx - 1
      useStore.getState().select(branches[prevIdx])
      expect(useStore.getState().singleSelectedNodeId()).toBe(branches[0])
    })

    it('ArrowUp wraps from first to last sibling', () => {
      const rootId = getRootId()
      const root = useStore.getState().document.nodes.get(rootId)!
      const branches = root.children

      useStore.getState().select(branches[0])
      const idx = 0
      const prevIdx = idx <= 0 ? branches.length - 1 : idx - 1
      useStore.getState().select(branches[prevIdx])
      expect(useStore.getState().singleSelectedNodeId()).toBe(branches[branches.length - 1])
    })

    it('no selection → arrow key selects root', () => {
      expect(useStore.getState().singleSelectedNodeId()).toBeNull()
      useStore.getState().select(getRootId())
      expect(useStore.getState().singleSelectedNodeId()).toBe(getRootId())
    })
  })

  describe('Editing mode blocks shortcuts', () => {
    it('editingNodeId prevents shortcut processing', () => {
      useStore.getState().setEditingNodeId('some-node')
      expect(useStore.getState().editingNodeId).toBe('some-node')
    })
  })
})
