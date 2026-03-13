import type { StateCreator } from 'zustand'
import type { Command } from '../../shared/commands/command'
import { CommandHistory } from '../../shared/commands/history'
import type { StoreState } from './index'

export interface HistorySlice {
  history: CommandHistory
  executeCommand: (cmd: Command) => void
  undo: () => void
  redo: () => void
  updateLastText: (text: string) => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export const createHistorySlice: StateCreator<StoreState, [], [], HistorySlice> = (set, get) => ({
  history: new CommandHistory(),

  executeCommand: (cmd) => {
    const state = get()
    const doc = { ...state.document, nodes: new Map(state.document.nodes), boundaries: new Map(state.document.boundaries) }
    state.history.execute(cmd, doc)
    set({ document: doc, dirty: true })
  },

  undo: () => {
    const state = get()
    const doc = { ...state.document, nodes: new Map(state.document.nodes), boundaries: new Map(state.document.boundaries) }
    if (state.history.undo(doc)) {
      set({ document: doc, dirty: true })
    }
  },

  redo: () => {
    const state = get()
    const doc = { ...state.document, nodes: new Map(state.document.nodes), boundaries: new Map(state.document.boundaries) }
    if (state.history.redo(doc)) {
      set({ document: doc, dirty: true })
    }
  },

  updateLastText: (text) => {
    get().history.updateLastText(text)
  },

  canUndo: () => get().history.canUndo,
  canRedo: () => get().history.canRedo
})
