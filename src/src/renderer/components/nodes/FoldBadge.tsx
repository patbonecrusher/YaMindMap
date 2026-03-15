import { memo, useState, useCallback } from 'react'
import { useStore } from '../../store'
import { Color } from '../../../shared/types/style'
import {
  FOLD_BADGE_RADIUS,
  FOLD_COLLAPSED_COLOR,
  FOLD_EXPANDED_HOVER_COLOR,
  FOLD_COLLAPSED_FONT_SIZE,
  FOLD_EXPANDED_FONT_SIZE
} from '../../../shared/constants'

interface FoldBadgeProps {
  nodeId: string
  collapsed: boolean
  childCount: number
  /** 'left' or 'right' — which side the children are on */
  side: 'left' | 'right'
}

const SIZE = FOLD_BADGE_RADIUS * 2

function FoldBadgeComponent({ nodeId, collapsed, childCount, side }: FoldBadgeProps) {
  const [hovered, setHovered] = useState(false)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      useStore.getState().updateDocument((doc) => {
        const node = doc.nodes.get(nodeId)
        if (node) node.collapsed = !node.collapsed
      })
    },
    [nodeId]
  )

  // Only show when collapsed, or hovered when expanded
  if (!collapsed && !hovered) {
    return (
      <div
        style={{
          position: 'absolute',
          top: '50%',
          [side === 'right' ? 'right' : 'left']: -SIZE - 4,
          transform: 'translateY(-50%)',
          width: SIZE + 8,
          height: SIZE + 8,
          cursor: 'pointer'
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
    )
  }

  const bgColor = collapsed
    ? Color.toCss(FOLD_COLLAPSED_COLOR)
    : Color.toCss(FOLD_EXPANDED_HOVER_COLOR)

  const fontSize = collapsed ? FOLD_COLLAPSED_FONT_SIZE : FOLD_EXPANDED_FONT_SIZE
  const label = collapsed ? String(childCount) : '−'

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        [side === 'right' ? 'right' : 'left']: -SIZE - 4,
        transform: 'translateY(-50%)',
        width: SIZE,
        height: SIZE,
        borderRadius: '50%',
        backgroundColor: bgColor,
        color: '#fff',
        fontSize,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        lineHeight: 1
      }}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label}
    </div>
  )
}

export const FoldBadge = memo(FoldBadgeComponent)
