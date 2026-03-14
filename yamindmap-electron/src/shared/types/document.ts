import type { MindMapNode, NodeId } from './node'
import type { Boundary, BoundaryId, BoundaryStyle } from './boundary'
import type { DefaultStyles, EdgeStyle, Color } from './style'
import { DEFAULT_STYLES, DEFAULT_EDGE_STYLE, DEFAULT_BOUNDARY_STYLE } from '../defaults'
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
  default_boundary_style: BoundaryStyle
  background_color: Color
  layout_config: LayoutConfig
}

export function createDocument(): Document {
  return {
    nodes: new Map(),
    root_id: null,
    boundaries: new Map(),
    default_styles: DEFAULT_STYLES,
    default_edge_style: DEFAULT_EDGE_STYLE,
    default_boundary_style: { ...DEFAULT_BOUNDARY_STYLE },
    background_color: { r: 1, g: 1, b: 1, a: 1 },
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
