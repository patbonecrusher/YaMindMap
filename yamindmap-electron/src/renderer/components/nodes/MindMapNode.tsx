import { memo, useState, useCallback, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MindMapNodeData } from '../../utils/to-react-flow'
import type { Attachment } from '../../../shared/types/node'
import { useStore } from '../../store'
import { RemoveAttachmentCommand } from '../../../shared/commands/attachment-commands'
import { ResizeNodeCommand, MoveNodeCommand } from '../../../shared/commands/node-commands'
import { isAncestorOf } from '../../../shared/document-ops'
import { RESIZE_HANDLE_WIDTH, MIN_RESIZE_WIDTH, DRAG_THRESHOLD } from '../../../shared/constants'
import { getNodeStyle, getDiamondContentStyle } from './node-styles'
import { FoldBadge } from './FoldBadge'
import { TextEditor } from './TextEditor'
import { AttachmentIcons } from './AttachmentIcons'

const hiddenHandleStyle = { opacity: 0, width: 0, height: 0, minWidth: 0, minHeight: 0 }

function MindMapNodeComponent({ data }: NodeProps & { data: MindMapNodeData }) {
  const [hovered, setHovered] = useState(false)
  const style = getNodeStyle(data, hovered)
  const editingNodeId = useStore((s) => s.editingNodeId)
  const isNewNode = useStore((s) => s.isNewNode)
  const setEditingNodeId = useStore((s) => s.setEditingNodeId)
  const setIsNewNode = useStore((s) => s.setIsNewNode)
  const executeCommand = useStore((s) => s.executeCommand)
  const isEditing = editingNodeId === data.nodeId

  const filePath = useStore((s) => s.filePath)

  const handleOpenAttachment = useCallback((attachment: Attachment) => {
    if (attachment.kind.type === 'Url') {
      window.api.openExternal(attachment.kind.url)
    } else {
      const rawPath = attachment.kind.path
      // Resolve relative paths against the document's directory
      if (filePath && !rawPath.startsWith('/') && !rawPath.match(/^[A-Z]:\\/i)) {
        const docDir = filePath.substring(0, filePath.lastIndexOf('/'))
        window.api.openPath(`${docDir}/${rawPath}`)
      } else {
        window.api.openPath(rawPath)
      }
    }
  }, [filePath])

  const handleRemoveAttachment = useCallback((nodeId: string, index: number) => {
    executeCommand(new RemoveAttachmentCommand(nodeId, index))
  }, [executeCommand])

  // Resize handle — live resize during drag, single undo command on release
  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()

    const startX = e.clientX
    const startWidth = data.nodeWidth
    const isLeft = data.isLeftOfRoot

    // If node is in multi-selection, resize all
    const state = useStore.getState()
    const ids = state.selectedNodeIds.has(data.nodeId) && state.selectedNodeIds.size > 1
      ? Array.from(state.selectedNodeIds)
      : [data.nodeId]

    // Store original widths for undo
    const originalWidths = new Map<string, number | null>()
    for (const id of ids) {
      const node = state.document.nodes.get(id)
      if (node) originalWidths.set(id, node.manual_width)
    }

    const handleMouseMove = (me: MouseEvent): void => {
      document.body.style.cursor = 'col-resize'
      const delta = isLeft ? -(me.clientX - startX) : (me.clientX - startX)
      const newWidth = Math.max(MIN_RESIZE_WIDTH, startWidth + delta)

      // Live update — directly mutate document for immediate visual feedback
      useStore.getState().updateDocument((doc) => {
        for (const id of ids) {
          const node = doc.nodes.get(id)
          if (node) node.manual_width = newWidth
        }
      })
    }

    const handleMouseUp = (me: MouseEvent): void => {
      const delta = isLeft ? -(me.clientX - startX) : (me.clientX - startX)
      const finalWidth = Math.max(MIN_RESIZE_WIDTH, startWidth + delta)

      if (Math.abs(delta) > 1) {
        // Restore original widths first, then execute command for proper undo
        useStore.getState().updateDocument((doc) => {
          for (const [id, origWidth] of originalWidths) {
            const node = doc.nodes.get(id)
            if (node) node.manual_width = origWidth
          }
        })
        useStore.getState().executeCommand(new ResizeNodeCommand(ids, finalWidth))
      }

      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [data.nodeId, data.nodeWidth, data.isLeftOfRoot])

  const resizeHandleSide = data.isLeftOfRoot ? 'left' : 'right'
  const resizeHandle = !data.isRoot ? (
    <div
      onPointerDown={handleResizePointerDown}
      style={{
        position: 'absolute',
        top: 0,
        [resizeHandleSide]: 0,
        width: RESIZE_HANDLE_WIDTH,
        height: '100%',
        cursor: 'col-resize',
        zIndex: 6
      }}
    />
  ) : null

  // Drag-to-reparent
  const dropTargetNodeId = useStore((s) => s.dropTargetNodeId)
  const isDropTarget = dropTargetNodeId === data.nodeId

  const handleNodePointerDown = useCallback((e: React.PointerEvent) => {
    // Don't start drag on root, when editing, or from resize handle
    if (data.isRoot || isEditing) return
    // Only left button
    if (e.button !== 0) return

    // Stop propagation to prevent React Flow pan (RF uses pointer events)
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    let isDragging = false

    const findDropTarget = (clientX: number, clientY: number): string | null => {
      const doc = useStore.getState().document
      const nodeElements = document.querySelectorAll('.react-flow__node')
      let closest: { id: string; dist: number } | null = null

      nodeElements.forEach((el) => {
        const id = el.getAttribute('data-id')
        if (!id || id === data.nodeId) return
        if (isAncestorOf(doc, data.nodeId, id)) return

        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dist = Math.sqrt((clientX - cx) ** 2 + (clientY - cy) ** 2)

        if (!closest || dist < closest.dist) {
          closest = { id, dist }
        }
      })

      return closest?.id ?? null
    }

    const handleMouseMove = (me: MouseEvent): void => {
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      if (!isDragging) {
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return
        isDragging = true
        useStore.getState().setDraggingNode(data.nodeId)
        document.body.style.cursor = 'grabbing'
      }
      const targetId = findDropTarget(me.clientX, me.clientY)
      const store = useStore.getState()
      store.setDropTarget(targetId)
      store.setDragPosition({ x: me.clientX, y: me.clientY })
    }

    const handleMouseUp = (me: MouseEvent): void => {
      if (isDragging) {
        const store = useStore.getState()
        const targetId = store.dropTargetNodeId
        if (targetId) {
          const doc = store.document
          const targetNode = doc.nodes.get(targetId)
          if (targetNode) {
            store.executeCommand(
              new MoveNodeCommand(data.nodeId, targetId, targetNode.children.length)
            )
          }
        }
        store.setDraggingNode(null)
        store.setDropTarget(null)
        store.setDragPosition(null)
        document.body.style.cursor = ''
      } else {
        // Was a click, not a drag — trigger select
        const state = useStore.getState()
        if (me.shiftKey) {
          state.toggleSelect(data.nodeId)
        } else {
          state.select(data.nodeId)
        }
      }
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [data.nodeId, data.isRoot, isEditing])

  const showFoldBadge = data.childCount > 0
  const badgeSide = data.isLeftOfRoot ? 'left' : 'right'

  const handles = (
    <>
      <Handle type="target" position={Position.Left} style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Right} style={hiddenHandleStyle} />
    </>
  )

  const foldBadge = showFoldBadge ? (
    <FoldBadge
      nodeId={data.nodeId}
      collapsed={data.collapsed}
      childCount={data.childCount}
      side={badgeSide}
    />
  ) : null

  const handleCommit = () => {
    setEditingNodeId(null)
    setIsNewNode(false)
  }

  const handleCancel = () => {
    setEditingNodeId(null)
    setIsNewNode(false)
  }

  const attachmentIcons = data.hasAttachments && !isEditing ? (
    <AttachmentIcons
      nodeId={data.nodeId}
      attachments={data.attachments}
      onOpen={handleOpenAttachment}
      onRemove={handleRemoveAttachment}
    />
  ) : null

  const editor = isEditing ? (
    <TextEditor
      nodeId={data.nodeId}
      initialText={data.label}
      isNewNode={isNewNode}
      shape={data.shape}
      fontSize={data.fontSize}
      fontColor={data.fontColor}
      onCommit={handleCommit}
      onCancel={handleCancel}
    />
  ) : null

  const dropIndicator = isDropTarget ? (
    <div style={{
      position: 'absolute',
      inset: -3,
      border: '2px dashed #FF9500',
      borderRadius: 8,
      pointerEvents: 'none',
      zIndex: 7
    }} />
  ) : null

  if (data.shape === 'Diamond') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }} onPointerDown={handleNodePointerDown}>
        <div style={style}>
          <div style={getDiamondContentStyle()}>
            {!isEditing && <span>{data.label}</span>}
          </div>
        </div>
        {handles}
        {foldBadge}
        {attachmentIcons}
        {resizeHandle}
        {dropIndicator}
        {editor}
      </div>
    )
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={handleNodePointerDown}
    >
      <div style={style}>
        {!isEditing && <span>{data.label}</span>}
      </div>
      {handles}
      {foldBadge}
      {attachmentIcons}
      {resizeHandle}
      {dropIndicator}
      {editor}
    </div>
  )
}

export const MindMapNode = memo(MindMapNodeComponent)
