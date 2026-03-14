import type { Node, Edge } from '@xyflow/react'
import type { Document } from '../../shared/types/document'
import type { LayoutResult } from '../../shared/layout/types'
import type { NodeId, Attachment } from '../../shared/types/node'
import type { BoundaryId } from '../../shared/types/boundary'
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
  attachments: Attachment[]
  collapsed: boolean
  childCount: number
  isLeftOfRoot: boolean
  isRoot: boolean
  nodeWidth: number
}

export interface BoundaryNodeData {
  boundaryId: BoundaryId
  label: string
  showLabel: boolean
  fillColor: string
  strokeColor: string
  strokeWidth: number
  isSelected: boolean
  boundaryWidth: number
  boundaryHeight: number
}

export function toReactFlowNodes(
  doc: Document,
  layout: LayoutResult,
  selectedIds: Set<NodeId>,
  selectedBoundaryId?: BoundaryId | null
): Node<MindMapNodeData | BoundaryNodeData>[] {
  const nodes: Node<MindMapNodeData | BoundaryNodeData>[] = []

  // Add boundary nodes (rendered behind regular nodes)
  for (const [, boundary] of doc.boundaries) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let hasNodes = false

    for (const nodeId of boundary.node_ids) {
      const rect = layout.positions.get(nodeId)
      if (!rect) continue
      hasNodes = true
      minX = Math.min(minX, rect.x)
      minY = Math.min(minY, rect.y)
      maxX = Math.max(maxX, rect.x + rect.width)
      maxY = Math.max(maxY, rect.y + rect.height)
    }

    if (!hasNodes) continue

    const pad = boundary.padding
    const bx = minX - pad
    const by = minY - pad
    const bw = maxX - minX + 2 * pad
    const bh = maxY - minY + 2 * pad

    nodes.push({
      id: `boundary-${boundary.id}`,
      type: 'boundaryNode',
      position: { x: bx, y: by },
      data: {
        boundaryId: boundary.id,
        label: boundary.label,
        showLabel: boundary.show_label,
        fillColor: Color.toCss(boundary.fill_color),
        strokeColor: Color.toCss(boundary.stroke_color),
        strokeWidth: boundary.stroke_width,
        isSelected: selectedBoundaryId === boundary.id,
        boundaryWidth: bw,
        boundaryHeight: bh
      },
      width: bw,
      height: bh,
      selectable: false,
      draggable: false,
      zIndex: -1
    })
  }

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
        attachments: node.content.attachments,
        collapsed: node.collapsed,
        childCount: node.children.length,
        isLeftOfRoot: rect.x < 0 && depth > 0,
        isRoot: node.parent === null,
        nodeWidth: rect.width
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
