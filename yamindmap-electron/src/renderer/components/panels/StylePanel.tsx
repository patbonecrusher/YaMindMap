import { useCallback } from 'react'
import { useStore } from '../../store'
import type { NodeStyle, EdgeStyle } from '../../../shared/types/style'
import type { BoundaryStyle } from '../../../shared/types/boundary'
import { Color, styleForDepth, mergeStyles } from '../../../shared/types/style'
import type { LayoutConfig } from '../../../shared/types/document'
import { BUILT_IN_THEMES } from '../../../shared/themes'
import { ColorPicker } from './ColorPicker'
import { NodeStyleEditor, NodeOverrideEditor } from './NodeStyleEditor'
import { EdgeStyleEditor } from './EdgeStyleEditor'
import { BoundaryStyleEditor } from './BoundaryStyleEditor'
import { LayoutConfigEditor } from './LayoutConfigEditor'
import { depthOf } from '../../../shared/document-ops'

const PANEL_WIDTH = 280

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: PANEL_WIDTH,
  height: '100%',
  backgroundColor: '#2c2c2e',
  borderLeft: '1px solid #444',
  overflowY: 'auto',
  zIndex: 50,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  color: '#ddd',
  fontSize: 12
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 12px',
  borderBottom: '1px solid #444'
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  padding: '10px 12px 4px',
  borderTop: '1px solid #3a3a3c'
}

const sectionBodyStyle: React.CSSProperties = {
  padding: '4px 12px 8px'
}

const selectStyle: React.CSSProperties = {
  fontSize: 11,
  backgroundColor: '#3a3a3c',
  color: '#ddd',
  border: '1px solid #555',
  borderRadius: 3,
  padding: '2px 4px',
  width: '100%'
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  fontSize: 18,
  cursor: 'pointer',
  padding: '0 4px',
  lineHeight: 1
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div style={sectionHeaderStyle}>{title}</div>
      <div style={sectionBodyStyle}>{children}</div>
    </>
  )
}

export function StylePanel() {
  const doc = useStore((s) => s.document)
  const updateDocument = useStore((s) => s.updateDocument)
  const setStylePanelOpen = useStore((s) => s.setStylePanelOpen)
  const singleSelectedNodeId = useStore((s) => s.singleSelectedNodeId)
  const selectedBoundaryId = useStore((s) => s.selectedBoundaryId)
  const selectedId = singleSelectedNodeId()

  const handleApplyTheme = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const theme = BUILT_IN_THEMES.find((t) => t.name === e.target.value)
    if (!theme) return
    updateDocument((d) => {
      d.default_styles = { ...theme.styles }
      d.default_edge_style = { ...theme.edge }
      d.default_boundary_style = { ...theme.boundary }
      d.background_color = { ...theme.background }
      // Update all existing boundaries to match the theme
      for (const [, b] of d.boundaries) {
        b.fill_color = { ...theme.boundary.fill_color }
        b.stroke_color = { ...theme.boundary.stroke_color }
        b.stroke_width = theme.boundary.stroke_width
        b.padding = theme.boundary.padding
      }
    })
  }, [updateDocument])

  const handleStyleChange = useCallback((depth: 'root' | 'branch' | 'topic', style: NodeStyle) => {
    updateDocument((d) => {
      d.default_styles = { ...d.default_styles, [depth]: style }
    })
  }, [updateDocument])

  const handleEdgeChange = useCallback((style: EdgeStyle) => {
    updateDocument((d) => {
      d.default_edge_style = style
    })
  }, [updateDocument])

  const handleBoundaryChange = useCallback((style: BoundaryStyle) => {
    updateDocument((d) => {
      d.default_boundary_style = style
    })
  }, [updateDocument])

  const handleSelectedBoundaryChange = useCallback((style: BoundaryStyle) => {
    if (!selectedBoundaryId) return
    updateDocument((d) => {
      const b = d.boundaries.get(selectedBoundaryId)
      if (b) {
        b.fill_color = style.fill_color
        b.stroke_color = style.stroke_color
        b.stroke_width = style.stroke_width
        b.padding = style.padding
      }
    })
  }, [selectedBoundaryId, updateDocument])

  const handleLayoutChange = useCallback((config: LayoutConfig) => {
    updateDocument((d) => {
      d.layout_config = config
    })
  }, [updateDocument])

  const handleNodeOverrideChange = useCallback((style: NodeStyle) => {
    if (!selectedId) return
    updateDocument((d) => {
      const node = d.nodes.get(selectedId)
      if (node) node.style = style
    })
  }, [selectedId, updateDocument])

  // Determine which theme is currently active (if any)
  const currentThemeName = BUILT_IN_THEMES.find((t) => {
    const s = doc.default_styles
    const rootFillMatch = s.root.fill_color && t.styles.root.fill_color
      ? Color.toHex(s.root.fill_color) === Color.toHex(t.styles.root.fill_color)
      : false
    const branchFillMatch = s.branch.fill_color && t.styles.branch.fill_color
      ? Color.toHex(s.branch.fill_color) === Color.toHex(t.styles.branch.fill_color)
      : false
    return rootFillMatch && branchFillMatch &&
      s.root.shape === t.styles.root.shape &&
      s.branch.shape === t.styles.branch.shape
  })?.name ?? ''

  // Selected boundary
  const selectedBoundary = selectedBoundaryId ? doc.boundaries.get(selectedBoundaryId) ?? null : null

  // Per-node override section
  const selectedNode = selectedId ? doc.nodes.get(selectedId) : null
  const selectedDepth = selectedId ? depthOf(doc, selectedId) : 0
  const selectedDefault = styleForDepth(doc.default_styles, selectedDepth)

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600 }}>Style</span>
        <button onClick={() => setStylePanelOpen(false)} style={closeButtonStyle}>
          &times;
        </button>
      </div>

      <Section title="Theme Preset">
        <select value={currentThemeName} onChange={handleApplyTheme} style={selectStyle}>
          <option value="">Custom</option>
          {BUILT_IN_THEMES.map((t) => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
      </Section>

      <Section title="Background">
        <ColorPicker
          label="Color"
          value={doc.background_color}
          onChange={(c) => updateDocument((d) => { d.background_color = c })}
        />
      </Section>

      {selectedNode ? (
        <Section title={`Node Override (${selectedNode.content.text.slice(0, 20) || 'untitled'})`}>
          <NodeOverrideEditor
            nodeStyle={selectedNode.style}
            defaultStyle={selectedDefault}
            onChange={handleNodeOverrideChange}
          />
        </Section>
      ) : (
        <Section title="Node Styles">
          <NodeStyleEditor
            styles={doc.default_styles}
            onChange={handleStyleChange}
          />
        </Section>
      )}

      <Section title="Edges">
        <EdgeStyleEditor style={doc.default_edge_style} onChange={handleEdgeChange} />
      </Section>

      {selectedBoundary ? (
        <Section title={`Boundary (${selectedBoundary.label || 'untitled'})`}>
          <BoundaryStyleEditor style={selectedBoundary} onChange={handleSelectedBoundaryChange} />
        </Section>
      ) : (
        <Section title="Boundary Defaults">
          <BoundaryStyleEditor style={doc.default_boundary_style} onChange={handleBoundaryChange} />
        </Section>
      )}

      <Section title="Layout">
        <LayoutConfigEditor config={doc.layout_config} onChange={handleLayoutChange} />
      </Section>
    </div>
  )
}
