import { useState, useCallback, useEffect, useRef } from 'react'

interface BoundaryLabelDialogProps {
  currentLabel: string
  onSave: (label: string) => void
  onClose: () => void
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000
}

const dialogStyle: React.CSSProperties = {
  backgroundColor: '#2c2c2e',
  borderRadius: 12,
  padding: 24,
  minWidth: 320,
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  color: '#fff'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #555',
  backgroundColor: '#1c1c1e',
  color: '#fff',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  marginTop: 12
}

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 16
}

const buttonStyle: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500
}

export function BoundaryLabelDialog({ currentLabel, onSave, onClose }: BoundaryLabelDialogProps) {
  const [label, setLabel] = useState(currentLabel)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSave = useCallback(() => {
    onSave(label)
  }, [label, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [handleSave, onClose])

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Edit Boundary Label</div>
        <input
          ref={inputRef}
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          style={inputStyle}
          placeholder="Boundary label..."
        />
        <div style={buttonRowStyle}>
          <button
            onClick={onClose}
            style={{ ...buttonStyle, backgroundColor: '#3a3a3c', color: '#fff' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{ ...buttonStyle, backgroundColor: '#FF9500', color: '#000' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
