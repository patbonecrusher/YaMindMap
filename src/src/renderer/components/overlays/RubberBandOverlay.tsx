import { memo } from 'react'

interface RubberBandOverlayProps {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

function RubberBandOverlayComponent({ startX, startY, currentX, currentY }: RubberBandOverlayProps) {
  const x = Math.min(startX, currentX)
  const y = Math.min(startY, currentY)
  const width = Math.abs(currentX - startX)
  const height = Math.abs(currentY - startY)

  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        width,
        height,
        border: '1px solid rgba(255, 149, 0, 0.8)',
        backgroundColor: 'rgba(255, 149, 0, 0.1)',
        pointerEvents: 'none',
        zIndex: 999
      }}
    />
  )
}

export const RubberBandOverlay = memo(RubberBandOverlayComponent)
