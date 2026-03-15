import { useCallback } from 'react'
import type { BoundaryStyle, BoundaryShape } from '../../../shared/types/boundary'
import { ColorPicker } from './ColorPicker'
import { FONT_OPTIONS } from '../../../shared/fonts'

interface BoundaryStyleEditorProps {
  style: BoundaryStyle
  onChange: (style: BoundaryStyle) => void
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

const numberStyle: React.CSSProperties = {
  fontSize: 11,
  backgroundColor: '#3a3a3c',
  color: '#ddd',
  border: '1px solid #555',
  borderRadius: 3,
  padding: '2px 4px',
  width: 56,
  textAlign: 'right' as const
}

const selectStyle: React.CSSProperties = {
  fontSize: 11,
  backgroundColor: '#3a3a3c',
  color: '#ddd',
  border: '1px solid #555',
  borderRadius: 3,
  padding: '2px 4px',
  width: 110
}

const BOUNDARY_SHAPES: { value: BoundaryShape; label: string }[] = [
  { value: 'RoundedRect', label: 'Rounded Rect' },
  { value: 'Ellipse', label: 'Ellipse' },
  { value: 'Pill', label: 'Pill' },
  { value: 'Bracket', label: 'Bracket' }
]

export function BoundaryStyleEditor({ style, onChange }: BoundaryStyleEditorProps) {
  const update = useCallback(<K extends keyof BoundaryStyle>(key: K, value: BoundaryStyle[K]) => {
    onChange({ ...style, [key]: value })
  }, [style, onChange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={rowStyle}>
        <span style={labelStyle}>Shape</span>
        <select
          value={style.shape ?? 'RoundedRect'}
          onChange={(e) => update('shape', e.target.value as BoundaryShape)}
          style={selectStyle}
        >
          {BOUNDARY_SHAPES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Label Font</span>
        <select
          value={style.font_family}
          onChange={(e) => update('font_family', e.target.value)}
          style={selectStyle}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.label} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <ColorPicker label="Fill" value={style.fill_color} onChange={(c) => update('fill_color', c)} />
      <ColorPicker label="Stroke" value={style.stroke_color} onChange={(c) => update('stroke_color', c)} />

      <div style={rowStyle}>
        <span style={labelStyle}>Stroke Width</span>
        <input
          type="number"
          value={style.stroke_width}
          onChange={(e) => update('stroke_width', Number(e.target.value))}
          min={0.5}
          max={6}
          step={0.5}
          style={numberStyle}
        />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Padding</span>
        <input
          type="number"
          value={style.padding}
          onChange={(e) => update('padding', Number(e.target.value))}
          min={0}
          max={40}
          step={2}
          style={numberStyle}
        />
      </div>
    </div>
  )
}
