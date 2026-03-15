import type { Document } from './types/document'
import { createDocument } from './types/document'
import { createNode } from './types/node'
import { createBoundary } from './types/boundary'

export function createDemoDocument(): Document {
  const doc = createDocument()

  // Create nodes with stable UUIDs
  const rootId = crypto.randomUUID()
  const branch1Id = crypto.randomUUID()
  const branch2Id = crypto.randomUUID()
  const branch3Id = crypto.randomUUID()
  const sub11Id = crypto.randomUUID()
  const sub12Id = crypto.randomUUID()
  const sub21Id = crypto.randomUUID()
  const sub31Id = crypto.randomUUID()
  const sub32Id = crypto.randomUUID()
  const sub33Id = crypto.randomUUID()

  // Root
  const root = createNode(rootId, 'Central Topic')
  root.style = { shape: 'Ellipse' }
  root.children = [branch1Id, branch2Id, branch3Id]
  doc.nodes.set(rootId, root)
  doc.root_id = rootId

  // Branch 1
  const branch1 = createNode(branch1Id, 'Branch 1')
  branch1.parent = rootId
  branch1.children = [sub11Id, sub12Id]
  branch1.content.attachments = [
    { kind: { type: 'Url', url: 'https://example.com' }, label: 'Example' }
  ]
  doc.nodes.set(branch1Id, branch1)

  // Branch 2
  const branch2 = createNode(branch2Id, 'Branch 2')
  branch2.parent = rootId
  branch2.children = [sub21Id]
  branch2.content.attachments = [
    { kind: { type: 'Document', path: '/tmp/test.pdf' }, label: 'Test Doc' },
    { kind: { type: 'Photo', path: '/tmp/photo.png' }, label: 'Photo' }
  ]
  doc.nodes.set(branch2Id, branch2)

  // Branch 3
  const branch3 = createNode(branch3Id, 'Branch 3')
  branch3.parent = rootId
  branch3.children = [sub31Id, sub32Id, sub33Id]
  doc.nodes.set(branch3Id, branch3)

  // Sub-topics
  const sub11 = createNode(sub11Id, 'Sub-topic 1.1')
  sub11.parent = branch1Id
  doc.nodes.set(sub11Id, sub11)

  const sub12 = createNode(sub12Id, 'Sub-topic 1.2')
  sub12.parent = branch1Id
  doc.nodes.set(sub12Id, sub12)

  const sub21 = createNode(sub21Id, 'Sub-topic 2.1')
  sub21.parent = branch2Id
  doc.nodes.set(sub21Id, sub21)

  const sub31 = createNode(sub31Id, 'Sub-topic 3.1')
  sub31.parent = branch3Id
  doc.nodes.set(sub31Id, sub31)

  const sub32 = createNode(sub32Id, 'Sub-topic 3.2')
  sub32.parent = branch3Id
  doc.nodes.set(sub32Id, sub32)

  const sub33 = createNode(sub33Id, 'Sub-topic 3.3')
  sub33.parent = branch3Id
  doc.nodes.set(sub33Id, sub33)

  // Boundary around Branch 3 and its children
  const boundaryId = crypto.randomUUID()
  const boundary = createBoundary(boundaryId, [branch3Id, sub31Id, sub32Id, sub33Id])
  boundary.label = 'Group'
  doc.boundaries.set(boundaryId, boundary)

  return doc
}
