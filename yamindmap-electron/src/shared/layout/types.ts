import type { NodeId } from '../types/node'
import type { Rect, Point, Size } from '../types/geometry'

export interface NodeSizeMap {
  get(id: NodeId): Size | undefined
}

export interface BezierRoute {
  from: Point
  ctrl1: Point
  ctrl2: Point
  to: Point
}

export interface LayoutResult {
  positions: Map<NodeId, Rect>
  edgeRoutes: Map<string, BezierRoute> // key: `${parentId}->${childId}`
}

export function edgeKey(parentId: NodeId, childId: NodeId): string {
  return `${parentId}->${childId}`
}
