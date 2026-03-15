import { useCallback, useRef } from 'react'
import type { NodeMouseHandler } from '@xyflow/react'
import { useStore } from '../store'

// Shared flag to suppress pane click after rubber-band selection
let suppressNextPaneClick = false
export function setSuppressPaneClick(): void {
  suppressNextPaneClick = true
}

export function useNodeInteraction() {
  const select = useStore((s) => s.select)
  const toggleSelect = useStore((s) => s.toggleSelect)
  const clearSelection = useStore((s) => s.clearSelection)
  const selectedNodeIds = useStore((s) => s.selectedNodeIds)
  const startEditing = useStore((s) => s.startEditing)
  const openContextMenu = useStore((s) => s.openContextMenu)
  const closeContextMenu = useStore((s) => s.closeContextMenu)

  const onNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      closeContextMenu()
      if (event.shiftKey) {
        toggleSelect(node.id)
      } else if (selectedNodeIds.has(node.id)) {
        // Already selected — keep multi-selection for drag/resize
      } else {
        select(node.id)
      }
    },
    [select, toggleSelect, selectedNodeIds, closeContextMenu]
  )

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      select(node.id)
      startEditing(node.id, false)
    },
    [select, startEditing]
  )

  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault()
      select(node.id)
      openContextMenu(event.clientX, event.clientY, node.id)
    },
    [select, openContextMenu]
  )

  const onPaneClick = useCallback(() => {
    if (suppressNextPaneClick) {
      suppressNextPaneClick = false
      return
    }
    clearSelection()
    closeContextMenu()
  }, [clearSelection, closeContextMenu])

  return { onNodeClick, onNodeDoubleClick, onNodeContextMenu, onPaneClick }
}
