import type { StateCreator } from 'zustand'
import type { NodeId } from '../../shared/types/node'
import type { StoreState } from './index'

export interface UiSlice {
  editingNodeId: NodeId | null
  isNewNode: boolean
  contextMenuPosition: { x: number; y: number } | null
  contextMenuTargetId: NodeId | null
  stylePanelOpen: boolean
  setEditingNodeId: (id: NodeId | null) => void
  setIsNewNode: (isNew: boolean) => void
  startEditing: (id: NodeId, isNew: boolean) => void
  openContextMenu: (x: number, y: number, targetId: NodeId | null) => void
  closeContextMenu: () => void
  toggleStylePanel: () => void
}

export const createUiSlice: StateCreator<StoreState, [], [], UiSlice> = (set) => ({
  editingNodeId: null,
  isNewNode: false,
  contextMenuPosition: null,
  contextMenuTargetId: null,
  stylePanelOpen: false,

  setEditingNodeId: (id) => set({ editingNodeId: id }),
  setIsNewNode: (isNew) => set({ isNewNode: isNew }),
  startEditing: (id, isNew) => set({ editingNodeId: id, isNewNode: isNew }),

  openContextMenu: (x, y, targetId) =>
    set({ contextMenuPosition: { x, y }, contextMenuTargetId: targetId }),

  closeContextMenu: () =>
    set({ contextMenuPosition: null, contextMenuTargetId: null }),

  toggleStylePanel: () =>
    set((state) => ({ stylePanelOpen: !state.stylePanelOpen }))
})
