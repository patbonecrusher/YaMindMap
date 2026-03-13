import type { MindMapNode, NodeId } from './node'
import type { Boundary, BoundaryId } from './boundary'
import type { DefaultStyles, EdgeStyle } from './style'
import { DEFAULT_STYLES, DEFAULT_EDGE_STYLE } from '../defaults'
import { createNode } from './node'

export type LayoutType = 'Map' | 'TreeRight' | 'TreeDown'
export type LayoutDirection = 'Balanced' | 'LeftOnly' | 'RightOnly'

export interface LayoutConfig {
  layout_type: LayoutType
  direction: LayoutDirection
  h_gap: number
  v_gap: number
}

export interface Document {
  nodes: Map<NodeId, MindMapNode>
  root_id: NodeId | null
  boundaries: Map<BoundaryId, Boundary>
  default_styles: DefaultStyles
  default_edge_style: EdgeStyle
  layout_config: LayoutConfig
}

export function createDocument(): Document {
  return {
    nodes: new Map(),
    root_id: null,
    boundaries: new Map(),
    default_styles: DEFAULT_STYLES,
    default_edge_style: DEFAULT_EDGE_STYLE,
    layout_config: {
      layout_type: 'Map',
      direction: 'Balanced',
      h_gap: 60.0,
      v_gap: 20.0
    }
  }
}

export function createDocumentWithRoot(text: string): Document {
  const doc = createDocument()
  const id = crypto.randomUUID()
  const root = createNode(id, text)
  doc.nodes.set(id, root)
  doc.root_id = id
  return doc
}
