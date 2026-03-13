import type { Document } from '../types/document'
import type { NodeId } from '../types/node'
import type { Rect, Size } from '../types/geometry'
import type { NodeSizeMap, LayoutResult } from './types'
import { edgeKey } from './types'
import { computeEdgeRoutes } from './routing'

const DEFAULT_NODE_SIZE: Size = { width: 100, height: 40 }

export function balancedLayout(doc: Document, nodeSizes: NodeSizeMap): LayoutResult {
  const positions = new Map<NodeId, Rect>()

  if (!doc.root_id) {
    return { positions, edgeRoutes: new Map() }
  }

  const root = doc.nodes.get(doc.root_id)
  if (!root) {
    return { positions, edgeRoutes: new Map() }
  }

  const rootSize = nodeSizes.get(doc.root_id) ?? DEFAULT_NODE_SIZE

  // Place root centered at origin
  positions.set(doc.root_id, {
    x: -rootSize.width / 2,
    y: -rootSize.height / 2,
    width: rootSize.width,
    height: rootSize.height
  })

  if (root.children.length === 0 || root.collapsed) {
    return { positions, edgeRoutes: computeEdgeRoutes(doc, positions) }
  }

  const { h_gap, v_gap, direction } = doc.layout_config

  // Partition children into left and right
  const [leftChildren, rightChildren] = partitionChildren(
    doc, root.children, nodeSizes, v_gap, direction
  )

  const rootRect = positions.get(doc.root_id)!

  // Layout right children
  if (rightChildren.length > 0) {
    const anchorX = rootRect.x + rootRect.width + h_gap
    layoutChildrenColumn(doc, rightChildren, nodeSizes, anchorX, 0, h_gap, v_gap, false, positions)
  }

  // Layout left children
  if (leftChildren.length > 0) {
    const anchorX = rootRect.x - h_gap
    layoutChildrenColumn(doc, leftChildren, nodeSizes, anchorX, 0, h_gap, v_gap, true, positions)
  }

  return { positions, edgeRoutes: computeEdgeRoutes(doc, positions) }
}

function partitionChildren(
  doc: Document,
  children: NodeId[],
  nodeSizes: NodeSizeMap,
  vGap: number,
  direction: string
): [NodeId[], NodeId[]] {
  if (direction === 'RightOnly') return [[], [...children]]
  if (direction === 'LeftOnly') return [[...children], []]

  // Balanced: greedy partition
  const left: NodeId[] = []
  const right: NodeId[] = []
  let leftHeight = 0
  let rightHeight = 0

  for (const childId of children) {
    const subtreeH = estimateSubtreeHeight(doc, childId, nodeSizes, vGap)
    if (rightHeight <= leftHeight) {
      right.push(childId)
      rightHeight += subtreeH + vGap
    } else {
      left.push(childId)
      leftHeight += subtreeH + vGap
    }
  }

  return [left, right]
}

function estimateSubtreeHeight(
  doc: Document,
  nodeId: NodeId,
  nodeSizes: NodeSizeMap,
  vGap: number
): number {
  const nodeH = nodeSizes.get(nodeId)?.height ?? DEFAULT_NODE_SIZE.height
  const node = doc.nodes.get(nodeId)

  if (!node || node.children.length === 0 || node.collapsed) {
    return nodeH
  }

  let childrenTotal = 0
  for (const childId of node.children) {
    childrenTotal += estimateSubtreeHeight(doc, childId, nodeSizes, vGap)
  }
  childrenTotal += Math.max(0, node.children.length - 1) * vGap

  return Math.max(childrenTotal, nodeH)
}

function layoutChildrenColumn(
  doc: Document,
  children: NodeId[],
  nodeSizes: NodeSizeMap,
  anchorX: number,
  centerY: number,
  hGap: number,
  vGap: number,
  isLeft: boolean,
  positions: Map<NodeId, Rect>
): void {
  if (children.length === 0) return

  // Calculate subtree heights
  const subtreeHeights = children.map((c) =>
    estimateSubtreeHeight(doc, c, nodeSizes, vGap)
  )

  // Calculate boundary gaps
  const boundaryGaps = children.map((_, i) =>
    boundaryGapBetween(doc, children, i)
  )

  // Total height
  let totalHeight = 0
  for (const h of subtreeHeights) totalHeight += h
  totalHeight += (children.length - 1) * vGap
  for (const g of boundaryGaps) totalHeight += g

  let currentY = centerY - totalHeight / 2

  for (let i = 0; i < children.length; i++) {
    const childId = children[i]
    const childSize = nodeSizes.get(childId) ?? DEFAULT_NODE_SIZE
    const subtreeH = subtreeHeights[i]
    const childCenterY = currentY + subtreeH / 2

    const childX = isLeft ? anchorX - childSize.width : anchorX
    const childRect: Rect = {
      x: childX,
      y: childCenterY - childSize.height / 2,
      width: childSize.width,
      height: childSize.height
    }
    positions.set(childId, childRect)

    // Recursively layout grandchildren
    const childNode = doc.nodes.get(childId)
    if (childNode && childNode.children.length > 0 && !childNode.collapsed) {
      const nextX = isLeft
        ? childRect.x - hGap
        : childRect.x + childRect.width + hGap
      layoutChildrenColumn(
        doc, childNode.children, nodeSizes,
        nextX, childCenterY, hGap, vGap, isLeft, positions
      )
    }

    currentY += subtreeH + vGap + boundaryGaps[i]
  }
}

function nodeBoundaryInfo(
  doc: Document,
  nodeId: NodeId
): { boundaryId: string; padding: number } | null {
  for (const boundary of doc.boundaries.values()) {
    if (boundary.node_ids.includes(nodeId)) {
      return { boundaryId: boundary.id, padding: boundary.padding }
    }
  }
  return null
}

function boundaryGapBetween(
  doc: Document,
  children: NodeId[],
  i: number
): number {
  if (i + 1 >= children.length) return 0

  const cur = nodeBoundaryInfo(doc, children[i])
  const next = nodeBoundaryInfo(doc, children[i + 1])

  if (cur && next) {
    if (cur.boundaryId === next.boundaryId) return 0
    return cur.padding + next.padding
  }
  if (cur && !next) return cur.padding
  if (!cur && next) return next.padding
  return 0
}
