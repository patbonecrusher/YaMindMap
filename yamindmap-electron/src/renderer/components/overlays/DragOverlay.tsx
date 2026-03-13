import { useStore } from '../../store'

export function DragOverlay() {
  const draggingNodeId = useStore((s) => s.draggingNodeId)
  const dropTargetNodeId = useStore((s) => s.dropTargetNodeId)
  const dragPosition = useStore((s) => s.dragPosition)
  const document = useStore((s) => s.document)

  if (!draggingNodeId || !dragPosition) return null

  const node = document.nodes.get(draggingNodeId)
  if (!node) return null

  // Ghost label at cursor
  const ghostLabel = node.content.text || '…'

  // Find drop target element position for the bezier line
  let targetCenter: { x: number; y: number } | null = null
  if (dropTargetNodeId) {
    const el = window.document.querySelector(`.react-flow__node[data-id="${dropTargetNodeId}"]`)
    if (el) {
      const rect = el.getBoundingClientRect()
      targetCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 998 }}>
      {/* Ghost node following cursor */}
      <div style={{
        position: 'absolute',
        left: dragPosition.x,
        top: dragPosition.y,
        transform: 'translate(-50%, -50%)',
        backgroundColor: '#4a90d9',
        color: '#fff',
        padding: '4px 12px',
        borderRadius: 6,
        fontSize: 13,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        opacity: 0.8,
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
      }}>
        {ghostLabel}
      </div>

      {/* Bezier line from cursor to drop target */}
      {targetCenter && (
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <path
            d={bezierPath(dragPosition.x, dragPosition.y, targetCenter.x, targetCenter.y)}
            fill="none"
            stroke="#FF9500"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        </svg>
      )}
    </div>
  )
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1) * 0.5
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}
