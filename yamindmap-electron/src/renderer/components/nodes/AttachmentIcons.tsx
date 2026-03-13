import { useCallback } from 'react'
import type { Attachment } from '../../../shared/types/node'
import { Color } from '../../../shared/types/style'
import {
  ICON_SIZE,
  ICON_SPACING,
  BADGE_URL_COLOR,
  BADGE_DOCUMENT_COLOR,
  BADGE_PHOTO_COLOR
} from '../../../shared/constants'

interface AttachmentIconsProps {
  nodeId: string
  attachments: Attachment[]
  onOpen: (attachment: Attachment) => void
  onRemove: (nodeId: string, index: number) => void
}

const badgeColors: Record<string, string> = {
  Url: Color.toCss(BADGE_URL_COLOR),
  Document: Color.toCss(BADGE_DOCUMENT_COLOR),
  Photo: Color.toCss(BADGE_PHOTO_COLOR)
}

function AttachmentIcon({ type }: { type: string }) {
  if (type === 'Url') {
    // External link icon
    return (
      <svg width={10} height={10} viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 1H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V7" />
        <path d="M7 1h4v4" />
        <path d="M5 7L11 1" />
      </svg>
    )
  }
  if (type === 'Document') {
    // Page icon
    return (
      <svg width={10} height={10} viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 1H3a1 1 0 00-1 1v8a1 1 0 001 1h6a1 1 0 001-1V4L7 1z" />
        <path d="M7 1v3h3" />
      </svg>
    )
  }
  // Photo icon (mountain)
  return (
    <svg width={10} height={10} viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="10" height="10" rx="1" />
      <path d="M1 9l3-3 2 2 2-3 3 4" />
      <circle cx="8" cy="4" r="1" />
    </svg>
  )
}

export function AttachmentIcons({ nodeId, attachments, onOpen, onRemove }: AttachmentIconsProps) {
  const handleClick = useCallback((e: React.MouseEvent, attachment: Attachment, index: number) => {
    e.stopPropagation()
    if (e.altKey) {
      onRemove(nodeId, index)
    } else {
      onOpen(attachment)
    }
  }, [nodeId, onOpen, onRemove])

  return (
    <div style={{
      position: 'absolute',
      right: 4,
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      gap: ICON_SPACING,
      alignItems: 'center',
      zIndex: 5
    }}>
      {attachments.map((att, i) => (
        <div
          key={i}
          onClick={(e) => handleClick(e, att, i)}
          title={att.label || (att.kind.type === 'Url' ? (att.kind as { type: 'Url'; url: string }).url : (att.kind as { type: 'Document'; path: string } | { type: 'Photo'; path: string }).path)}
          style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
            borderRadius: 3,
            backgroundColor: badgeColors[att.kind.type] || '#666',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          <AttachmentIcon type={att.kind.type} />
        </div>
      ))}
    </div>
  )
}
