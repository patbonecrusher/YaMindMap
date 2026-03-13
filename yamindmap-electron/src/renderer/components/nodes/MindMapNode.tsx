import { memo, useState, useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MindMapNodeData } from '../../utils/to-react-flow'
import type { Attachment } from '../../../shared/types/node'
import { useStore } from '../../store'
import { RemoveAttachmentCommand } from '../../../shared/commands/attachment-commands'
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

  const handleOpenAttachment = useCallback((attachment: Attachment) => {
    if (attachment.kind.type === 'Url') {
      window.api.openExternal(attachment.kind.url)
    } else {
      const path = attachment.kind.type === 'Document' ? attachment.kind.path : attachment.kind.path
      window.api.openPath(path)
    }
  }, [])

  const handleRemoveAttachment = useCallback((nodeId: string, index: number) => {
    executeCommand(new RemoveAttachmentCommand(nodeId, index))
  }, [executeCommand])

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

  if (data.shape === 'Diamond') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div style={style}>
          <div style={getDiamondContentStyle()}>
            {!isEditing && <span>{data.label}</span>}
          </div>
        </div>
        {handles}
        {foldBadge}
        {attachmentIcons}
        {editor}
      </div>
    )
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={style}>
        {!isEditing && <span>{data.label}</span>}
      </div>
      {handles}
      {foldBadge}
      {attachmentIcons}
      {editor}
    </div>
  )
}

export const MindMapNode = memo(MindMapNodeComponent)
