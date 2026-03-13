import { memo } from 'react'
import { BaseEdge, type EdgeProps } from '@xyflow/react'

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
  [key: string]: unknown
}

function BezierEdgeComponent({ id, data, style }: EdgeProps<BezierEdgeData>) {
  if (!data) return null

  const path = `M ${data.fromX} ${data.fromY} C ${data.ctrl1X} ${data.ctrl1Y}, ${data.ctrl2X} ${data.ctrl2Y}, ${data.toX} ${data.toY}`

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{ stroke: data.color, strokeWidth: data.width, ...style }}
    />
  )
}

export const BezierEdge = memo(BezierEdgeComponent)
