import { memo, useCallback } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { BoundaryNodeData } from '../../utils/to-react-flow'
import { useStore } from '../../store'
import { BOUNDARY_CORNER_RADIUS } from '../../../shared/constants'

function renderBoundaryShape(d: BoundaryNodeData): React.ReactNode {
  const w = d.boundaryWidth
  const h = d.boundaryHeight
  const stroke = d.isSelected ? '#FF9500' : d.strokeColor
  const sw = d.isSelected ? 2 : d.strokeWidth

  switch (d.shape) {
    case 'Ellipse':
      return (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={w / 2 - 1}
          ry={h / 2 - 1}
          fill={d.fillColor}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray="8 8"
        />
      )

    case 'Pill':
      return (
        <rect
          x={1}
          y={1}
          width={w - 2}
          height={h - 2}
          rx={Math.min(w, h) / 2}
          ry={Math.min(w, h) / 2}
          fill={d.fillColor}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray="8 8"
        />
      )

    case 'Bracket': {
      const bracketW = 12
      const r = 6
      // Left bracket
      const leftPath = `M ${bracketW} ${1} L ${1 + r} ${1} Q ${1} ${1} ${1} ${1 + r} L ${1} ${h - 1 - r} Q ${1} ${h - 1} ${1 + r} ${h - 1} L ${bracketW} ${h - 1}`
      // Right bracket
      const rightPath = `M ${w - bracketW} ${1} L ${w - 1 - r} ${1} Q ${w - 1} ${1} ${w - 1} ${1 + r} L ${w - 1} ${h - 1 - r} Q ${w - 1} ${h - 1} ${w - 1 - r} ${h - 1} L ${w - bracketW} ${h - 1}`
      return (
        <>
          <rect
            x={1}
            y={1}
            width={w - 2}
            height={h - 2}
            fill={d.fillColor}
            stroke="none"
            rx={BOUNDARY_CORNER_RADIUS}
          />
          <path d={leftPath} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <path d={rightPath} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </>
      )
    }

    case 'RoundedRect':
    default:
      return (
        <rect
          x={1}
          y={1}
          width={w - 2}
          height={h - 2}
          rx={BOUNDARY_CORNER_RADIUS}
          ry={BOUNDARY_CORNER_RADIUS}
          fill={d.fillColor}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray="8 8"
        />
      )
  }
}

function BoundaryNodeComponent({ data }: NodeProps) {
  const d = data as BoundaryNodeData
  const selectBoundary = useStore((s) => s.selectBoundary)

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    selectBoundary(d.boundaryId)
  }, [d.boundaryId, selectBoundary])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('edit-boundary-label', { detail: d.boundaryId }))
  }, [d.boundaryId])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    selectBoundary(d.boundaryId)
    window.dispatchEvent(new CustomEvent('boundary-context-menu', {
      detail: { boundaryId: d.boundaryId, x: e.clientX, y: e.clientY }
    }))
  }, [d.boundaryId, selectBoundary])

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      style={{
        width: d.boundaryWidth,
        height: d.boundaryHeight,
        position: 'relative',
        cursor: 'pointer',
        overflow: 'visible'
      }}
    >
      <svg
        width={d.boundaryWidth}
        height={d.boundaryHeight}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
      >
        {renderBoundaryShape(d)}
        {d.showLabel && d.label && (() => {
          const labelFontSize = 11
          const labelPadH = 12
          const labelPadV = 4
          const labelWidth = d.label.length * labelFontSize * 0.65 + 2 * labelPadH
          const labelHeight = labelFontSize + 2 * labelPadV
          const labelX = BOUNDARY_CORNER_RADIUS + 8
          const labelY = -labelHeight + d.strokeWidth / 2
          const r = BOUNDARY_CORNER_RADIUS
          const path = `M ${labelX} ${labelY + labelHeight}
            v ${-(labelHeight - r)}
            a ${r} ${r} 0 0 1 ${r} ${-r}
            h ${labelWidth - 2 * r}
            a ${r} ${r} 0 0 1 ${r} ${r}
            v ${labelHeight - r}`
          return (
            <>
              <path
                d={path}
                fill={d.strokeColor}
                stroke="none"
              />
              <text
                x={labelX + labelWidth / 2}
                y={labelY + labelHeight / 2}
                fill="#1a1a2e"
                fontSize={labelFontSize}
                fontFamily={d.fontFamily}
                fontWeight={500}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {d.label}
              </text>
            </>
          )
        })()}
      </svg>
    </div>
  )
}

export const BoundaryNode = memo(BoundaryNodeComponent)
