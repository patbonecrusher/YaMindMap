import { describe, it, expect } from 'vitest'
import { Color, mergeStyles, styleForDepth } from './style'
import { DEFAULT_STYLES } from '../defaults'

describe('Color', () => {
  it('fromHex parses 6-digit hex', () => {
    const c = Color.fromHex('4A90D9')!
    expect(c.r).toBeCloseTo(74 / 255)
    expect(c.g).toBeCloseTo(144 / 255)
    expect(c.b).toBeCloseTo(217 / 255)
    expect(c.a).toBe(1.0)
  })

  it('fromHex handles # prefix', () => {
    const c = Color.fromHex('#FF0000')!
    expect(c.r).toBeCloseTo(1.0)
    expect(c.g).toBeCloseTo(0)
    expect(c.b).toBeCloseTo(0)
  })

  it('fromHex returns null for invalid input', () => {
    expect(Color.fromHex('xyz')).toBeNull()
    expect(Color.fromHex('12345')).toBeNull()
  })

  it('toCss formats rgb correctly', () => {
    expect(Color.toCss(Color.WHITE)).toBe('rgb(255, 255, 255)')
    expect(Color.toCss(Color.BLACK)).toBe('rgb(0, 0, 0)')
  })

  it('toCss formats rgba when alpha < 1', () => {
    const c = Color.rgba(1, 0, 0, 0.5)
    expect(Color.toCss(c)).toBe('rgba(255, 0, 0, 0.50)')
  })

  it('rgb creates opaque color', () => {
    const c = Color.rgb(0.5, 0.5, 0.5)
    expect(c.a).toBe(1.0)
  })
})

describe('mergeStyles', () => {
  it('override takes priority', () => {
    const base = { font_size: 14, padding_h: 16 }
    const over = { font_size: 18 }
    const result = mergeStyles(over, base)
    expect(result.font_size).toBe(18)
    expect(result.padding_h).toBe(16)
  })

  it('fills gaps from base', () => {
    const result = mergeStyles({}, { shape: 'Ellipse', font_size: 12 })
    expect(result.shape).toBe('Ellipse')
    expect(result.font_size).toBe(12)
  })
})

describe('styleForDepth', () => {
  it('returns root style for depth 0', () => {
    expect(styleForDepth(DEFAULT_STYLES, 0)).toBe(DEFAULT_STYLES.root)
  })

  it('returns branch style for depth 1', () => {
    expect(styleForDepth(DEFAULT_STYLES, 1)).toBe(DEFAULT_STYLES.branch)
  })

  it('returns topic style for depth 2+', () => {
    expect(styleForDepth(DEFAULT_STYLES, 2)).toBe(DEFAULT_STYLES.topic)
    expect(styleForDepth(DEFAULT_STYLES, 5)).toBe(DEFAULT_STYLES.topic)
  })
})
