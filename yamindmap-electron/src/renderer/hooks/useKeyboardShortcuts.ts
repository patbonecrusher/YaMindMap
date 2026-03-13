import { useEffect, useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useStore } from '../store'
import { AddChildCommand, AddSiblingCommand, DeleteNodeCommand, DeleteAndReparentCommand } from '../../shared/commands/node-commands'
import { ZOOM_IN_FACTOR, ZOOM_OUT_FACTOR } from '../../shared/constants'

export interface DeleteDialogState {
  nodeId: string
  hasChildren: boolean
}

interface KeyboardShortcutsOptions {
  onDeleteConfirm: (state: DeleteDialogState) => void
}

export function useKeyboardShortcuts({ onDeleteConfirm }: KeyboardShortcutsOptions) {
  const singleSelectedNodeId = useStore((s) => s.singleSelectedNodeId)
  const document = useStore((s) => s.document)
  const executeCommand = useStore((s) => s.executeCommand)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const select = useStore((s) => s.select)
  const startEditing = useStore((s) => s.startEditing)
  const editingNodeId = useStore((s) => s.editingNodeId)
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't handle shortcuts when editing text
      if (editingNodeId) return

      const meta = e.metaKey || e.ctrlKey
      const shift = e.shiftKey
      const selectedId = singleSelectedNodeId()

      // Cmd+Z — undo
      if (meta && !shift && e.key === 'z') {
        e.preventDefault()
        undo()
        return
      }

      // Cmd+Shift+Z — redo
      if (meta && shift && e.key === 'z') {
        e.preventDefault()
        redo()
        return
      }

      // Cmd+= — zoom in
      if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomIn({ duration: 200 })
        return
      }

      // Cmd+- — zoom out
      if (meta && e.key === '-') {
        e.preventDefault()
        zoomOut({ duration: 200 })
        return
      }

      // Cmd+0 — zoom to fit
      if (meta && e.key === '0') {
        e.preventDefault()
        fitView({ padding: 0.2, duration: 200 })
        return
      }

      // Everything below requires a selected node
      if (!selectedId) return

      // Tab — add child
      if (e.key === 'Tab' && !meta && !shift) {
        e.preventDefault()
        const cmd = new AddChildCommand(selectedId, '')
        executeCommand(cmd)
        if (cmd.createdNodeId) {
          select(cmd.createdNodeId)
          startEditing(cmd.createdNodeId, true)
        }
        return
      }

      // Enter — add sibling
      if (e.key === 'Enter' && !meta && !shift) {
        e.preventDefault()
        const node = document.nodes.get(selectedId)
        // Can't add sibling to root
        if (!node || node.parent === null) return
        const cmd = new AddSiblingCommand(selectedId, '')
        executeCommand(cmd)
        if (cmd.createdNodeId) {
          select(cmd.createdNodeId)
          startEditing(cmd.createdNodeId, true)
        }
        return
      }

      // Delete/Backspace — delete node
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const node = document.nodes.get(selectedId)
        // Can't delete root
        if (!node || node.parent === null) return

        if (node.children.length > 0) {
          onDeleteConfirm({ nodeId: selectedId, hasChildren: true })
        } else {
          executeCommand(new DeleteNodeCommand(selectedId))
        }
        return
      }

      // Cmd+/ — toggle fold
      if (meta && e.key === '/') {
        e.preventDefault()
        const node = document.nodes.get(selectedId)
        if (!node || node.children.length === 0) return
        // Toggle collapsed directly via updateDocument
        useStore.getState().updateDocument((doc) => {
          const n = doc.nodes.get(selectedId)
          if (n) n.collapsed = !n.collapsed
        })
        return
      }
    },
    [editingNodeId, singleSelectedNodeId, document, executeCommand, undo, redo, select, startEditing, fitView, zoomIn, zoomOut, onDeleteConfirm]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
