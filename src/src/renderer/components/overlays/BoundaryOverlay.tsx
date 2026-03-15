import { memo } from 'react'
import type { Document } from '../../../shared/types/document'
import type { Rect } from '../../../shared/types/geometry'
import type { NodeId } from '../../../shared/types/node'
import type { LayoutResult } from '../../../shared/layout/types'
import { Color } from '../../../shared/types/style'
import { BOUNDARY_CORNER_RADIUS, BOUNDARY_LABEL_FONT_SIZE, BOUNDARY_LABEL_PADDING } from '../../../shared/constants'

interface BoundaryOverlayProps {
  doc: Document
  layout: LayoutResult
}

function BoundaryOverlayComponent({ doc, layout }: BoundaryOverlayProps) {
  const boundaries = Array.from(doc.boundaries.values())
  if (boundaries.length === 0) return null

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible'
      }}
    >
      {boundaries.map((boundary) => {
        // Compute bounding rect of member nodes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        let hasNodes = false

        for (const nodeId of boundary.node_ids) {
          const rect = layout.positions.get(nodeId)
          if (!rect) continue
          hasNodes = true
          minX = Math.min(minX, rect.x)
          minY = Math.min(minY, rect.y)
          maxX = Math.max(maxX, rect.x + rect.width)
          maxY = Math.max(maxY, rect.y + rect.height)
        }

        if (!hasNodes) return null

        const pad = boundary.padding
        const bx = minX - pad
        const by = minY - pad
        const bw = maxX - minX + 2 * pad
        const bh = maxY - minY + 2 * pad

        return (
          <g key={boundary.id}>
            <rect
              x={bx}
              y={by}
              width={bw}
              height={bh}
              rx={BOUNDARY_CORNER_RADIUS}
              ry={BOUNDARY_CORNER_RADIUS}
              fill={Color.toCss(boundary.fill_color)}
              stroke={Color.toCss(boundary.stroke_color)}
              strokeWidth={boundary.stroke_width}
              strokeDasharray="8 8"
            />
            {boundary.label && (
              <>
                <rect
                  x={bx + 12 - BOUNDARY_LABEL_PADDING}
                  y={by - BOUNDARY_LABEL_FONT_SIZE / 2 - BOUNDARY_LABEL_PADDING}
                  width={boundary.label.length * BOUNDARY_LABEL_FONT_SIZE * 0.6 + 2 * BOUNDARY_LABEL_PADDING}
                  height={BOUNDARY_LABEL_FONT_SIZE + 2 * BOUNDARY_LABEL_PADDING}
                  rx={3}
                  fill="rgba(38, 38, 51, 0.9)"
                />
                <text
                  x={bx + 12}
                  y={by}
                  fill={Color.toCss(boundary.stroke_color)}
                  fontSize={BOUNDARY_LABEL_FONT_SIZE}
                  dominantBaseline="central"
                >
                  {boundary.label}
                </text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export const BoundaryOverlay = memo(BoundaryOverlayComponent)
