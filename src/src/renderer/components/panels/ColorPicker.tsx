import { useCallback } from 'react'
import type { Color } from '../../../shared/types/style'
import { Color as C } from '../../../shared/types/style'

interface ColorPickerProps {
  label: string
  value: Color
  onChange: (color: Color) => void
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

const inputStyle: React.CSSProperties = {
  width: 28,
  height: 20,
  padding: 0,
  border: '1px solid #555',
  borderRadius: 3,
  backgroundColor: 'transparent',
  cursor: 'pointer'
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const color = C.fromHex(e.target.value)
    if (color) onChange(color)
  }, [onChange])

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="color"
        value={C.toHex(value)}
        onChange={handleChange}
        style={inputStyle}
      />
    </div>
  )
}
