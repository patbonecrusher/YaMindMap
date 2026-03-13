import { describe, it, expect } from 'vitest'
import { createDemoDocument } from './demo-document'

describe('createDemoDocument', () => {
  it('creates correct tree structure', () => {
    const doc = createDemoDocument()

    expect(doc.root_id).toBeTruthy()
    expect(doc.nodes.size).toBe(10)

    const root = doc.nodes.get(doc.root_id!)!
    expect(root.content.text).toBe('Central Topic')
    expect(root.children.length).toBe(3)
    expect(root.parent).toBeNull()
    expect(root.style.shape).toBe('Ellipse')
  })

  it('has correct branch structure', () => {
    const doc = createDemoDocument()
    const root = doc.nodes.get(doc.root_id!)!

    const branch1 = doc.nodes.get(root.children[0])!
    expect(branch1.content.text).toBe('Branch 1')
    expect(branch1.children.length).toBe(2)
    expect(branch1.parent).toBe(doc.root_id)

    const branch2 = doc.nodes.get(root.children[1])!
    expect(branch2.content.text).toBe('Branch 2')
    expect(branch2.children.length).toBe(1)

    const branch3 = doc.nodes.get(root.children[2])!
    expect(branch3.content.text).toBe('Branch 3')
    expect(branch3.children.length).toBe(3)
  })

  it('has attachments on branches', () => {
    const doc = createDemoDocument()
    const root = doc.nodes.get(doc.root_id!)!

    const branch1 = doc.nodes.get(root.children[0])!
    expect(branch1.content.attachments.length).toBe(1)
    expect(branch1.content.attachments[0].kind.type).toBe('Url')

    const branch2 = doc.nodes.get(root.children[1])!
    expect(branch2.content.attachments.length).toBe(2)
    expect(branch2.content.attachments[0].kind.type).toBe('Document')
    expect(branch2.content.attachments[1].kind.type).toBe('Photo')
  })

  it('has boundary around Branch 3 group', () => {
    const doc = createDemoDocument()
    expect(doc.boundaries.size).toBe(1)

    const boundary = Array.from(doc.boundaries.values())[0]
    expect(boundary.label).toBe('Group')
    expect(boundary.node_ids.length).toBe(4) // Branch 3 + 3 sub-topics
  })

  it('all children reference valid parents', () => {
    const doc = createDemoDocument()
    for (const node of doc.nodes.values()) {
      if (node.parent) {
        const parent = doc.nodes.get(node.parent)
        expect(parent).toBeTruthy()
        expect(parent!.children).toContain(node.id)
      }
    }
  })
})
