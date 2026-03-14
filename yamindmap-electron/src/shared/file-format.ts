import type { YaMindFile, ViewState } from './types/file'
import type { Document } from './types/document'
import type { MindMapNode, NodeId, Attachment, AttachmentKind } from './types/node'
import type { Boundary, BoundaryId } from './types/boundary'
import type { NodeStyle, DefaultStyles, EdgeStyle, Color, RichSpan } from './types/style'
import type { LayoutConfig } from './types/document'
import { createNode } from './types/node'
import { createDocument } from './types/document'
import { BOUNDARY_DEFAULTS } from './types/boundary'
import { DEFAULT_STYLES, DEFAULT_EDGE_STYLE } from './defaults'
import { FORMAT_VERSION } from './types/file'

// --- On-disk format types (u64 IDs, arrays instead of Maps) ---

interface DiskNode {
  id: number
  parent: number | null
  children: number[]
  content: {
    text: string
    rich_spans?: unknown[]
    notes?: string
    attachments?: DiskAttachment[]
  }
  style?: DiskNodeStyle
  collapsed?: boolean
  manual_position?: [number, number] | null
  manual_width?: number | null
}

interface DiskAttachment {
  kind: DiskAttachmentKind
  label?: string | null
}

type DiskAttachmentKind =
  | { Url: string }
  | { Document: string }
  | { Photo: string }

interface DiskNodeStyle {
  shape?: string | null
  fill_color?: DiskColor | null
  stroke_color?: DiskColor | null
  stroke_width?: number | null
  font_family?: string | null
  font_size?: number | null
  font_color?: DiskColor | null
  padding_h?: number | null
  padding_v?: number | null
  min_width?: number | null
  max_width?: number | null
  corner_radius?: number | null
}

interface DiskColor {
  r: number
  g: number
  b: number
  a: number
}

interface DiskBoundary {
  id: number
  label: string
  show_label?: boolean
  node_ids: number[]
  fill_color?: DiskColor
  stroke_color?: DiskColor
  stroke_width?: number
  padding?: number
}

interface DiskDocument {
  nodes: Record<string, DiskNode>
  root_id: number | null
  relationships?: Record<string, unknown>
  boundaries?: Record<string, DiskBoundary>
  default_styles?: {
    root?: DiskNodeStyle
    branch?: DiskNodeStyle
    topic?: DiskNodeStyle
  }
  default_edge_style?: {
    line_style?: string
    color?: DiskColor
    width?: number
  }
  layout_config?: {
    layout_type?: string
    direction?: string
    h_gap?: number
    v_gap?: number
  }
}

interface DiskFile {
  version: number
  document: DiskDocument
  view_state?: ViewState
}

// --- ID mapping ---

function buildIdMap(diskDoc: DiskDocument): Map<number, string> {
  const map = new Map<number, string>()
  for (const key of Object.keys(diskDoc.nodes)) {
    const numId = parseInt(key, 10)
    map.set(numId, crypto.randomUUID())
  }
  return map
}

function mapId(numId: number | null, idMap: Map<number, string>): string | null {
  if (numId === null) return null
  return idMap.get(numId) ?? null
}

// --- Parsing ---

function parseDiskColor(c: DiskColor | null | undefined): Color | undefined {
  if (!c) return undefined
  return { r: c.r, g: c.g, b: c.b, a: c.a }
}

function parseDiskNodeStyle(s: DiskNodeStyle | null | undefined): NodeStyle {
  if (!s) return {}
  return {
    shape: (s.shape as NodeStyle['shape']) ?? undefined,
    fill_color: parseDiskColor(s.fill_color),
    stroke_color: parseDiskColor(s.stroke_color),
    stroke_width: s.stroke_width ?? undefined,
    font_family: s.font_family ?? undefined,
    font_size: s.font_size ?? undefined,
    font_color: parseDiskColor(s.font_color),
    padding_h: s.padding_h ?? undefined,
    padding_v: s.padding_v ?? undefined,
    min_width: s.min_width ?? undefined,
    max_width: s.max_width ?? undefined,
    corner_radius: s.corner_radius ?? undefined
  }
}

function parseDiskAttachmentKind(kind: DiskAttachmentKind): AttachmentKind {
  if ('Url' in kind) return { type: 'Url', url: kind.Url }
  if ('Document' in kind) return { type: 'Document', path: kind.Document }
  return { type: 'Photo', path: kind.Photo }
}

function parseDiskAttachment(a: DiskAttachment): Attachment {
  return {
    kind: parseDiskAttachmentKind(a.kind),
    label: a.label ?? undefined
  }
}

export function parseYaMindFile(json: string): YaMindFile {
  const disk: DiskFile = JSON.parse(json)
  const diskDoc = disk.document
  const idMap = buildIdMap(diskDoc)

  const doc = createDocument()

  // Parse nodes
  for (const [key, diskNode] of Object.entries(diskDoc.nodes)) {
    const numId = parseInt(key, 10)
    const strId = idMap.get(numId)!
    const node = createNode(strId, diskNode.content.text)
    node.parent = mapId(diskNode.parent, idMap)
    node.children = diskNode.children.map((cid) => idMap.get(cid)!).filter(Boolean)
    node.content.notes = diskNode.content.notes ?? ''
    node.content.rich_spans = (diskNode.content.rich_spans ?? []) as RichSpan[]
    node.content.attachments = (diskNode.content.attachments ?? []).map(parseDiskAttachment)
    node.style = parseDiskNodeStyle(diskNode.style)
    node.collapsed = diskNode.collapsed ?? false
    node.manual_position = diskNode.manual_position
      ? { x: diskNode.manual_position[0], y: diskNode.manual_position[1] }
      : null
    node.manual_width = diskNode.manual_width ?? null
    doc.nodes.set(strId, node)
  }

  // Root
  doc.root_id = mapId(diskDoc.root_id, idMap)

  // Boundaries
  if (diskDoc.boundaries) {
    for (const [, diskBoundary] of Object.entries(diskDoc.boundaries)) {
      const bId = crypto.randomUUID()
      doc.boundaries.set(bId, {
        id: bId,
        label: diskBoundary.label,
        show_label: diskBoundary.show_label ?? true,
        node_ids: diskBoundary.node_ids.map((nid) => idMap.get(nid)!).filter(Boolean),
        fill_color: parseDiskColor(diskBoundary.fill_color) ?? { ...BOUNDARY_DEFAULTS.fill_color },
        stroke_color: parseDiskColor(diskBoundary.stroke_color) ?? { ...BOUNDARY_DEFAULTS.stroke_color },
        stroke_width: diskBoundary.stroke_width ?? BOUNDARY_DEFAULTS.stroke_width,
        padding: diskBoundary.padding ?? BOUNDARY_DEFAULTS.padding
      })
    }
  }

  // Default styles
  if (diskDoc.default_styles) {
    doc.default_styles = {
      root: { ...DEFAULT_STYLES.root, ...parseDiskNodeStyle(diskDoc.default_styles.root) },
      branch: { ...DEFAULT_STYLES.branch, ...parseDiskNodeStyle(diskDoc.default_styles.branch) },
      topic: { ...DEFAULT_STYLES.topic, ...parseDiskNodeStyle(diskDoc.default_styles.topic) }
    }
  }

  // Edge style
  if (diskDoc.default_edge_style) {
    doc.default_edge_style = {
      line_style: (diskDoc.default_edge_style.line_style as EdgeStyle['line_style']) ?? DEFAULT_EDGE_STYLE.line_style,
      color: parseDiskColor(diskDoc.default_edge_style.color) ?? DEFAULT_EDGE_STYLE.color,
      width: diskDoc.default_edge_style.width ?? DEFAULT_EDGE_STYLE.width
    }
  }

  // Layout config
  if (diskDoc.layout_config) {
    doc.layout_config = {
      layout_type: (diskDoc.layout_config.layout_type as LayoutConfig['layout_type']) ?? 'Map',
      direction: (diskDoc.layout_config.direction as LayoutConfig['direction']) ?? 'Balanced',
      h_gap: diskDoc.layout_config.h_gap ?? 60.0,
      v_gap: diskDoc.layout_config.v_gap ?? 20.0
    }
  }

  return {
    version: disk.version,
    document: doc,
    view_state: disk.view_state
  }
}

// --- Serialization ---

function serializeColor(c: Color): DiskColor {
  return { r: c.r, g: c.g, b: c.b, a: c.a }
}

function serializeNodeStyle(s: NodeStyle): DiskNodeStyle {
  return {
    shape: s.shape ?? null,
    fill_color: s.fill_color ? serializeColor(s.fill_color) : null,
    stroke_color: s.stroke_color ? serializeColor(s.stroke_color) : null,
    stroke_width: s.stroke_width ?? null,
    font_family: s.font_family ?? null,
    font_size: s.font_size ?? null,
    font_color: s.font_color ? serializeColor(s.font_color) : null,
    padding_h: s.padding_h ?? null,
    padding_v: s.padding_v ?? null,
    min_width: s.min_width ?? null,
    max_width: s.max_width ?? null,
    corner_radius: s.corner_radius ?? null
  }
}

function serializeAttachmentKind(kind: AttachmentKind): DiskAttachmentKind {
  switch (kind.type) {
    case 'Url': return { Url: kind.url }
    case 'Document': return { Document: kind.path }
    case 'Photo': return { Photo: kind.path }
  }
}

export function serializeYaMindFile(file: YaMindFile): string {
  const doc = file.document

  // Build reverse ID map: string → sequential u64
  const strToNum = new Map<string, number>()
  let nextId = 0
  for (const strId of doc.nodes.keys()) {
    strToNum.set(strId, nextId++)
  }
  // Also map boundary node IDs
  for (const b of doc.boundaries.values()) {
    for (const nid of b.node_ids) {
      if (!strToNum.has(nid)) strToNum.set(nid, nextId++)
    }
  }

  const numId = (strId: string | null): number | null => {
    if (strId === null) return null
    return strToNum.get(strId) ?? null
  }

  // Serialize nodes
  const diskNodes: Record<string, DiskNode> = {}
  for (const [strId, node] of doc.nodes) {
    const nid = strToNum.get(strId)!
    diskNodes[String(nid)] = {
      id: nid,
      parent: numId(node.parent),
      children: node.children.map((cid) => strToNum.get(cid)!),
      content: {
        text: node.content.text,
        rich_spans: node.content.rich_spans,
        notes: node.content.notes,
        attachments: node.content.attachments.map((a) => ({
          kind: serializeAttachmentKind(a.kind),
          label: a.label ?? null
        }))
      },
      style: serializeNodeStyle(node.style),
      collapsed: node.collapsed,
      manual_position: node.manual_position
        ? [node.manual_position.x, node.manual_position.y]
        : null,
      manual_width: node.manual_width
    }
  }

  // Serialize boundaries
  const diskBoundaries: Record<string, DiskBoundary> = {}
  let boundaryIdx = 0
  for (const [, boundary] of doc.boundaries) {
    diskBoundaries[String(boundaryIdx)] = {
      id: boundaryIdx,
      label: boundary.label,
      show_label: boundary.show_label,
      node_ids: boundary.node_ids.map((nid) => strToNum.get(nid)!).filter((n) => n !== undefined),
      fill_color: serializeColor(boundary.fill_color),
      stroke_color: serializeColor(boundary.stroke_color),
      stroke_width: boundary.stroke_width,
      padding: boundary.padding
    }
    boundaryIdx++
  }

  const diskFile: DiskFile = {
    version: FORMAT_VERSION,
    document: {
      nodes: diskNodes,
      root_id: numId(doc.root_id),
      relationships: {},
      boundaries: diskBoundaries,
      default_styles: {
        root: serializeNodeStyle(doc.default_styles.root),
        branch: serializeNodeStyle(doc.default_styles.branch),
        topic: serializeNodeStyle(doc.default_styles.topic)
      },
      default_edge_style: {
        line_style: doc.default_edge_style.line_style,
        color: serializeColor(doc.default_edge_style.color),
        width: doc.default_edge_style.width
      },
      layout_config: {
        layout_type: doc.layout_config.layout_type,
        direction: doc.layout_config.direction,
        h_gap: doc.layout_config.h_gap,
        v_gap: doc.layout_config.v_gap
      }
    },
    view_state: file.view_state
  }

  return JSON.stringify(diskFile, null, 2)
}
