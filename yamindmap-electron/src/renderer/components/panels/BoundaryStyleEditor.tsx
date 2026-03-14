import { useCallback } from 'react'
import type { BoundaryStyle } from '../../../shared/types/boundary'
import { ColorPicker } from './ColorPicker'

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
  width: 50,
  textAlign: 'right' as const
}

export function BoundaryStyleEditor({ style, onChange }: BoundaryStyleEditorProps) {
  const update = useCallback(<K extends keyof BoundaryStyle>(key: K, value: BoundaryStyle[K]) => {
    onChange({ ...style, [key]: value })
  }, [style, onChange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
