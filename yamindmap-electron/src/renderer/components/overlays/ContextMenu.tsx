import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import {
  AddChildCommand,
  AddSiblingCommand,
  DeleteNodeCommand
} from '../../../shared/commands/node-commands'
import { AddBoundaryCommand } from '../../../shared/commands/boundary-commands'
import { collectDescendants } from '../../../shared/document-ops'
import { CONTEXT_MENU_EDGE_PADDING } from '../../../shared/constants'

interface ContextMenuProps {
  x: number
  y: number
  targetId: string | null
  onClose: () => void
  onStartEdit: (nodeId: string, isNew: boolean) => void
  onDeleteConfirm: (nodeId: string) => void
  onInsertUrl: (nodeId: string) => void
  onAttachDocument: (nodeId: string) => void
  onAttachPhoto: (nodeId: string) => void
}

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  backgroundColor: '#2c2c2e',
  borderRadius: 8,
  padding: '4px 0',
  minWidth: 180,
  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  zIndex: 1000,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 13,
  color: '#fff'
}

const itemStyle: React.CSSProperties = {
  padding: '6px 16px',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
}

const separatorStyle: React.CSSProperties = {
  height: 1,
  backgroundColor: '#444',
  margin: '4px 0'
}

const shortcutStyle: React.CSSProperties = {
  color: '#888',
  fontSize: 11,
  marginLeft: 24
}

function MenuItem({ label, shortcut, onClick, danger }: {
  label: string
  shortcut?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <div
      style={{ ...itemStyle, color: danger ? '#FF453A' : '#fff' }}
      onClick={onClick}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#3a3a3c' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent' }}
    >
      <span>{label}</span>
      {shortcut && <span style={shortcutStyle}>{shortcut}</span>}
    </div>
  )
}

function Separator() {
  return <div style={separatorStyle} />
}

export function ContextMenu({ x, y, targetId, onClose, onStartEdit, onDeleteConfirm, onInsertUrl, onAttachDocument, onAttachPhoto }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const document = useStore((s) => s.document)
  const executeCommand = useStore((s) => s.executeCommand)
  const select = useStore((s) => s.select)

  // Clamp position to viewport
  const clampedX = Math.min(x, window.innerWidth - CONTEXT_MENU_EDGE_PADDING)
  const clampedY = Math.min(y, window.innerHeight - CONTEXT_MENU_EDGE_PADDING)

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const node = targetId ? document.nodes.get(targetId) : null
  const isRoot = node?.parent === null

  const handleAddChild = useCallback(() => {
    if (!targetId) return
    const cmd = new AddChildCommand(targetId, '')
    executeCommand(cmd)
    if (cmd.createdNodeId) {
      select(cmd.createdNodeId)
      onStartEdit(cmd.createdNodeId, true)
    }
    onClose()
  }, [targetId, executeCommand, select, onStartEdit, onClose])

  const handleAddSibling = useCallback(() => {
    if (!targetId) return
    const cmd = new AddSiblingCommand(targetId, '')
    executeCommand(cmd)
    if (cmd.createdNodeId) {
      select(cmd.createdNodeId)
      onStartEdit(cmd.createdNodeId, true)
    }
    onClose()
  }, [targetId, executeCommand, select, onStartEdit, onClose])

  const handleEdit = useCallback(() => {
    if (!targetId) return
    onStartEdit(targetId, false)
    onClose()
  }, [targetId, onStartEdit, onClose])

  const handleToggleFold = useCallback(() => {
    if (!targetId || !node) return
    useStore.getState().updateDocument((doc) => {
      const n = doc.nodes.get(targetId)
      if (n) n.collapsed = !n.collapsed
    })
    onClose()
  }, [targetId, node, onClose])

  const handleInsertUrl = useCallback(() => {
    if (!targetId) return
    onInsertUrl(targetId)
    onClose()
  }, [targetId, onInsertUrl, onClose])

  const handleAttachDocument = useCallback(() => {
    if (!targetId) return
    onAttachDocument(targetId)
    onClose()
  }, [targetId, onAttachDocument, onClose])

  const handleAttachPhoto = useCallback(() => {
    if (!targetId) return
    onAttachPhoto(targetId)
    onClose()
  }, [targetId, onAttachPhoto, onClose])

  const isInBoundary = targetId ? Array.from(document.boundaries.values()).some((b) =>
    b.node_ids.includes(targetId)
  ) : false

  const handleAddBoundary = useCallback(() => {
    if (!targetId || !node || isInBoundary) return
    const nodeIds = collectDescendants(document, targetId)
    executeCommand(new AddBoundaryCommand(nodeIds, 'Group'))
    onClose()
  }, [targetId, node, isInBoundary, document, executeCommand, onClose])

  const handleDelete = useCallback(() => {
    if (!targetId || !node || isRoot) return
    if (node.children.length > 0) {
      onDeleteConfirm(targetId)
    } else {
      executeCommand(new DeleteNodeCommand(targetId))
    }
    onClose()
  }, [targetId, node, isRoot, executeCommand, onDeleteConfirm, onClose])

  if (!targetId) return null

  return (
    <div
      ref={menuRef}
      style={{ ...menuStyle, left: clampedX, top: clampedY }}
      data-testid="context-menu"
    >
      <MenuItem label="Add Child" shortcut="Tab" onClick={handleAddChild} />
      {!isRoot && (
        <MenuItem label="Add Sibling" shortcut="Enter" onClick={handleAddSibling} />
      )}
      <Separator />
      <MenuItem label="Edit" shortcut="E" onClick={handleEdit} />
      <Separator />
      <MenuItem label="Insert Web Link" shortcut="⌘K" onClick={handleInsertUrl} />
      <MenuItem label="Attach Document" shortcut="⌘⇧K" onClick={handleAttachDocument} />
      <MenuItem label="Attach Photo" shortcut="⌘⇧P" onClick={handleAttachPhoto} />
      {!isInBoundary && (
        <>
          <Separator />
          <MenuItem label="Add Boundary" shortcut="⌘G" onClick={handleAddBoundary} />
        </>
      )}
      {node && node.children.length > 0 && (
        <MenuItem
          label={node.collapsed ? 'Expand' : 'Collapse'}
          shortcut="⌘/"
          onClick={handleToggleFold}
        />
      )}
      {!isRoot && (
        <>
          <Separator />
          <MenuItem label="Delete" shortcut="⌫" onClick={handleDelete} danger />
        </>
      )}
    </div>
  )
}
