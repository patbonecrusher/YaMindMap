import { useState, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useStore } from './store'
import { useLayout } from './hooks/useLayout'
import { useKeyboardShortcuts, type DeleteDialogState } from './hooks/useKeyboardShortcuts'
import { MindMapCanvas } from './components/MindMapCanvas'
import { DeleteConfirmDialog } from './components/dialogs/DeleteConfirmDialog'
import { UrlInputDialog } from './components/dialogs/UrlInputDialog'
import { ContextMenu } from './components/overlays/ContextMenu'
import { AddAttachmentCommand } from '../shared/commands/attachment-commands'
import { EditTextCommand } from '../shared/commands/node-commands'

function AppContent() {
  const doc = useStore((s) => s.document)
  const layout = useLayout(doc)
  const contextMenuPosition = useStore((s) => s.contextMenuPosition)
  const contextMenuTargetId = useStore((s) => s.contextMenuTargetId)
  const closeContextMenu = useStore((s) => s.closeContextMenu)
  const startEditing = useStore((s) => s.startEditing)
  const executeCommand = useStore((s) => s.executeCommand)
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null)
  const [urlDialogNodeId, setUrlDialogNodeId] = useState<string | null>(null)

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

  const handleInsertUrl = useCallback((nodeId: string) => {
    setUrlDialogNodeId(nodeId)
  }, [])

  const handleUrlInsert = useCallback((nodeId: string, url: string, autoRename: boolean, title: string | null) => {
    executeCommand(new AddAttachmentCommand(nodeId, {
      kind: { type: 'Url', url },
      label: title || url
    }))
    if (autoRename && title) {
      executeCommand(new EditTextCommand(nodeId, title))
    }
    setUrlDialogNodeId(null)
  }, [executeCommand])

  const handleAttachDocument = useCallback(async (nodeId: string) => {
    const path = await window.api.showOpenDialogDocument()
    if (!path) return
    const filename = path.split('/').pop() || path
    executeCommand(new AddAttachmentCommand(nodeId, {
      kind: { type: 'Document', path },
      label: filename
    }))
  }, [executeCommand])

  const handleAttachPhoto = useCallback(async (nodeId: string) => {
    const path = await window.api.showOpenDialogPhoto()
    if (!path) return
    const filename = path.split('/').pop() || path
    executeCommand(new AddAttachmentCommand(nodeId, {
      kind: { type: 'Photo', path },
      label: filename
    }))
  }, [executeCommand])

  useKeyboardShortcuts({
    onDeleteConfirm: handleDeleteConfirm,
    onInsertUrl: handleInsertUrl,
    onAttachDocument: handleAttachDocument,
    onAttachPhoto: handleAttachPhoto
  })

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
          onInsertUrl={handleInsertUrl}
          onAttachDocument={handleAttachDocument}
          onAttachPhoto={handleAttachPhoto}
        />
      )}
      {deleteDialog && (
        <DeleteConfirmDialog state={deleteDialog} onClose={handleDeleteClose} />
      )}
      {urlDialogNodeId && (
        <UrlInputDialog
          nodeId={urlDialogNodeId}
          onInsert={handleUrlInsert}
          onClose={() => setUrlDialogNodeId(null)}
        />
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
