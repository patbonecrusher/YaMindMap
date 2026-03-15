import { memo } from 'react'
import { BaseEdge, type EdgeProps } from '@xyflow/react'
import type { LineStyle } from '../../../shared/types/style'

interface BezierEdgeData {
  fromX: number
  fromY: number
  ctrl1X: number
  ctrl1Y: number
  ctrl2X: number
  ctrl2Y: number
  toX: number
  toY: number
  color: string
  width: number
  lineStyle: LineStyle
  [key: string]: unknown
}

function buildPath(data: BezierEdgeData): string {
  const { fromX, fromY, ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, toX, toY } = data

  switch (data.lineStyle) {
    case 'Straight':
      return `M ${fromX} ${fromY} L ${toX} ${toY}`

    case 'Elbow': {
      const midX = (fromX + toX) / 2
      return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`
    }

    case 'Rounded': {
      const midX = (fromX + toX) / 2
      const r = Math.min(8, Math.abs(toY - fromY) / 2, Math.abs(midX - fromX))
      const dy = toY > fromY ? 1 : -1
      const dx = toX > fromX ? 1 : -1
      return `M ${fromX} ${fromY} L ${midX - r * dx} ${fromY} Q ${midX} ${fromY} ${midX} ${fromY + r * dy} L ${midX} ${toY - r * dy} Q ${midX} ${toY} ${midX + r * dx} ${toY} L ${toX} ${toY}`
    }

    case 'Bezier':
    default:
      return `M ${fromX} ${fromY} C ${ctrl1X} ${ctrl1Y}, ${ctrl2X} ${ctrl2Y}, ${toX} ${toY}`
  }
}

function BezierEdgeComponent({ id, data, style }: EdgeProps<BezierEdgeData>) {
  if (!data) return null

  const path = buildPath(data)

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{ stroke: data.color, strokeWidth: data.width, fill: 'none', ...style }}
    />
  )
}

export const BezierEdge = memo(BezierEdgeComponent)
