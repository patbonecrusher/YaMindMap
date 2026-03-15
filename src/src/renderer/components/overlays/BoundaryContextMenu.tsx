import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { DeleteBoundaryCommand } from '../../../shared/commands/boundary-commands'

interface BoundaryContextMenuProps {
  x: number
  y: number
  boundaryId: string
  onClose: () => void
  onEditLabel: (boundaryId: string) => void
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

function MenuItem({ label, onClick, danger }: {
  label: string
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
    </div>
  )
}

export function BoundaryContextMenu({ x, y, boundaryId, onClose, onEditLabel }: BoundaryContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const document = useStore((s) => s.document)
  const executeCommand = useStore((s) => s.executeCommand)
  const clearSelection = useStore((s) => s.clearSelection)

  const boundary = document.boundaries.get(boundaryId)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleEditLabel = useCallback(() => {
    onEditLabel(boundaryId)
    onClose()
  }, [boundaryId, onEditLabel, onClose])

  const handleToggleLabel = useCallback(() => {
    if (!boundary) return
    useStore.getState().updateDocument((doc) => {
      const b = doc.boundaries.get(boundaryId)
      if (b) b.show_label = !b.show_label
    })
    onClose()
  }, [boundaryId, boundary, onClose])

  const handleDelete = useCallback(() => {
    executeCommand(new DeleteBoundaryCommand(boundaryId))
    clearSelection()
    onClose()
  }, [boundaryId, executeCommand, clearSelection, onClose])

  if (!boundary) return null

  const clampedX = Math.min(x, window.innerWidth - 200)
  const clampedY = Math.min(y, window.innerHeight - 150)

  return (
    <div ref={menuRef} style={{ ...menuStyle, left: clampedX, top: clampedY }}>
      <MenuItem label="Edit Label" onClick={handleEditLabel} />
      <MenuItem
        label={boundary.show_label ? 'Hide Title' : 'Show Title'}
        onClick={handleToggleLabel}
      />
      <div style={separatorStyle} />
      <MenuItem label="Delete Boundary" onClick={handleDelete} danger />
    </div>
  )
}
