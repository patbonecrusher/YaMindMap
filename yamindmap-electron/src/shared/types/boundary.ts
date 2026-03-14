import type { Color } from './style'
import type { NodeId } from './node'

export type BoundaryId = string

export interface Boundary {
  id: BoundaryId
  label: string
  show_label: boolean
  node_ids: NodeId[]
  fill_color: Color
  stroke_color: Color
  stroke_width: number
  padding: number
}

export const BOUNDARY_DEFAULTS = {
  fill_color: { r: 0.3, g: 0.5, b: 0.8, a: 0.1 },
  stroke_color: { r: 0.45, g: 0.65, b: 0.95, a: 0.7 },
  stroke_width: 1.5,
  padding: 10.0
} as const

export function createBoundary(id: BoundaryId, nodeIds: NodeId[]): Boundary {
  return {
    id,
    label: '',
    show_label: true,
    node_ids: nodeIds,
    fill_color: { ...BOUNDARY_DEFAULTS.fill_color },
    stroke_color: { ...BOUNDARY_DEFAULTS.stroke_color },
    stroke_width: BOUNDARY_DEFAULTS.stroke_width,
    padding: BOUNDARY_DEFAULTS.padding
  }
}
