import type { StateCreator } from 'zustand'
import type { NodeId } from '../../shared/types/node'
import type { ViewState } from '../../shared/types/file'
import type { StoreState } from './index'

export interface UiSlice {
  editingNodeId: NodeId | null
  isNewNode: boolean
  contextMenuPosition: { x: number; y: number } | null
  contextMenuTargetId: NodeId | null
  stylePanelOpen: boolean
  dropTargetNodeId: NodeId | null
  draggingNodeId: NodeId | null
  dragPosition: { x: number; y: number } | null
  pendingViewState: ViewState | null
  rubberBandStart: { x: number; y: number } | null
  rubberBandCurrent: { x: number; y: number } | null
  setEditingNodeId: (id: NodeId | null) => void
  setIsNewNode: (isNew: boolean) => void
  startEditing: (id: NodeId, isNew: boolean) => void
  openContextMenu: (x: number, y: number, targetId: NodeId | null) => void
  closeContextMenu: () => void
  toggleStylePanel: () => void
  setStylePanelOpen: (open: boolean) => void
  setDropTarget: (nodeId: NodeId | null) => void
  setDraggingNode: (nodeId: NodeId | null) => void
  setDragPosition: (pos: { x: number; y: number } | null) => void
  setPendingViewState: (vs: ViewState | null) => void
  setRubberBandStart: (pos: { x: number; y: number } | null) => void
  setRubberBandCurrent: (pos: { x: number; y: number } | null) => void
}

export const createUiSlice: StateCreator<StoreState, [], [], UiSlice> = (set) => ({
  editingNodeId: null,
  isNewNode: false,
  contextMenuPosition: null,
  contextMenuTargetId: null,
  stylePanelOpen: false,
  dropTargetNodeId: null,
  draggingNodeId: null,
  dragPosition: null,
  pendingViewState: null,
  rubberBandStart: null,
  rubberBandCurrent: null,

  setEditingNodeId: (id) => set({ editingNodeId: id }),
  setIsNewNode: (isNew) => set({ isNewNode: isNew }),
  startEditing: (id, isNew) => set({ editingNodeId: id, isNewNode: isNew }),

  openContextMenu: (x, y, targetId) =>
    set({ contextMenuPosition: { x, y }, contextMenuTargetId: targetId }),

  closeContextMenu: () =>
    set({ contextMenuPosition: null, contextMenuTargetId: null }),

  toggleStylePanel: () =>
    set((state) => ({ stylePanelOpen: !state.stylePanelOpen })),

  setStylePanelOpen: (open) => set({ stylePanelOpen: open }),

  setDropTarget: (nodeId) => set({ dropTargetNodeId: nodeId }),
  setDraggingNode: (nodeId) => set({ draggingNodeId: nodeId }),
  setDragPosition: (pos) => set({ dragPosition: pos }),
  setPendingViewState: (vs) => set({ pendingViewState: vs }),
  setRubberBandStart: (pos) => set({ rubberBandStart: pos }),
  setRubberBandCurrent: (pos) => set({ rubberBandCurrent: pos })
})
