import { useState, useCallback } from 'react'
import type { NodeStyle, NodeShape, Color } from '../../../shared/types/style'
import { ColorPicker } from './ColorPicker'
import { FONT_OPTIONS } from '../../../shared/fonts'
import { DEFAULT_FONT_FAMILY } from '../../../shared/constants'

const SHAPES: NodeShape[] = ['RoundedRect', 'Ellipse', 'Diamond', 'Capsule', 'Underline']

interface NodeStyleEditorProps {
  styles: { root: NodeStyle; branch: NodeStyle; topic: NodeStyle }
  onChange: (depth: 'root' | 'branch' | 'topic', style: NodeStyle) => void
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  marginBottom: 8
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#aaa',
  flex: 1
}

const selectStyle: React.CSSProperties = {
  fontSize: 11,
  backgroundColor: '#3a3a3c',
  color: '#ddd',
  border: '1px solid #555',
  borderRadius: 3,
  padding: '2px 4px'
}

const numberStyle: React.CSSProperties = {
  ...selectStyle,
  width: 56,
  textAlign: 'right' as const
}

type Depth = 'root' | 'branch' | 'topic'

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '4px 0',
        fontSize: 11,
        border: '1px solid #555',
        borderBottom: active ? '1px solid #2c2c2e' : '1px solid #555',
        backgroundColor: active ? '#2c2c2e' : '#1e1e20',
        color: active ? '#fff' : '#888',
        cursor: 'pointer',
        borderRadius: 0
      }}
    >
      {label}
    </button>
  )
}

function NumberField({ label, value, onChange, min, max, step }: {
  label: string
  value: number | undefined
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step ?? 1}
        style={numberStyle}
      />
    </div>
  )
}

function DepthStyleEditor({ style, onChange }: { style: NodeStyle; onChange: (s: NodeStyle) => void }) {
  const update = useCallback(<K extends keyof NodeStyle>(key: K, value: NodeStyle[K]) => {
    onChange({ ...style, [key]: value })
  }, [style, onChange])

  return (
    <div style={sectionStyle}>
      <div style={rowStyle}>
        <span style={labelStyle}>Shape</span>
        <select
          value={style.shape ?? 'RoundedRect'}
          onChange={(e) => update('shape', e.target.value as NodeShape)}
          style={selectStyle}
        >
          {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Font</span>
        <select
          value={style.font_family ?? DEFAULT_FONT_FAMILY}
          onChange={(e) => update('font_family', e.target.value)}
          style={selectStyle}
        >
          {FONT_OPTIONS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {style.fill_color && (
        <ColorPicker label="Fill" value={style.fill_color} onChange={(c) => update('fill_color', c)} />
      )}
      {style.stroke_color && (
        <ColorPicker label="Stroke" value={style.stroke_color} onChange={(c) => update('stroke_color', c)} />
      )}
      {style.font_color && (
        <ColorPicker label="Font Color" value={style.font_color} onChange={(c) => update('font_color', c)} />
      )}

      <NumberField label="Stroke Width" value={style.stroke_width} onChange={(v) => update('stroke_width', v)} min={0} max={10} step={0.5} />
      <NumberField label="Font Size" value={style.font_size} onChange={(v) => update('font_size', v)} min={8} max={48} />
      <NumberField label="Padding H" value={style.padding_h} onChange={(v) => update('padding_h', v)} min={0} max={60} />
      <NumberField label="Padding V" value={style.padding_v} onChange={(v) => update('padding_v', v)} min={0} max={60} />
      <NumberField label="Min Width" value={style.min_width} onChange={(v) => update('min_width', v)} min={20} max={400} />
      <NumberField label="Max Width" value={style.max_width} onChange={(v) => update('max_width', v)} min={60} max={600} />
      <NumberField label="Corner Radius" value={style.corner_radius} onChange={(v) => update('corner_radius', v)} min={0} max={30} />
    </div>
  )
}

export function NodeStyleEditor({ styles, onChange }: NodeStyleEditorProps) {
  const [tab, setTab] = useState<Depth>('root')

  const handleChange = useCallback((newStyle: NodeStyle) => {
    onChange(tab, newStyle)
  }, [tab, onChange])

  return (
    <div>
      <div style={tabBarStyle}>
        <TabButton label="Root" active={tab === 'root'} onClick={() => setTab('root')} />
        <TabButton label="Branch" active={tab === 'branch'} onClick={() => setTab('branch')} />
        <TabButton label="Topic" active={tab === 'topic'} onClick={() => setTab('topic')} />
      </div>
      <DepthStyleEditor style={styles[tab]} onChange={handleChange} />
    </div>
  )
}

// Per-node override editor: shows which fields have custom values
interface NodeOverrideEditorProps {
  nodeStyle: NodeStyle
  defaultStyle: NodeStyle
  onChange: (style: NodeStyle) => void
}

export function NodeOverrideEditor({ nodeStyle, defaultStyle, onChange }: NodeOverrideEditorProps) {
  const toggle = useCallback((key: keyof NodeStyle, defaultValue: unknown) => {
    if (nodeStyle[key] !== undefined) {
      // Remove override
      const updated = { ...nodeStyle }
      delete (updated as Record<string, unknown>)[key]
      onChange(updated)
    } else {
      // Add override with default value
      onChange({ ...nodeStyle, [key]: defaultValue })
    }
  }, [nodeStyle, onChange])

  const update = useCallback(<K extends keyof NodeStyle>(key: K, value: NodeStyle[K]) => {
    onChange({ ...nodeStyle, [key]: value })
  }, [nodeStyle, onChange])

  const fields: { key: keyof NodeStyle; label: string; type: 'shape' | 'color' | 'number' | 'font' }[] = [
    { key: 'shape', label: 'Shape', type: 'shape' },
    { key: 'font_family', label: 'Font', type: 'font' },
    { key: 'fill_color', label: 'Fill', type: 'color' },
    { key: 'stroke_color', label: 'Stroke', type: 'color' },
    { key: 'font_color', label: 'Font Color', type: 'color' },
    { key: 'stroke_width', label: 'Stroke Width', type: 'number' },
    { key: 'font_size', label: 'Font Size', type: 'number' },
    { key: 'corner_radius', label: 'Corner Radius', type: 'number' }
  ]

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>
        Check to override depth default
      </div>
      {fields.map(({ key, label, type }) => {
        const hasOverride = nodeStyle[key] !== undefined
        const value = hasOverride ? nodeStyle[key] : defaultStyle[key]

        return (
          <div key={key} style={{ ...rowStyle, opacity: hasOverride ? 1 : 0.5 }}>
            <input
              type="checkbox"
              checked={hasOverride}
              onChange={() => toggle(key, defaultStyle[key])}
              style={{ width: 14, height: 14 }}
            />
            <span style={{ ...labelStyle, flex: 1 }}>{label}</span>
            {type === 'shape' && (
              <select
                value={(value as NodeShape) ?? 'RoundedRect'}
                onChange={(e) => update('shape', e.target.value as NodeShape)}
                disabled={!hasOverride}
                style={selectStyle}
              >
                {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {type === 'color' && value && (
              <ColorPicker label="" value={value as Color} onChange={(c) => update(key as 'fill_color', c)} />
            )}
            {type === 'font' && (
              <select
                value={(value as string) ?? DEFAULT_FONT_FAMILY}
                onChange={(e) => update('font_family', e.target.value)}
                disabled={!hasOverride}
                style={selectStyle}
              >
                {FONT_OPTIONS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
              </select>
            )}
            {type === 'number' && (
              <input
                type="number"
                value={(value as number) ?? 0}
                onChange={(e) => update(key as 'stroke_width', Number(e.target.value))}
                disabled={!hasOverride}
                style={numberStyle}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
