import { useMemo, useRef, useEffect, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Document } from '../../shared/types/document'
import type { LayoutResult } from '../../shared/layout/types'
import { useStore } from '../store'
import { useNodeInteraction, setSuppressPaneClick } from '../hooks/useNodeInteraction'
import { MindMapNode } from './nodes/MindMapNode'
import { BoundaryNode } from './nodes/BoundaryNode'
import { BezierEdge } from './edges/BezierEdge'
import { toReactFlowNodes, toReactFlowEdges } from '../utils/to-react-flow'
import { RubberBandOverlay } from './overlays/RubberBandOverlay'

const nodeTypes = { mindMapNode: MindMapNode, boundaryNode: BoundaryNode }
const edgeTypes = { bezierEdge: BezierEdge }

interface MindMapCanvasProps {
  doc: Document
  layout: LayoutResult
}

function rectsIntersect(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

export function MindMapCanvas({ doc, layout }: MindMapCanvasProps) {
  const selectedNodeIds = useStore((s) => s.selectedNodeIds)
  const selectedBoundaryId = useStore((s) => s.selectedBoundaryId)
  const pendingViewState = useStore((s) => s.pendingViewState)
  const rubberBandStart = useStore((s) => s.rubberBandStart)
  const rubberBandCurrent = useStore((s) => s.rubberBandCurrent)
  const { onNodeClick, onNodeDoubleClick, onNodeContextMenu, onPaneClick } = useNodeInteraction()
  const { setViewport, screenToFlowPosition } = useReactFlow()
  const appliedViewState = useRef(false)
  const isRubberBanding = useRef(false)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const nodes = useMemo(
    () => toReactFlowNodes(doc, layout, selectedNodeIds, selectedBoundaryId),
    [doc, layout, selectedNodeIds, selectedBoundaryId]
  )

  const edges = useMemo(
    () => toReactFlowEdges(doc, layout),
    [doc, layout]
  )

  // Apply pending view state after nodes are rendered
  useEffect(() => {
    if (pendingViewState && !appliedViewState.current) {
      appliedViewState.current = true
      const timer = setTimeout(() => {
        setViewport({
          x: pendingViewState.translation[0],
          y: pendingViewState.translation[1],
          zoom: pendingViewState.scale
        }, { duration: 0 })
        useStore.setState({ pendingViewState: null })
      }, 150)
      return () => clearTimeout(timer)
    }
    if (!pendingViewState) {
      appliedViewState.current = false
    }
  }, [pendingViewState, setViewport])

  // Rubber-band selection
  const rubberBandOrigin = useRef<{ x: number; y: number } | null>(null)
  const rubberBandActive = useRef(false)
  const capturedElement = useRef<HTMLElement | null>(null)
  const capturedPointerId = useRef<number | null>(null)

  const getIntersectingNodes = useCallback((startScreen: { x: number; y: number }, endScreen: { x: number; y: number }): string[] => {
    const flowStart = screenToFlowPosition({ x: Math.min(startScreen.x, endScreen.x), y: Math.min(startScreen.y, endScreen.y) })
    const flowEnd = screenToFlowPosition({ x: Math.max(startScreen.x, endScreen.x), y: Math.max(startScreen.y, endScreen.y) })
    const result: string[] = []
    for (const [nodeId, rect] of layoutRef.current.positions) {
      if (rectsIntersect(flowStart.x, flowStart.y, flowEnd.x - flowStart.x, flowEnd.y - flowStart.y, rect.x, rect.y, rect.width, rect.height)) {
        result.push(nodeId)
      }
    }
    return result
  }, [screenToFlowPosition])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (e.metaKey || e.ctrlKey) return

    const target = e.target as HTMLElement
    if (target.closest('.react-flow__node') || target.closest('.react-flow__edge')) return
    if (!target.closest('.react-flow__pane')) return

    // Record origin but don't activate rubber band yet (wait for 5px threshold)
    rubberBandOrigin.current = { x: e.clientX, y: e.clientY }
    rubberBandActive.current = false
    capturedElement.current = e.currentTarget as HTMLElement
    capturedPointerId.current = e.pointerId
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!rubberBandOrigin.current) return

    const dx = Math.abs(e.clientX - rubberBandOrigin.current.x)
    const dy = Math.abs(e.clientY - rubberBandOrigin.current.y)

    // Activate rubber band after 5px threshold
    if (!rubberBandActive.current) {
      if (dx < 5 && dy < 5) return
      rubberBandActive.current = true
      if (capturedElement.current && capturedPointerId.current !== null) {
        capturedElement.current.setPointerCapture(capturedPointerId.current)
      }
      useStore.getState().setRubberBandStart(rubberBandOrigin.current)
    }

    const current = { x: e.clientX, y: e.clientY }
    useStore.getState().setRubberBandCurrent(current)

    // Live-preview: select nodes that intersect the rubber band
    const intersecting = getIntersectingNodes(rubberBandOrigin.current, current)
    useStore.getState().selectMultiple(intersecting)
  }, [getIntersectingNodes])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!rubberBandOrigin.current) return

    const wasActive = rubberBandActive.current
    rubberBandOrigin.current = null
    rubberBandActive.current = false

    if (capturedElement.current && capturedPointerId.current !== null) {
      try { capturedElement.current.releasePointerCapture(capturedPointerId.current) } catch { /* ignore */ }
    }
    capturedElement.current = null
    capturedPointerId.current = null

    useStore.getState().setRubberBandStart(null)
    useStore.getState().setRubberBandCurrent(null)

    if (wasActive) {
      // Rubber-band finished — selection was already set during move, just suppress pane click
      setSuppressPaneClick()
    } else {
      // Simple click on empty space — clear selection
      useStore.getState().clearSelection()
      useStore.getState().closeContextMenu()
      setSuppressPaneClick()
    }
  }, [getIntersectingNodes])

  const shouldFitView = !pendingViewState

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        fitView={shouldFitView}
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        selectNodesOnDrag={false}
        panOnDrag={false}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        zoomActivationKeyCode="Meta"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e0e0e0" />
      </ReactFlow>
      {rubberBandStart && rubberBandCurrent && (
        <RubberBandOverlay
          startX={rubberBandStart.x}
          startY={rubberBandStart.y}
          currentX={rubberBandCurrent.x}
          currentY={rubberBandCurrent.y}
        />
      )}
    </div>
  )
}
