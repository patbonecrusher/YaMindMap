import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Document } from '../../shared/types/document'
import type { LayoutResult } from '../../shared/layout/types'
import { useStore } from '../store'
import { useNodeInteraction } from '../hooks/useNodeInteraction'
import { MindMapNode } from './nodes/MindMapNode'
import { BezierEdge } from './edges/BezierEdge'
import { toReactFlowNodes, toReactFlowEdges } from '../utils/to-react-flow'

const nodeTypes = { mindMapNode: MindMapNode }
const edgeTypes = { bezierEdge: BezierEdge }

interface MindMapCanvasProps {
  doc: Document
  layout: LayoutResult
}

export function MindMapCanvas({ doc, layout }: MindMapCanvasProps) {
  const selectedNodeIds = useStore((s) => s.selectedNodeIds)
  const { onNodeClick, onNodeDoubleClick, onNodeContextMenu, onPaneClick } = useNodeInteraction()

  const nodes = useMemo(
    () => toReactFlowNodes(doc, layout, selectedNodeIds),
    [doc, layout, selectedNodeIds]
  )

  const edges = useMemo(
    () => toReactFlowEdges(doc, layout),
    [doc, layout]
  )



  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        selectNodesOnDrag={false}
        panOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        zoomActivationKeyCode="Meta"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e0e0e0" />
      </ReactFlow>
    </div>
  )
}
