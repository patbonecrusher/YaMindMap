import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './index'
import { AddChildCommand } from '../../shared/commands/node-commands'
import { createDemoDocument } from '../../shared/demo-document'
import { CommandHistory } from '../../shared/commands/history'

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
    dropTargetNodeId: null,
    draggingNodeId: null,
    dragPosition: null,
    history: new CommandHistory()
  })
}

describe('SelectionSlice', () => {
  beforeEach(resetStore)

  it('select sets single node', () => {
    useStore.getState().select('a')
    expect(useStore.getState().selectedNodeIds).toEqual(new Set(['a']))
  })

  it('select replaces previous selection', () => {
    useStore.getState().select('a')
    useStore.getState().select('b')
    expect(useStore.getState().selectedNodeIds).toEqual(new Set(['b']))
  })

  it('toggleSelect adds to selection', () => {
    useStore.getState().select('a')
    useStore.getState().toggleSelect('b')
    expect(useStore.getState().selectedNodeIds).toEqual(new Set(['a', 'b']))
  })

  it('toggleSelect removes if already selected', () => {
    useStore.getState().select('a')
    useStore.getState().toggleSelect('a')
    expect(useStore.getState().selectedNodeIds.size).toBe(0)
  })

  it('clearSelection empties set', () => {
    useStore.getState().select('a')
    useStore.getState().toggleSelect('b')
    useStore.getState().clearSelection()
    expect(useStore.getState().selectedNodeIds.size).toBe(0)
  })

  it('selectMultiple sets exact set', () => {
    useStore.getState().selectMultiple(['a', 'b', 'c'])
    expect(useStore.getState().selectedNodeIds).toEqual(new Set(['a', 'b', 'c']))
  })

  it('select clears boundary selection', () => {
    useStore.getState().selectBoundary('b1')
    expect(useStore.getState().selectedBoundaryId).toBe('b1')
    useStore.getState().select('a')
    expect(useStore.getState().selectedBoundaryId).toBeNull()
  })

  it('singleSelectedNodeId returns id when one selected', () => {
    useStore.getState().select('a')
    expect(useStore.getState().singleSelectedNodeId()).toBe('a')
  })

  it('singleSelectedNodeId returns null when none or multiple selected', () => {
    expect(useStore.getState().singleSelectedNodeId()).toBeNull()
    useStore.getState().selectMultiple(['a', 'b'])
    expect(useStore.getState().singleSelectedNodeId()).toBeNull()
  })
})

describe('HistorySlice', () => {
  beforeEach(resetStore)

  it('executeCommand modifies document', () => {
    const state = useStore.getState()
    const rootId = state.document.root_id
    const cmd = new AddChildCommand(rootId, 'New Child')
    state.executeCommand(cmd)

    const doc = useStore.getState().document
    const root = doc.nodes.get(rootId)!
    expect(root.children.length).toBeGreaterThan(
      3 // demo document has 3 branches under root
    )
  })

  it('undo reverses last command', () => {
    const state = useStore.getState()
    const rootId = state.document.root_id
    const initialChildCount = state.document.nodes.get(rootId)!.children.length

    state.executeCommand(new AddChildCommand(rootId, 'New Child'))
    expect(useStore.getState().document.nodes.get(rootId)!.children.length).toBe(initialChildCount + 1)

    useStore.getState().undo()
    expect(useStore.getState().document.nodes.get(rootId)!.children.length).toBe(initialChildCount)
  })

  it('redo reapplies undone command', () => {
    const state = useStore.getState()
    const rootId = state.document.root_id
    const initialChildCount = state.document.nodes.get(rootId)!.children.length

    state.executeCommand(new AddChildCommand(rootId, 'New Child'))
    useStore.getState().undo()
    useStore.getState().redo()
    expect(useStore.getState().document.nodes.get(rootId)!.children.length).toBe(initialChildCount + 1)
  })

  it('executeCommand sets dirty flag', () => {
    expect(useStore.getState().dirty).toBe(false)
    const rootId = useStore.getState().document.root_id
    useStore.getState().executeCommand(new AddChildCommand(rootId, 'test'))
    expect(useStore.getState().dirty).toBe(true)
  })

  it('canUndo and canRedo reflect state', () => {
    expect(useStore.getState().canUndo()).toBe(false)
    expect(useStore.getState().canRedo()).toBe(false)

    const rootId = useStore.getState().document.root_id
    useStore.getState().executeCommand(new AddChildCommand(rootId, 'test'))
    expect(useStore.getState().canUndo()).toBe(true)
    expect(useStore.getState().canRedo()).toBe(false)

    useStore.getState().undo()
    expect(useStore.getState().canUndo()).toBe(false)
    expect(useStore.getState().canRedo()).toBe(true)
  })
})

describe('UiSlice', () => {
  beforeEach(resetStore)

  it('setEditingNodeId tracks editing state', () => {
    useStore.getState().setEditingNodeId('node-1')
    expect(useStore.getState().editingNodeId).toBe('node-1')
    useStore.getState().setEditingNodeId(null)
    expect(useStore.getState().editingNodeId).toBeNull()
  })

  it('context menu open/close', () => {
    useStore.getState().openContextMenu(100, 200, 'node-1')
    expect(useStore.getState().contextMenuPosition).toEqual({ x: 100, y: 200 })
    expect(useStore.getState().contextMenuTargetId).toBe('node-1')

    useStore.getState().closeContextMenu()
    expect(useStore.getState().contextMenuPosition).toBeNull()
    expect(useStore.getState().contextMenuTargetId).toBeNull()
  })

  it('toggleStylePanel flips state', () => {
    expect(useStore.getState().stylePanelOpen).toBe(false)
    useStore.getState().toggleStylePanel()
    expect(useStore.getState().stylePanelOpen).toBe(true)
    useStore.getState().toggleStylePanel()
    expect(useStore.getState().stylePanelOpen).toBe(false)
  })
})

describe('DocumentSlice', () => {
  beforeEach(resetStore)

  it('initial document is demo document', () => {
    const doc = useStore.getState().document
    expect(doc.root_id).toBeTruthy()
    expect(doc.nodes.size).toBeGreaterThan(0)
  })

  it('updateDocument applies mutation and sets dirty', () => {
    const rootId = useStore.getState().document.root_id
    useStore.getState().updateDocument((doc) => {
      const root = doc.nodes.get(rootId)!
      root.content.text = 'Updated Root'
    })
    expect(useStore.getState().document.nodes.get(rootId)!.content.text).toBe('Updated Root')
    expect(useStore.getState().dirty).toBe(true)
  })

  it('setDocument resets dirty flag', () => {
    useStore.getState().setDirty(true)
    const doc = useStore.getState().document
    useStore.getState().setDocument(doc)
    expect(useStore.getState().dirty).toBe(false)
  })
})
