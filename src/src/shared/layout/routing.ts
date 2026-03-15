import type { Document } from '../types/document'
import type { NodeId } from '../types/node'
import type { Rect, Point } from '../types/geometry'
import type { BezierRoute } from './types'
import { edgeKey } from './types'

export function computeEdgeRoutes(
  doc: Document,
  positions: Map<NodeId, Rect>
): Map<string, BezierRoute> {
  const routes = new Map<string, BezierRoute>()

  for (const [id, node] of doc.nodes) {
    const parentRect = positions.get(id)
    if (!parentRect) continue

    for (const childId of node.children) {
      const childRect = positions.get(childId)
      if (!childRect) continue

      routes.set(edgeKey(id, childId), bezierBetween(parentRect, childRect))
    }
  }

  return routes
}

export function bezierBetween(parent: Rect, child: Rect): BezierRoute {
  const parentCenterX = parent.x + parent.width / 2
  const parentCenterY = parent.y + parent.height / 2
  const childCenterX = child.x + child.width / 2
  const childCenterY = child.y + child.height / 2

  let from: Point
  let to: Point

  if (childCenterX >= parentCenterX) {
    // Child is to the right
    from = { x: parent.x + parent.width, y: parentCenterY }
    to = { x: child.x, y: childCenterY }
  } else {
    // Child is to the left
    from = { x: parent.x, y: parentCenterY }
    to = { x: child.x + child.width, y: childCenterY }
  }

  const dx = (to.x - from.x) * 0.5
  const ctrl1: Point = { x: from.x + dx, y: from.y }
  const ctrl2: Point = { x: to.x - dx, y: to.y }

  return { from, ctrl1, ctrl2, to }
}
