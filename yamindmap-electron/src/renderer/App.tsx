import { useState, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useStore } from './store'
import { useLayout } from './hooks/useLayout'
import { useKeyboardShortcuts, type DeleteDialogState } from './hooks/useKeyboardShortcuts'
import { MindMapCanvas } from './components/MindMapCanvas'
import { DeleteConfirmDialog } from './components/dialogs/DeleteConfirmDialog'
import { ContextMenu } from './components/overlays/ContextMenu'

function AppContent() {
  const doc = useStore((s) => s.document)
  const layout = useLayout(doc)
  const contextMenuPosition = useStore((s) => s.contextMenuPosition)
  const contextMenuTargetId = useStore((s) => s.contextMenuTargetId)
  const closeContextMenu = useStore((s) => s.closeContextMenu)
  const startEditing = useStore((s) => s.startEditing)
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null)

  const handleDeleteConfirm = useCallback((state: DeleteDialogState) => {
    setDeleteDialog(state)
  }, [])

  const handleDeleteClose = useCallback(() => {
    setDeleteDialog(null)
  }, [])

  const handleContextMenuDeleteConfirm = useCallback((nodeId: string) => {
    setDeleteDialog({ nodeId, hasChildren: true })
  }, [])

  const handleContextMenuStartEdit = useCallback((nodeId: string, isNew: boolean) => {
    startEditing(nodeId, isNew)
  }, [startEditing])

  useKeyboardShortcuts({ onDeleteConfirm: handleDeleteConfirm })

  return (
    <>
      <MindMapCanvas doc={doc} layout={layout} />
      {contextMenuPosition && (
        <ContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          targetId={contextMenuTargetId}
          onClose={closeContextMenu}
          onStartEdit={handleContextMenuStartEdit}
          onDeleteConfirm={handleContextMenuDeleteConfirm}
        />
      )}
      {deleteDialog && (
        <DeleteConfirmDialog state={deleteDialog} onClose={handleDeleteClose} />
      )}
    </>
  )
}

export function App(): JSX.Element {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlowProvider>
        <AppContent />
      </ReactFlowProvider>
    </div>
  )
}
