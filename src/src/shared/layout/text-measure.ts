import type { NodeId } from '../types/node'
import type { Size } from '../types/geometry'
import type { Document } from '../types/document'
import type { NodeStyle } from '../types/style'
import type { NodeSizeMap } from './types'
import { styleForDepth, mergeStyles } from '../types/style'
import { depthOf } from '../document-ops'
import { SIDE_COLUMN_WIDTH, LINE_HEIGHT_FACTOR, ELLIPSE_SCALE, DEFAULT_FONT_FAMILY } from '../constants'

/**
 * Measure node sizes using an offscreen Canvas 2D context.
 * In a browser environment, creates a canvas element for measureText.
 * In test environment, uses a simple character-width approximation.
 */
export function measureNodeSizes(doc: Document, ctx?: CanvasRenderingContext2D): NodeSizeMap {
  const sizes = new Map<NodeId, Size>()

  for (const [id, node] of doc.nodes) {
    const depth = depthOf(doc, id)
    const defaultStyle = styleForDepth(doc.default_styles, depth)
    const style = mergeStyles(node.style, defaultStyle)

    const fontSize = style.font_size ?? 14
    const paddingH = style.padding_h ?? 16
    const paddingV = style.padding_v ?? 10
    const minWidth = style.min_width ?? 60
    const maxWidth = style.max_width ?? 200

    const sideColumn = node.content.attachments.length > 0 ? SIDE_COLUMN_WIDTH : 0

    // Measure text width
    let textWidth: number
    if (ctx) {
      const fontFamily = style.font_family ?? DEFAULT_FONT_FAMILY
      ctx.font = `${fontSize}px ${fontFamily}`
      textWidth = ctx.measureText(node.content.text).width
    } else {
      // Approximation for testing: ~0.6 * fontSize per character
      textWidth = node.content.text.length * fontSize * 0.6
    }

    let width = Math.min(
      Math.max(textWidth + 2 * paddingH + sideColumn, minWidth),
      maxWidth
    )

    // Scale for ellipse shape
    if (style.shape === 'Ellipse') {
      width *= ELLIPSE_SCALE
      width = Math.max(width, minWidth)
    }

    // Apply manual width override
    if (node.manual_width !== null) {
      width = Math.max(node.manual_width, minWidth)
    }

    // Measure wrapped text height based on final width
    const usableWidth = width - 2 * paddingH - sideColumn
    const lineHeight = fontSize * LINE_HEIGHT_FACTOR
    const lines = Math.max(1, Math.ceil(textWidth / Math.max(usableWidth, 1)))
    let height = lines * lineHeight + 2 * paddingV

    if (style.shape === 'Ellipse') {
      height *= ELLIPSE_SCALE
    }

    sizes.set(id, { width, height })
  }

  return {
    get(id: NodeId) {
      return sizes.get(id)
    }
  }
}
