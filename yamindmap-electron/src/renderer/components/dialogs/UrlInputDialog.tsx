import { useState, useCallback, useEffect, useRef } from 'react'

interface UrlInputDialogProps {
  nodeId: string
  onInsert: (nodeId: string, url: string, autoRename: boolean, title: string | null) => void
  onClose: () => void
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
}

const dialogStyle: React.CSSProperties = {
  backgroundColor: '#2c2c2e',
  borderRadius: 12,
  padding: '20px 24px',
  minWidth: 400,
  color: '#fff',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
}

const titleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  marginBottom: 12
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #555',
  backgroundColor: '#1c1c1e',
  color: '#fff',
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none'
}

const buttonBase: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 6,
  border: 'none',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer'
}

const checkboxRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 12,
  fontSize: 13,
  color: '#ccc'
}

export function UrlInputDialog({ nodeId, onInsert, onClose }: UrlInputDialogProps) {
  const [url, setUrl] = useState('')
  const [fetchedTitle, setFetchedTitle] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [autoRename, setAutoRename] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleFetchTitle = useCallback(async () => {
    if (!url.trim()) return
    setFetching(true)
    try {
      const title = await window.api.fetchPageTitle(url.trim())
      setFetchedTitle(title)
    } catch {
      setFetchedTitle(null)
    }
    setFetching(false)
  }, [url])

  const handleInsert = useCallback(() => {
    if (!url.trim()) return
    onInsert(nodeId, url.trim(), autoRename, fetchedTitle)
  }, [nodeId, url, autoRename, fetchedTitle, onInsert])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleInsert()
    }
  }, [handleInsert])

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={titleStyle}>Insert Web Link</div>

        <input
          ref={inputRef}
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          style={inputStyle}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <button
            style={{ ...buttonBase, backgroundColor: '#444', color: '#fff', fontSize: 12 }}
            onClick={handleFetchTitle}
            disabled={fetching || !url.trim()}
          >
            {fetching ? 'Fetching...' : 'Fetch Page Title'}
          </button>
          {fetchedTitle && (
            <span style={{ fontSize: 12, color: '#8e8' }}>{fetchedTitle}</span>
          )}
        </div>

        <label style={checkboxRow}>
          <input
            type="checkbox"
            checked={autoRename}
            onChange={(e) => setAutoRename(e.target.checked)}
          />
          Auto-fill node name with page title
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            style={{ ...buttonBase, backgroundColor: '#444', color: '#fff' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            style={{ ...buttonBase, backgroundColor: '#5856D6', color: '#fff' }}
            onClick={handleInsert}
            disabled={!url.trim()}
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  )
}
