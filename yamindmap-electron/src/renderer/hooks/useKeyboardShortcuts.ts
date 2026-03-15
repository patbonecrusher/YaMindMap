import { useEffect, useCallback, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useStore } from '../store'
import { AddChildCommand, AddSiblingCommand, DeleteNodeCommand } from '../../shared/commands/node-commands'
import { AddBoundaryCommand, DeleteBoundaryCommand } from '../../shared/commands/boundary-commands'
import { collectDescendants } from '../../shared/document-ops'
import type { ShortcutBinding, ShortcutAction } from '../../shared/shortcuts'
import { DEFAULT_SHORTCUTS, eventMatchesBinding } from '../../shared/shortcuts'

export interface DeleteDialogState {
  nodeId: string
  hasChildren: boolean
}

interface KeyboardShortcutsOptions {
  onDeleteConfirm: (state: DeleteDialogState) => void
  onInsertUrl: (nodeId: string) => void
  onAttachDocument: (nodeId: string) => void
  onAttachPhoto: (nodeId: string) => void
}

export function useKeyboardShortcuts({ onDeleteConfirm, onInsertUrl, onAttachDocument, onAttachPhoto }: KeyboardShortcutsOptions) {
  const singleSelectedNodeId = useStore((s) => s.singleSelectedNodeId)
  const selectedNodeIds = useStore((s) => s.selectedNodeIds)
  const selectedBoundaryId = useStore((s) => s.selectedBoundaryId)
  const document = useStore((s) => s.document)
  const executeCommand = useStore((s) => s.executeCommand)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const select = useStore((s) => s.select)
  const clearSelection = useStore((s) => s.clearSelection)
  const startEditing = useStore((s) => s.startEditing)
  const editingNodeId = useStore((s) => s.editingNodeId)
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  const shortcutsRef = useRef<ShortcutBinding[]>(DEFAULT_SHORTCUTS)

  // Load shortcuts from settings on mount and listen for changes
  useEffect(() => {
    window.api.getSettings().then((settings) => {
      if (settings.shortcuts && Array.isArray(settings.shortcuts) && settings.shortcuts.length > 0) {
        shortcutsRef.current = settings.shortcuts as ShortcutBinding[]
      }
    })

    const unsubscribe = window.api.onSettingsChanged((settings) => {
      if (settings.shortcuts && Array.isArray(settings.shortcuts) && settings.shortcuts.length > 0) {
        shortcutsRef.current = settings.shortcuts as ShortcutBinding[]
      }
    })

    return unsubscribe
  }, [])

  const findAction = useCallback((e: KeyboardEvent): ShortcutAction | null => {
    for (const binding of shortcutsRef.current) {
      if (eventMatchesBinding(e, binding)) return binding.action
    }
    return null
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't handle shortcuts when editing text or when focus is in an input/dialog
      if (editingNodeId) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      const meta = e.metaKey || e.ctrlKey
      const shift = e.shiftKey
      const selectedId = singleSelectedNodeId()

      // Arrow keys — navigate between nodes (not customizable)
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !meta && !shift) {
        e.preventDefault()

        // No selection → select root
        if (!selectedId) {
          select(document.root_id)
          return
        }

        const node = document.nodes.get(selectedId)
        if (!node) return

        switch (e.key) {
          case 'ArrowLeft': {
            if (node.parent !== null) {
              select(node.parent)
            }
            break
          }
          case 'ArrowRight': {
            if (node.children.length === 0) break
            if (node.collapsed) {
              useStore.getState().updateDocument((doc) => {
                const n = doc.nodes.get(selectedId)
                if (n) n.collapsed = false
              })
            } else {
              select(node.children[0])
            }
            break
          }
          case 'ArrowUp': {
            if (node.parent === null) break
            const parent = document.nodes.get(node.parent)
            if (!parent) break
            const idx = parent.children.indexOf(selectedId)
            const prevIdx = idx <= 0 ? parent.children.length - 1 : idx - 1
            select(parent.children[prevIdx])
            break
          }
          case 'ArrowDown': {
            if (node.parent === null) break
            const par = document.nodes.get(node.parent)
            if (!par) break
            const i = par.children.indexOf(selectedId)
            const nextIdx = i >= par.children.length - 1 ? 0 : i + 1
            select(par.children[nextIdx])
            break
          }
        }
        return
      }

      // Match against customizable shortcuts
      const action = findAction(e)
      if (!action) return

      e.preventDefault()

      switch (action) {
        case 'undo':
          undo()
          return
        case 'redo':
          redo()
          return
        case 'zoomIn':
          zoomIn({ duration: 200 })
          return
        case 'zoomOut':
          zoomOut({ duration: 200 })
          return
        case 'zoomFit':
          fitView({ padding: 0.2, duration: 200 })
          return
        case 'toggleStylePanel':
          useStore.getState().toggleStylePanel()
          return
        case 'createBoundary': {
          if (selectedNodeIds.size > 0) {
            const alreadyInBoundary = Array.from(document.boundaries.values()).some((b) =>
              b.node_ids.some((nid) => selectedNodeIds.has(nid))
            )
            if (alreadyInBoundary) return
            const allNodeIds = new Set<string>()
            for (const id of selectedNodeIds) {
              for (const desc of collectDescendants(document, id)) {
                allNodeIds.add(desc)
              }
            }
            executeCommand(new AddBoundaryCommand(Array.from(allNodeIds), 'Group'))
          }
          return
        }
        case 'deleteNode': {
          // Delete boundary if one is selected
          if (selectedBoundaryId) {
            executeCommand(new DeleteBoundaryCommand(selectedBoundaryId))
            clearSelection()
            return
          }
          if (!selectedId) return
          const node = document.nodes.get(selectedId)
          if (!node || node.parent === null) return
          if (node.children.length > 0) {
            onDeleteConfirm({ nodeId: selectedId, hasChildren: true })
          } else {
            executeCommand(new DeleteNodeCommand(selectedId))
          }
          return
        }
      }

      // Everything below requires a selected node
      if (!selectedId) return

      switch (action) {
        case 'editNode':
          startEditing(selectedId, false)
          return
        case 'addChild': {
          const cmd = new AddChildCommand(selectedId, '')
          executeCommand(cmd)
          if (cmd.createdNodeId) {
            select(cmd.createdNodeId)
            startEditing(cmd.createdNodeId, true)
          }
          return
        }
        case 'addSibling': {
          const node = document.nodes.get(selectedId)
          if (!node || node.parent === null) return
          const cmd = new AddSiblingCommand(selectedId, '')
          executeCommand(cmd)
          if (cmd.createdNodeId) {
            select(cmd.createdNodeId)
            startEditing(cmd.createdNodeId, true)
          }
          return
        }
        case 'insertUrl':
          onInsertUrl(selectedId)
          return
        case 'attachDocument':
          onAttachDocument(selectedId)
          return
        case 'attachPhoto':
          onAttachPhoto(selectedId)
          return
        case 'toggleFold': {
          const node = document.nodes.get(selectedId)
          if (!node || node.children.length === 0) return
          useStore.getState().updateDocument((doc) => {
            const n = doc.nodes.get(selectedId)
            if (n) n.collapsed = !n.collapsed
          })
          return
        }
      }
    },
    [editingNodeId, singleSelectedNodeId, selectedNodeIds, selectedBoundaryId, document, executeCommand, undo, redo, select, clearSelection, startEditing, fitView, zoomIn, zoomOut, onDeleteConfirm, onInsertUrl, onAttachDocument, onAttachPhoto, findAction]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
