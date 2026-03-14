export interface Color {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

export const Color = {
  rgb(r: number, g: number, b: number): Color {
    return { r, g, b, a: 1.0 }
  },

  rgba(r: number, g: number, b: number, a: number): Color {
    return { r, g, b, a }
  },

  fromHex(hex: string): Color | null {
    const clean = hex.startsWith('#') ? hex.slice(1) : hex
    if (clean.length !== 6) return null
    const n = parseInt(clean, 16)
    if (isNaN(n)) return null
    return {
      r: ((n >> 16) & 0xff) / 255,
      g: ((n >> 8) & 0xff) / 255,
      b: (n & 0xff) / 255,
      a: 1.0
    }
  },

  toCss(c: Color): string {
    const r = Math.round(c.r * 255)
    const g = Math.round(c.g * 255)
    const b = Math.round(c.b * 255)
    if (c.a >= 1.0) return `rgb(${r}, ${g}, ${b})`
    return `rgba(${r}, ${g}, ${b}, ${c.a.toFixed(2)})`
  },

  toHex(c: Color): string {
    const r = Math.round(c.r * 255).toString(16).padStart(2, '0')
    const g = Math.round(c.g * 255).toString(16).padStart(2, '0')
    const b = Math.round(c.b * 255).toString(16).padStart(2, '0')
    return `#${r}${g}${b}`
  },

  WHITE: { r: 1, g: 1, b: 1, a: 1 } as Color,
  BLACK: { r: 0, g: 0, b: 0, a: 1 } as Color,
  TRANSPARENT: { r: 0, g: 0, b: 0, a: 0 } as Color
}

export type NodeShape = 'RoundedRect' | 'Ellipse' | 'Diamond' | 'Capsule' | 'Underline'

export type LineStyle = 'Bezier' | 'Straight' | 'Elbow' | 'Rounded'

export type RichStyle =
  | { type: 'Bold' }
  | { type: 'Italic' }
  | { type: 'Underline' }
  | { type: 'Color'; r: number; g: number; b: number }
  | { type: 'FontSize'; size: number }

export interface RichSpan {
  readonly start: number
  readonly end: number
  readonly style: RichStyle
}

/** Per-node style overrides. All fields optional — merged with depth defaults. */
export interface NodeStyle {
  readonly shape?: NodeShape
  readonly fill_color?: Color
  readonly stroke_color?: Color
  readonly stroke_width?: number
  readonly font_family?: string
  readonly font_size?: number
  readonly font_color?: Color
  readonly padding_h?: number
  readonly padding_v?: number
  readonly min_width?: number
  readonly max_width?: number
  readonly corner_radius?: number
}

/** Merge two NodeStyle objects. `override` values take priority, gaps filled from `base`. */
export function mergeStyles(override: NodeStyle, base: NodeStyle): NodeStyle {
  return {
    shape: override.shape ?? base.shape,
    fill_color: override.fill_color ?? base.fill_color,
    stroke_color: override.stroke_color ?? base.stroke_color,
    stroke_width: override.stroke_width ?? base.stroke_width,
    font_family: override.font_family ?? base.font_family,
    font_size: override.font_size ?? base.font_size,
    font_color: override.font_color ?? base.font_color,
    padding_h: override.padding_h ?? base.padding_h,
    padding_v: override.padding_v ?? base.padding_v,
    min_width: override.min_width ?? base.min_width,
    max_width: override.max_width ?? base.max_width,
    corner_radius: override.corner_radius ?? base.corner_radius
  }
}

export interface EdgeStyle {
  readonly line_style: LineStyle
  readonly color: Color
  readonly width: number
}

export interface DefaultStyles {
  readonly root: NodeStyle
  readonly branch: NodeStyle
  readonly topic: NodeStyle
}

export function styleForDepth(styles: DefaultStyles, depth: number): NodeStyle {
  if (depth === 0) return styles.root
  if (depth === 1) return styles.branch
  return styles.topic
}
