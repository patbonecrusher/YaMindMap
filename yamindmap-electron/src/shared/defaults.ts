import type { DefaultStyles, EdgeStyle, NodeStyle } from './types/style'
import type { BoundaryStyle } from './types/boundary'
import { Color } from './types/style'
import { DEFAULT_FONT_FAMILY } from './constants'

export const ROOT_STYLE: NodeStyle = {
  shape: 'Ellipse',
  fill_color: Color.fromHex('4A90D9')!,
  stroke_color: Color.fromHex('2C5F8A')!,
  stroke_width: 2.0,
  font_family: DEFAULT_FONT_FAMILY,
  font_size: 18.0,
  font_color: Color.WHITE,
  padding_h: 24.0,
  padding_v: 16.0,
  min_width: 120.0,
  max_width: 300.0,
  corner_radius: 8.0
}

export const BRANCH_STYLE: NodeStyle = {
  shape: 'RoundedRect',
  fill_color: Color.fromHex('5BA5E6')!,
  stroke_color: Color.fromHex('3D7AB8')!,
  stroke_width: 1.5,
  font_family: DEFAULT_FONT_FAMILY,
  font_size: 14.0,
  font_color: Color.WHITE,
  padding_h: 16.0,
  padding_v: 10.0,
  min_width: 80.0,
  max_width: 250.0,
  corner_radius: 6.0
}

export const TOPIC_STYLE: NodeStyle = {
  shape: 'RoundedRect',
  fill_color: Color.fromHex('E8F0FE')!,
  stroke_color: Color.fromHex('A4C2E8')!,
  stroke_width: 1.0,
  font_family: DEFAULT_FONT_FAMILY,
  font_size: 12.0,
  font_color: Color.fromHex('333333')!,
  padding_h: 12.0,
  padding_v: 8.0,
  min_width: 60.0,
  max_width: 200.0,
  corner_radius: 4.0
}

export const DEFAULT_STYLES: DefaultStyles = {
  root: ROOT_STYLE,
  branch: BRANCH_STYLE,
  topic: TOPIC_STYLE
}

export const DEFAULT_EDGE_STYLE: EdgeStyle = {
  line_style: 'Bezier',
  color: Color.fromHex('888888')!,
  width: 2.0
}

export const DEFAULT_BOUNDARY_STYLE: BoundaryStyle = {
  shape: 'RoundedRect',
  fill_color: { r: 0.2, g: 0.45, b: 0.35, a: 0.08 },
  stroke_color: { r: 0.3, g: 0.6, b: 0.5, a: 0.5 },
  stroke_width: 1.5,
  padding: 10.0,
  font_family: DEFAULT_FONT_FAMILY
}
