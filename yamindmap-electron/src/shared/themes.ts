import type { DefaultStyles, EdgeStyle } from './types/style'
import type { BoundaryStyle } from './types/boundary'
import { Color } from './types/style'

export interface ThemePreset {
  readonly name: string
  readonly styles: DefaultStyles
  readonly edge: EdgeStyle
  readonly boundary: BoundaryStyle
  readonly background: Color
}

export const THEME_DEFAULT_BLUE: ThemePreset = {
  name: 'Default Blue',
  styles: {
    root: {
      shape: 'Ellipse',
      fill_color: Color.fromHex('4A90D9')!,
      stroke_color: Color.fromHex('2C5F8A')!,
      stroke_width: 2.0,
      font_size: 18.0,
      font_color: Color.WHITE,
      padding_h: 24.0,
      padding_v: 16.0,
      min_width: 120.0,
      max_width: 300.0,
      corner_radius: 8.0
    },
    branch: {
      shape: 'RoundedRect',
      fill_color: Color.fromHex('5BA5E6')!,
      stroke_color: Color.fromHex('3D7AB8')!,
      stroke_width: 1.5,
      font_size: 14.0,
      font_color: Color.WHITE,
      padding_h: 16.0,
      padding_v: 10.0,
      min_width: 80.0,
      max_width: 250.0,
      corner_radius: 6.0
    },
    topic: {
      shape: 'RoundedRect',
      fill_color: Color.fromHex('E8F0FE')!,
      stroke_color: Color.fromHex('A4C2E8')!,
      stroke_width: 1.0,
      font_size: 12.0,
      font_color: Color.fromHex('333333')!,
      padding_h: 12.0,
      padding_v: 8.0,
      min_width: 60.0,
      max_width: 200.0,
      corner_radius: 4.0
    }
  },
  edge: { line_style: 'Bezier', color: Color.fromHex('888888')!, width: 2.0 },
  boundary: {
    fill_color: { r: 0.2, g: 0.45, b: 0.35, a: 0.08 },
    stroke_color: { r: 0.3, g: 0.6, b: 0.5, a: 0.5 },
    stroke_width: 1.5,
    padding: 10.0
  },
  background: Color.WHITE
}

export const THEME_DARK: ThemePreset = {
  name: 'Dark',
  styles: {
    root: {
      shape: 'Ellipse',
      fill_color: Color.fromHex('2D2D3D')!,
      stroke_color: Color.fromHex('6C6CE0')!,
      stroke_width: 2.0,
      font_size: 18.0,
      font_color: Color.fromHex('E0E0FF')!,
      padding_h: 24.0,
      padding_v: 16.0,
      min_width: 120.0,
      max_width: 300.0,
      corner_radius: 8.0
    },
    branch: {
      shape: 'RoundedRect',
      fill_color: Color.fromHex('353548')!,
      stroke_color: Color.fromHex('5858A8')!,
      stroke_width: 1.5,
      font_size: 14.0,
      font_color: Color.fromHex('D0D0E8')!,
      padding_h: 16.0,
      padding_v: 10.0,
      min_width: 80.0,
      max_width: 250.0,
      corner_radius: 6.0
    },
    topic: {
      shape: 'RoundedRect',
      fill_color: Color.fromHex('2A2A38')!,
      stroke_color: Color.fromHex('484868')!,
      stroke_width: 1.0,
      font_size: 12.0,
      font_color: Color.fromHex('B8B8D0')!,
      padding_h: 12.0,
      padding_v: 8.0,
      min_width: 60.0,
      max_width: 200.0,
      corner_radius: 4.0
    }
  },
  edge: { line_style: 'Bezier', color: Color.fromHex('5858A8')!, width: 2.0 },
  boundary: {
    fill_color: { r: 0.25, g: 0.25, b: 0.4, a: 0.15 },
    stroke_color: { r: 0.4, g: 0.4, b: 0.65, a: 0.7 },
    stroke_width: 1.5,
    padding: 10.0
  },
  background: Color.fromHex('1a1a2e')!
}

export const THEME_MINIMAL: ThemePreset = {
  name: 'Minimal',
  styles: {
    root: {
      shape: 'RoundedRect',
      fill_color: Color.WHITE,
      stroke_color: Color.fromHex('CCCCCC')!,
      stroke_width: 1.5,
      font_size: 18.0,
      font_color: Color.fromHex('333333')!,
      padding_h: 24.0,
      padding_v: 16.0,
      min_width: 120.0,
      max_width: 300.0,
      corner_radius: 8.0
    },
    branch: {
      shape: 'RoundedRect',
      fill_color: Color.fromHex('F5F5F5')!,
      stroke_color: Color.fromHex('DDDDDD')!,
      stroke_width: 1.0,
      font_size: 14.0,
      font_color: Color.fromHex('444444')!,
      padding_h: 16.0,
      padding_v: 10.0,
      min_width: 80.0,
      max_width: 250.0,
      corner_radius: 6.0
    },
    topic: {
      shape: 'Underline',
      fill_color: Color.TRANSPARENT,
      stroke_color: Color.fromHex('BBBBBB')!,
      stroke_width: 1.0,
      font_size: 12.0,
      font_color: Color.fromHex('555555')!,
      padding_h: 12.0,
      padding_v: 8.0,
      min_width: 60.0,
      max_width: 200.0,
      corner_radius: 0.0
    }
  },
  edge: { line_style: 'Bezier', color: Color.fromHex('BBBBBB')!, width: 1.5 },
  boundary: {
    fill_color: { r: 0.85, g: 0.85, b: 0.85, a: 0.1 },
    stroke_color: { r: 0.75, g: 0.75, b: 0.75, a: 0.5 },
    stroke_width: 1.0,
    padding: 10.0
  },
  background: Color.fromHex('FAFAFA')!
}

export const THEME_COLORFUL: ThemePreset = {
  name: 'Colorful',
  styles: {
    root: {
      shape: 'Ellipse',
      fill_color: Color.fromHex('FF6B6B')!,
      stroke_color: Color.fromHex('CC4444')!,
      stroke_width: 2.0,
      font_size: 18.0,
      font_color: Color.WHITE,
      padding_h: 24.0,
      padding_v: 16.0,
      min_width: 120.0,
      max_width: 300.0,
      corner_radius: 8.0
    },
    branch: {
      shape: 'Capsule',
      fill_color: Color.fromHex('4ECDC4')!,
      stroke_color: Color.fromHex('2EAA9E')!,
      stroke_width: 1.5,
      font_size: 14.0,
      font_color: Color.WHITE,
      padding_h: 16.0,
      padding_v: 10.0,
      min_width: 80.0,
      max_width: 250.0,
      corner_radius: 6.0
    },
    topic: {
      shape: 'RoundedRect',
      fill_color: Color.fromHex('FFE66D')!,
      stroke_color: Color.fromHex('D4BC3A')!,
      stroke_width: 1.0,
      font_size: 12.0,
      font_color: Color.fromHex('333333')!,
      padding_h: 12.0,
      padding_v: 8.0,
      min_width: 60.0,
      max_width: 200.0,
      corner_radius: 4.0
    }
  },
  edge: { line_style: 'Bezier', color: Color.fromHex('95E1D3')!, width: 2.5 },
  boundary: {
    fill_color: { r: 1.0, g: 0.85, b: 0.4, a: 0.1 },
    stroke_color: { r: 1.0, g: 0.7, b: 0.2, a: 0.6 },
    stroke_width: 1.5,
    padding: 10.0
  },
  background: Color.fromHex('FFFDF5')!
}

export const BUILT_IN_THEMES: ThemePreset[] = [
  THEME_DEFAULT_BLUE,
  THEME_DARK,
  THEME_MINIMAL,
  THEME_COLORFUL
]
