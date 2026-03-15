import { create } from 'zustand'
import { createDocumentSlice, type DocumentSlice } from './document-slice'
import { createSelectionSlice, type SelectionSlice } from './selection-slice'
import { createHistorySlice, type HistorySlice } from './history-slice'
import { createUiSlice, type UiSlice } from './ui-slice'

export type StoreState = DocumentSlice & SelectionSlice & HistorySlice & UiSlice

export const useStore = create<StoreState>()((...a) => ({
  ...createDocumentSlice(...a),
  ...createSelectionSlice(...a),
  ...createHistorySlice(...a),
  ...createUiSlice(...a)
}))
