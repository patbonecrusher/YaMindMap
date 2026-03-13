import type { StateCreator } from 'zustand'
import type { NodeId } from '../../shared/types/node'
import type { BoundaryId } from '../../shared/types/boundary'
import type { StoreState } from './index'

export interface SelectionSlice {
  selectedNodeIds: Set<NodeId>
  selectedBoundaryId: BoundaryId | null
  select: (id: NodeId) => void
  toggleSelect: (id: NodeId) => void
  selectMultiple: (ids: NodeId[]) => void
  clearSelection: () => void
  selectBoundary: (id: BoundaryId) => void
  singleSelectedNodeId: () => NodeId | null
}

export const createSelectionSlice: StateCreator<StoreState, [], [], SelectionSlice> = (set, get) => ({
  selectedNodeIds: new Set<NodeId>(),
  selectedBoundaryId: null,

  select: (id) =>
    set({ selectedNodeIds: new Set([id]), selectedBoundaryId: null }),

  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedNodeIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedNodeIds: next, selectedBoundaryId: null }
    }),

  selectMultiple: (ids) =>
    set({ selectedNodeIds: new Set(ids), selectedBoundaryId: null }),

  clearSelection: () =>
    set({ selectedNodeIds: new Set(), selectedBoundaryId: null }),

  selectBoundary: (id) =>
    set({ selectedNodeIds: new Set(), selectedBoundaryId: id }),

  singleSelectedNodeId: () => {
    const ids = get().selectedNodeIds
    if (ids.size === 1) return ids.values().next().value!
    return null
  }
})
