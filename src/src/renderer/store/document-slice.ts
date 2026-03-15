import type { StateCreator } from 'zustand'
import type { Document } from '../../shared/types/document'
import type { NodeId } from '../../shared/types/node'
import { createDemoDocument } from '../../shared/demo-document'
import type { StoreState } from './index'

export interface DocumentSlice {
  document: Document
  filePath: string | null
  dirty: boolean
  setDocument: (doc: Document) => void
  setFilePath: (path: string | null) => void
  setDirty: (dirty: boolean) => void
  updateDocument: (updater: (doc: Document) => void) => void
}

export const createDocumentSlice: StateCreator<StoreState, [], [], DocumentSlice> = (set) => ({
  document: createDemoDocument(),
  filePath: null,
  dirty: false,
  setDocument: (doc) => set({ document: doc, dirty: false }),
  setFilePath: (path) => set({ filePath: path }),
  setDirty: (dirty) => set({ dirty }),
  updateDocument: (updater) =>
    set((state) => {
      // Shallow clone the document so React detects changes
      const doc = { ...state.document, nodes: new Map(state.document.nodes), boundaries: new Map(state.document.boundaries) }
      updater(doc)
      return { document: doc, dirty: true }
    })
})
