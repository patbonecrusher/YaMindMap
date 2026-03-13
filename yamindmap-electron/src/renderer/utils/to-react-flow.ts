import type { Node, Edge } from '@xyflow/react'
import type { Document } from '../../shared/types/document'
import type { LayoutResult } from '../../shared/layout/types'
import type { NodeId } from '../../shared/types/node'
import { depthOf } from '../../shared/document-ops'
import { styleForDepth, mergeStyles } from '../../shared/types/style'
import { Color } from '../../shared/types/style'
import { edgeKey } from '../../shared/layout/types'

export interface MindMapNodeData {
  nodeId: string
  label: string
  depth: number
  fillColor: string
  strokeColor: string
  strokeWidth: number
  fontColor: string
  fontSize: number
  cornerRadius: number
  shape: string
  isSelected: boolean
  hasAttachments: boolean
  attachmentTypes: string[]
  collapsed: boolean
  childCount: number
  isLeftOfRoot: boolean
}

export function toReactFlowNodes(
  doc: Document,
  layout: LayoutResult,
  selectedIds: Set<NodeId>
): Node<MindMapNodeData>[] {
  const nodes: Node<MindMapNodeData>[] = []

  for (const [id, rect] of layout.positions) {
    const node = doc.nodes.get(id)
    if (!node) continue

    const depth = depthOf(doc, id)
    const defaultStyle = styleForDepth(doc.default_styles, depth)
    const style = mergeStyles(node.style, defaultStyle)

    nodes.push({
      id,
      type: 'mindMapNode',
      position: { x: rect.x, y: rect.y },
      data: {
        nodeId: id,
        label: node.content.text,
        depth,
        fillColor: Color.toCss(style.fill_color!),
        strokeColor: Color.toCss(style.stroke_color!),
        strokeWidth: style.stroke_width ?? 1,
        fontColor: Color.toCss(style.font_color!),
        fontSize: style.font_size ?? 14,
        cornerRadius: style.corner_radius ?? 4,
        shape: style.shape ?? 'RoundedRect',
        isSelected: selectedIds.has(id),
        hasAttachments: node.content.attachments.length > 0,
        attachmentTypes: node.content.attachments.map((a) => a.kind.type),
        collapsed: node.collapsed,
        childCount: node.children.length,
        isLeftOfRoot: rect.x < 0 && depth > 0
      },
      width: rect.width,
      height: rect.height,
      selectable: false,
      draggable: false
    })
  }

  return nodes
}

export function toReactFlowEdges(
  doc: Document,
  layout: LayoutResult
): Edge[] {
  const edges: Edge[] = []

  for (const [id, node] of doc.nodes) {
    for (const childId of node.children) {
      const key = edgeKey(id, childId)
      const route = layout.edgeRoutes.get(key)
      if (!route) continue

      edges.push({
        id: key,
        source: id,
        target: childId,
        type: 'bezierEdge',
        data: {
          fromX: route.from.x,
          fromY: route.from.y,
          ctrl1X: route.ctrl1.x,
          ctrl1Y: route.ctrl1.y,
          ctrl2X: route.ctrl2.x,
          ctrl2Y: route.ctrl2.y,
          toX: route.to.x,
          toY: route.to.y,
          color: Color.toCss(doc.default_edge_style.color),
          width: doc.default_edge_style.width
        }
      })
    }
  }

  return edges
}
