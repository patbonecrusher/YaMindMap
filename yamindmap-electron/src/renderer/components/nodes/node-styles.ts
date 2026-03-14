import type { CSSProperties } from 'react'
import type { MindMapNodeData } from '../../utils/to-react-flow'
import { SELECTION_STROKE_COLOR, SELECTION_STROKE_EXTRA } from '../../../shared/constants'
import { Color } from '../../../shared/types/style'

const SELECTION_CSS = Color.toCss(SELECTION_STROKE_COLOR)

export function getNodeStyle(data: MindMapNodeData, isHovered = false): CSSProperties {
  const base: CSSProperties = {
    backgroundColor: data.fillColor,
    color: data.fontColor,
    fontSize: `${data.fontSize}px`,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    lineHeight: 1.3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: data.shape === 'Ellipse' || data.shape === 'Diamond' ? 'center' : 'flex-start',
    width: '100%',
    height: '100%',
    padding: '0 12px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    wordBreak: 'break-word',
    cursor: 'default',
    userSelect: 'none'
  }

  // Border — always same width to prevent text shift on selection
  base.border = `${data.strokeWidth}px solid ${data.strokeColor}`
  base.transition = 'box-shadow 0.15s ease'

  if (data.isSelected) {
    base.boxShadow = `0 0 0 ${SELECTION_STROKE_EXTRA}px ${SELECTION_CSS}`
  } else if (isHovered) {
    base.boxShadow = `0 0 0 2px ${SELECTION_CSS}`
  }

  // Shape
  switch (data.shape) {
    case 'Ellipse':
      base.borderRadius = '50%'
      break
    case 'Diamond':
      base.borderRadius = '4px'
      base.transform = 'rotate(45deg)'
      base.overflow = 'visible'
      break
    case 'Capsule':
      base.borderRadius = '9999px'
      break
    case 'Underline':
      base.border = 'none'
      base.borderBottom = `${data.strokeWidth}px solid ${data.strokeColor}`
      base.borderRadius = '0'
      break
    case 'RoundedRect':
    default:
      base.borderRadius = `${data.cornerRadius}px`
      break
  }

  return base
}

export function getDiamondContentStyle(): CSSProperties {
  return {
    transform: 'rotate(-45deg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%'
  }
}
