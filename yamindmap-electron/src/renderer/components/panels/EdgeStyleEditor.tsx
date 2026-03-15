import { useCallback } from 'react'
import type { EdgeStyle, LineStyle } from '../../../shared/types/style'
import { ColorPicker } from './ColorPicker'

const LINE_STYLES: LineStyle[] = ['Bezier', 'Straight', 'Elbow', 'Rounded']

interface EdgeStyleEditorProps {
  style: EdgeStyle
  onChange: (style: EdgeStyle) => void
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

export function EdgeStyleEditor({ style, onChange }: EdgeStyleEditorProps) {
  const update = useCallback(<K extends keyof EdgeStyle>(key: K, value: EdgeStyle[K]) => {
    onChange({ ...style, [key]: value })
  }, [style, onChange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={rowStyle}>
        <span style={labelStyle}>Line Style</span>
        <select
          value={style.line_style}
          onChange={(e) => update('line_style', e.target.value as LineStyle)}
          style={selectStyle}
        >
          {LINE_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <ColorPicker label="Color" value={style.color} onChange={(c) => update('color', c)} />

      <div style={rowStyle}>
        <span style={labelStyle}>Width</span>
        <input
          type="number"
          value={style.width}
          onChange={(e) => update('width', Number(e.target.value))}
          min={0.5}
          max={8}
          step={0.5}
          style={numberStyle}
        />
      </div>
    </div>
  )
}
