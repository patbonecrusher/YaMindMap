import { useEffect, useCallback, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useStore } from '../store'
import { parseYaMindFile, serializeYaMindFile } from '../../shared/file-format'
import { CommandHistory } from '../../shared/commands/history'
import { FORMAT_VERSION } from '../../shared/types/file'
import type { ViewState } from '../../shared/types/file'

function applyOpenState(content: string, filePath: string): void {
  const parsed = parseYaMindFile(content)
  useStore.setState({
    document: parsed.document,
    filePath,
    dirty: false,
    history: new CommandHistory(),
    selectedNodeIds: new Set(),
    selectedBoundaryId: null,
    editingNodeId: null,
    isNewNode: false,
    pendingViewState: parsed.view_state ?? null
  })

  // Apply window size/position if available
  if (parsed.view_state) {
    const vs = parsed.view_state
    if (vs.window_size) {
      const bounds: { width: number; height: number; x?: number; y?: number } = {
        width: vs.window_size[0],
        height: vs.window_size[1]
      }
      if (vs.window_position) {
        bounds.x = vs.window_position[0]
        bounds.y = vs.window_position[1]
      }
      window.api.setWindowBounds(bounds)
    }
  }
}

export function useFileOperations() {
  const prevDirty = useRef<boolean>(false)
  const { getViewport } = useReactFlow()

  // Sync dirty state to main process
  const dirty = useStore((s) => s.dirty)
  useEffect(() => {
    if (dirty !== prevDirty.current) {
      prevDirty.current = dirty
      window.api.setDirty(dirty)
    }
  }, [dirty])

  const buildViewState = useCallback(async (): Promise<ViewState> => {
    const bounds = await window.api.getWindowBounds()
    const viewport = getViewport()
    return {
      translation: [viewport.x, viewport.y],
      scale: viewport.zoom,
      window_size: bounds ? [bounds.width, bounds.height] : [1200, 800],
      window_position: bounds ? [bounds.x, bounds.y] : undefined
    }
  }, [getViewport])

  const handleOpen = useCallback(async () => {
    // Open is now handled by main process — it creates a new window
    await window.api.fileOpen()
  }, [])

  const handleSave = useCallback(async () => {
    const state = useStore.getState()
    const viewState = await buildViewState()
    const content = serializeYaMindFile({
      version: FORMAT_VERSION,
      document: state.document,
      view_state: viewState
    })
    const success = await window.api.fileSave(content)
    if (success) {
      useStore.setState({ dirty: false })
    }
  }, [buildViewState])

  const handleSaveAs = useCallback(async () => {
    const state = useStore.getState()
    const viewState = await buildViewState()
    const content = serializeYaMindFile({
      version: FORMAT_VERSION,
      document: state.document,
      view_state: viewState
    })
    const success = await window.api.fileSaveAs(content)
    if (success) {
      useStore.setState({ dirty: false })
    }
  }, [buildViewState])

  const handleUndo = useCallback(() => {
    useStore.getState().undo()
  }, [])

  const handleRedo = useCallback(() => {
    useStore.getState().redo()
  }, [])

  const handleOpenFilePath = useCallback((data: { filePath: string; content: string }) => {
    try {
      applyOpenState(data.content, data.filePath)
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
