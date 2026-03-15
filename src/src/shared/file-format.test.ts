import { describe, it, expect } from 'vitest'
import { parseYaMindFile, serializeYaMindFile } from './file-format'
import { createDemoDocument } from './demo-document'
import { FORMAT_VERSION } from './types/file'

describe('file-format', () => {
  it('round-trips a document through serialize/parse', () => {
    const original = createDemoDocument()
    const file = { version: FORMAT_VERSION, document: original }
    const json = serializeYaMindFile(file)
    const parsed = parseYaMindFile(json)

    expect(parsed.version).toBe(FORMAT_VERSION)
    expect(parsed.document.nodes.size).toBe(original.nodes.size)
    expect(parsed.document.boundaries.size).toBe(original.boundaries.size)

    // Root text matches
    const originalRoot = original.nodes.get(original.root_id!)!
    const parsedRoot = parsed.document.nodes.get(parsed.document.root_id!)!
    expect(parsedRoot.content.text).toBe(originalRoot.content.text)
  })

  it('preserves node hierarchy through round-trip', () => {
    const original = createDemoDocument()
    const json = serializeYaMindFile({ version: FORMAT_VERSION, document: original })
    const parsed = parseYaMindFile(json)

    const root = parsed.document.nodes.get(parsed.document.root_id!)!
    expect(root.children.length).toBe(3)

    // All children reference valid parent
    for (const childId of root.children) {
      const child = parsed.document.nodes.get(childId)!
      expect(child.parent).toBe(parsed.document.root_id)
    }
  })

  it('preserves attachments through round-trip', () => {
    const original = createDemoDocument()
    const json = serializeYaMindFile({ version: FORMAT_VERSION, document: original })
    const parsed = parseYaMindFile(json)

    const root = parsed.document.nodes.get(parsed.document.root_id!)!
    const branch1 = parsed.document.nodes.get(root.children[0])!
    expect(branch1.content.attachments.length).toBe(1)
    expect(branch1.content.attachments[0].kind.type).toBe('Url')
    if (branch1.content.attachments[0].kind.type === 'Url') {
      expect(branch1.content.attachments[0].kind.url).toBe('https://example.com')
    }
  })

  it('preserves boundary through round-trip', () => {
    const original = createDemoDocument()
    const json = serializeYaMindFile({ version: FORMAT_VERSION, document: original })
    const parsed = parseYaMindFile(json)

    const boundary = Array.from(parsed.document.boundaries.values())[0]
    expect(boundary.label).toBe('Group')
    expect(boundary.node_ids.length).toBe(4)
  })

  it('preserves view state', () => {
    const doc = createDemoDocument()
    const file = {
      version: FORMAT_VERSION,
      document: doc,
      view_state: {
        translation: [100, 200] as [number, number],
        scale: 1.5,
        window_size: [1200, 800] as [number, number],
        window_position: [50, 50] as [number, number]
      }
    }
    const json = serializeYaMindFile(file)
    const parsed = parseYaMindFile(json)

    expect(parsed.view_state).toBeDefined()
    expect(parsed.view_state!.translation).toEqual([100, 200])
    expect(parsed.view_state!.scale).toBe(1.5)
    expect(parsed.view_state!.window_size).toEqual([1200, 800])
    expect(parsed.view_state!.window_position).toEqual([50, 50])
  })

  it('preserves default styles through round-trip', () => {
    const original = createDemoDocument()
    const json = serializeYaMindFile({ version: FORMAT_VERSION, document: original })
    const parsed = parseYaMindFile(json)

    expect(parsed.document.default_styles.root.shape).toBe('Ellipse')
    expect(parsed.document.default_styles.root.font_size).toBe(18)
    expect(parsed.document.default_styles.branch.font_size).toBe(14)
    expect(parsed.document.default_styles.topic.font_size).toBe(12)
  })

  it('preserves layout config through round-trip', () => {
    const original = createDemoDocument()
    const json = serializeYaMindFile({ version: FORMAT_VERSION, document: original })
    const parsed = parseYaMindFile(json)

    expect(parsed.document.layout_config.direction).toBe('Balanced')
    expect(parsed.document.layout_config.h_gap).toBe(60)
    expect(parsed.document.layout_config.v_gap).toBe(20)
  })
})
