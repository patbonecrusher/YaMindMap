import { describe, it, expect } from 'vitest'
import { toReactFlowNodes, toReactFlowEdges } from './utils/to-react-flow'
import { createDemoDocument } from '../shared/demo-document'
import { balancedLayout } from '../shared/layout/balanced'
import { measureNodeSizes } from '../shared/layout/text-measure'

describe('toReactFlowNodes', () => {
  it('produces correct number of nodes from demo document', () => {
    const doc = createDemoDocument()
    const sizes = measureNodeSizes(doc)
    const layout = balancedLayout(doc, sizes)
    const nodes = toReactFlowNodes(doc, layout, new Set())

    expect(nodes.length).toBe(10)
  })

  it('root node has correct data', () => {
    const doc = createDemoDocument()
    const sizes = measureNodeSizes(doc)
    const layout = balancedLayout(doc, sizes)
    const nodes = toReactFlowNodes(doc, layout, new Set())

    const root = nodes.find((n) => n.data.depth === 0)!
    expect(root).toBeDefined()
    expect(root.data.label).toBe('Central Topic')
    expect(root.data.shape).toBe('Ellipse')
    expect(root.data.fontSize).toBe(18)
  })

  it('branch nodes have correct depth', () => {
    const doc = createDemoDocument()
    const sizes = measureNodeSizes(doc)
    const layout = balancedLayout(doc, sizes)
    const nodes = toReactFlowNodes(doc, layout, new Set())

    const branches = nodes.filter((n) => n.data.depth === 1)
    expect(branches.length).toBe(3)
  })

  it('marks selected nodes', () => {
    const doc = createDemoDocument()
    const sizes = measureNodeSizes(doc)
    const layout = balancedLayout(doc, sizes)
    const selectedIds = new Set([doc.root_id!])
    const nodes = toReactFlowNodes(doc, layout, selectedIds)

    const root = nodes.find((n) => n.id === doc.root_id)!
    expect(root.data.isSelected).toBe(true)

    const others = nodes.filter((n) => n.id !== doc.root_id)
    for (const n of others) {
      expect(n.data.isSelected).toBe(false)
    }
  })
})

describe('toReactFlowEdges', () => {
  it('produces edges for all parent-child connections', () => {
    const doc = createDemoDocument()
    const sizes = measureNodeSizes(doc)
    const layout = balancedLayout(doc, sizes)
    const edges = toReactFlowEdges(doc, layout)

    // 9 edges: root->3 branches, b1->2 subs, b2->1 sub, b3->3 subs
    expect(edges.length).toBe(9)
  })
})
