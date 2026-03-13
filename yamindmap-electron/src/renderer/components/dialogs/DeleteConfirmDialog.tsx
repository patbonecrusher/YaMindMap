import { useCallback } from 'react'
import { useStore } from '../../store'
import { DeleteNodeCommand, DeleteAndReparentCommand } from '../../../shared/commands/node-commands'
import type { DeleteDialogState } from '../../hooks/useKeyboardShortcuts'

interface DeleteConfirmDialogProps {
  state: DeleteDialogState
  onClose: () => void
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
}

const dialogStyle: React.CSSProperties = {
  backgroundColor: '#2c2c2e',
  borderRadius: 12,
  padding: '20px 24px',
  minWidth: 320,
  color: '#fff',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
}

const titleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  marginBottom: 8
}

const messageStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#aaa',
  marginBottom: 20
}

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8
}

const buttonBase: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 6,
  border: 'none',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer'
}

export function DeleteConfirmDialog({ state, onClose }: DeleteConfirmDialogProps) {
  const executeCommand = useStore((s) => s.executeCommand)
  const clearSelection = useStore((s) => s.clearSelection)

  const handleDeleteAll = useCallback(() => {
    executeCommand(new DeleteNodeCommand(state.nodeId))
    clearSelection()
    onClose()
  }, [executeCommand, clearSelection, state.nodeId, onClose])

  const handleKeepChildren = useCallback(() => {
    executeCommand(new DeleteAndReparentCommand(state.nodeId))
    clearSelection()
    onClose()
  }, [executeCommand, clearSelection, state.nodeId, onClose])

  return (
    <div style={overlayStyle} onClick={onClose} data-testid="delete-dialog-overlay">
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()} data-testid="delete-dialog">
        <div style={titleStyle}>Delete Node</div>
        <div style={messageStyle}>
          This node has children. What would you like to do?
        </div>
        <div style={buttonRowStyle}>
          <button
            style={{ ...buttonBase, backgroundColor: '#444', color: '#fff' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            style={{ ...buttonBase, backgroundColor: '#5856D6', color: '#fff' }}
            onClick={handleKeepChildren}
          >
            Keep Children
          </button>
          <button
            style={{ ...buttonBase, backgroundColor: '#FF3B30', color: '#fff' }}
            onClick={handleDeleteAll}
            data-testid="delete-all-btn"
          >
            Delete All
          </button>
        </div>
      </div>
    </div>
  )
}
