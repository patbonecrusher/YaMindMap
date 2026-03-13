import { useEffect, useCallback, useRef } from 'react'
import { useStore } from '../store'
import { parseYaMindFile, serializeYaMindFile } from '../../shared/file-format'
import { createDemoDocument } from '../../shared/demo-document'
import { CommandHistory } from '../../shared/commands/history'

export function useFileOperations() {
  const prevDirty = useRef<boolean>(false)

  // Sync dirty state to main process
  const dirty = useStore((s) => s.dirty)
  useEffect(() => {
    if (dirty !== prevDirty.current) {
      prevDirty.current = dirty
      window.api.setDirty(dirty)
    }
  }, [dirty])

  const handleOpen = useCallback(async () => {
    const result = await window.api.fileOpen()
    if (!result) return

    try {
      const doc = parseYaMindFile(result.content)
      useStore.setState({
        document: doc,
        filePath: result.filePath,
        dirty: false,
        history: new CommandHistory(),
        selectedNodeIds: new Set(),
        selectedBoundaryId: null,
        editingNodeId: null,
        isNewNode: false
      })
    } catch (err) {
      console.error('Failed to parse file:', err)
    }
  }, [])

  const handleSave = useCallback(async () => {
    const state = useStore.getState()
    const content = serializeYaMindFile(state.document)
    const success = await window.api.fileSave(content)
    if (success) {
      useStore.setState({ dirty: false })
    }
  }, [])

  const handleSaveAs = useCallback(async () => {
    const state = useStore.getState()
    const content = serializeYaMindFile(state.document)
    const success = await window.api.fileSaveAs(content)
    if (success) {
      useStore.setState({ dirty: false })
    }
  }, [])

  const handleUndo = useCallback(() => {
    useStore.getState().undo()
  }, [])

  const handleRedo = useCallback(() => {
    useStore.getState().redo()
  }, [])

  const handleOpenFilePath = useCallback(async (filePath: string) => {
    try {
      const result = await window.api.fileOpen()
      if (!result) return
      const doc = parseYaMindFile(result.content)
      useStore.setState({
        document: doc,
        filePath: result.filePath,
        dirty: false,
        history: new CommandHistory(),
        selectedNodeIds: new Set(),
        selectedBoundaryId: null
      })
    } catch (err) {
      console.error('Failed to open file:', err)
    }
  }, [])

  // Listen for menu events from main process
  useEffect(() => {
    const cleanups = [
      window.api.onMenuOpen(handleOpen),
      window.api.onMenuSave(handleSave),
      window.api.onMenuSaveAs(handleSaveAs),
      window.api.onMenuUndo(handleUndo),
      window.api.onMenuRedo(handleRedo),
      window.api.onOpenFile(handleOpenFilePath)
    ]
    return () => cleanups.forEach((fn) => fn())
  }, [handleOpen, handleSave, handleSaveAs, handleUndo, handleRedo, handleOpenFilePath])
}
