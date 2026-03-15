import type { NodeStyle, RichSpan } from './style'
import type { Rect } from './geometry'

export type NodeId = string

export type AttachmentKind =
  | { type: 'Url'; url: string }
  | { type: 'Document'; path: string }
  | { type: 'Photo'; path: string }

export interface Attachment {
  readonly kind: AttachmentKind
  readonly label?: string
}

export interface NodeContent {
  text: string
  rich_spans: RichSpan[]
  notes: string
  attachments: Attachment[]
}

export interface MindMapNode {
  id: NodeId
  parent: NodeId | null
  children: NodeId[]
  content: NodeContent
  style: NodeStyle
  collapsed: boolean
  manual_position: { x: number; y: number } | null
  manual_width: number | null
  /** Layout result — not serialized */
  computed_bounds: Rect | null
}

export function createNode(id: NodeId, text: string): MindMapNode {
  return {
    id,
    parent: null,
    children: [],
    content: {
      text,
      rich_spans: [],
      notes: '',
      attachments: []
    },
    style: {},
    collapsed: false,
    manual_position: null,
    manual_width: null,
    computed_bounds: null
  }
}
