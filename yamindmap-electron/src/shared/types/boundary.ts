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

export interface BoundaryStyle {
  fill_color: Color
  stroke_color: Color
  stroke_width: number
  padding: number
}

export const BOUNDARY_DEFAULTS: BoundaryStyle = {
  fill_color: { r: 0.2, g: 0.45, b: 0.35, a: 0.08 },
  stroke_color: { r: 0.3, g: 0.6, b: 0.5, a: 0.5 },
  stroke_width: 1.5,
  padding: 10.0
}

export function createBoundary(id: BoundaryId, nodeIds: NodeId[], style?: BoundaryStyle): Boundary {
  const s = style ?? BOUNDARY_DEFAULTS
  return {
    id,
    label: '',
    show_label: true,
    node_ids: nodeIds,
    fill_color: { ...s.fill_color },
    stroke_color: { ...s.stroke_color },
    stroke_width: s.stroke_width,
    padding: s.padding
  }
}
