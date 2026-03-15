import { useCallback } from 'react'
import type { LayoutConfig } from '../../../shared/types/document'

interface LayoutConfigEditorProps {
  config: LayoutConfig
  onChange: (config: LayoutConfig) => void
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

export function LayoutConfigEditor({ config, onChange }: LayoutConfigEditorProps) {
  const update = useCallback(<K extends keyof LayoutConfig>(key: K, value: LayoutConfig[K]) => {
    onChange({ ...config, [key]: value })
  }, [config, onChange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={rowStyle}>
        <span style={labelStyle}>Direction</span>
        <select
          value={config.direction}
          onChange={(e) => update('direction', e.target.value as LayoutConfig['direction'])}
          style={selectStyle}
        >
          <option value="Balanced">Balanced</option>
          <option value="LeftOnly">Left Only</option>
          <option value="RightOnly">Right Only</option>
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>H Gap</span>
        <input
          type="number"
          value={config.h_gap}
          onChange={(e) => update('h_gap', Number(e.target.value))}
          min={10}
          max={200}
          step={5}
          style={numberStyle}
        />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>V Gap</span>
        <input
          type="number"
          value={config.v_gap}
          onChange={(e) => update('v_gap', Number(e.target.value))}
          min={5}
          max={100}
          step={5}
          style={numberStyle}
        />
      </div>
    </div>
  )
}
