import { useState, useEffect, useCallback } from 'react'
import type { ShortcutBinding, ShortcutAction } from '../../../shared/shortcuts'
import { ACTION_LABELS, DEFAULT_SHORTCUTS, bindingToString, findConflicts } from '../../../shared/shortcuts'
import { BUILT_IN_THEMES } from '../../../shared/themes'

type Tab = 'theme' | 'shortcuts'

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100vh',
  backgroundColor: '#1e1e20',
  color: '#ddd',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 13,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  userSelect: 'none'
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #3a3a3c',
  padding: '0'
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  color: active ? '#fff' : '#888',
  backgroundColor: 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid #4A90D9' : '2px solid transparent',
  cursor: 'pointer',
  outline: 'none'
})

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '0'
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 20px',
  borderBottom: '1px solid #2a2a2c'
}

const shortcutBtnStyle: React.CSSProperties = {
  padding: '3px 10px',
  fontSize: 12,
  backgroundColor: '#3a3a3c',
  color: '#ddd',
  border: '1px solid #555',
  borderRadius: 4,
  cursor: 'pointer',
  minWidth: 80,
  textAlign: 'center'
}

const recordingBtnStyle: React.CSSProperties = {
  ...shortcutBtnStyle,
  backgroundColor: '#FF9500',
  color: '#000',
  border: '1px solid #FF9500'
}

const footerStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid #3a3a3c',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8
}

const btnStyle: React.CSSProperties = {
  padding: '6px 18px',
  fontSize: 12,
  backgroundColor: '#3a3a3c',
  color: '#ddd',
  border: '1px solid #555',
  borderRadius: 4,
  cursor: 'pointer'
}

const primaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  backgroundColor: '#4A90D9',
  border: '1px solid #3D7AB8',
  color: '#fff'
}

const conflictStyle: React.CSSProperties = {
  color: '#FF453A',
  fontSize: 10,
  marginTop: 2
}

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  backgroundColor: '#3a3a3c',
  color: '#ddd',
  border: '1px solid #555',
  borderRadius: 4,
  cursor: 'pointer',
  minWidth: 160
}

const labelStyle: React.CSSProperties = {
  color: '#bbb',
  fontSize: 12
}

const resetBtnStyle: React.CSSProperties = {
  ...btnStyle,
  fontSize: 11,
  padding: '4px 12px',
  color: '#aaa'
}

export function SettingsApp() {
  const [tab, setTab] = useState<Tab>('theme')
  const [shortcuts, setShortcuts] = useState<ShortcutBinding[]>([])
  const [defaultTheme, setDefaultTheme] = useState('Default Blue')
  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Load settings on mount
  useEffect(() => {
    window.api.getSettings().then((settings) => {
      setShortcuts(settings.shortcuts as ShortcutBinding[])
      if (settings.defaultTheme) setDefaultTheme(settings.defaultTheme)
      setLoaded(true)
    })
  }, [])

  // Record key when in recording mode
  useEffect(() => {
    if (!recording) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return

      const newBinding: ShortcutBinding = {
        action: recording,
        key: e.key,
        meta: e.metaKey || e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey
      }

      setShortcuts((prev) =>
        prev.map((b) => (b.action === recording ? newBinding : b))
      )
      setRecording(null)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recording])

  // Esc to close (Cmd+, is handled by the menu accelerator in main process)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (recording) return
      if (e.key === 'Escape') {
        e.preventDefault()
        window.api.closeWindow()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [recording])

  const handleReset = useCallback(async () => {
    setShortcuts([...DEFAULT_SHORTCUTS])
  }, [])

  const handleApply = useCallback(async () => {
    await window.api.updateShortcuts(shortcuts)
    await window.api.updateDefaultTheme(defaultTheme)
    window.api.closeWindow()
  }, [shortcuts, defaultTheme])

  const handleCancel = useCallback(() => {
    window.api.closeWindow()
  }, [])

  const conflicts = findConflicts(shortcuts)
  const conflictActions = new Set(conflicts.flat())

  if (!loaded) return null

  return (
    <div style={containerStyle}>
      <div style={tabBarStyle}>
        <button style={tabStyle(tab === 'theme')} onClick={() => setTab('theme')}>
          Theme
        </button>
        <button style={tabStyle(tab === 'shortcuts')} onClick={() => { setTab('shortcuts'); setRecording(null) }}>
          Shortcuts
        </button>
      </div>

      <div style={contentStyle}>
        {tab === 'theme' && (
          <>
            <div style={{ padding: '16px 20px 8px', color: '#888', fontSize: 12 }}>
              Choose the default theme applied to new documents.
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Default theme</span>
              <select
                style={selectStyle}
                value={defaultTheme}
                onChange={(e) => setDefaultTheme(e.target.value)}
              >
                {BUILT_IN_THEMES.map((theme) => (
                  <option key={theme.name} value={theme.name}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {tab === 'shortcuts' && (
          <>
            {shortcuts.map((binding) => (
              <div key={binding.action}>
                <div style={rowStyle}>
                  <span>{ACTION_LABELS[binding.action]}</span>
                  <button
                    style={recording === binding.action ? recordingBtnStyle : shortcutBtnStyle}
                    onClick={() => setRecording(recording === binding.action ? null : binding.action)}
                  >
                    {recording === binding.action ? 'Press key...' : bindingToString(binding)}
                  </button>
                </div>
                {conflictActions.has(binding.action) && (
                  <div style={{ ...conflictStyle, paddingLeft: 20, paddingBottom: 4 }}>
                    Conflict with another shortcut
                  </div>
                )}
              </div>
            ))}
            <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-start' }}>
              <button style={resetBtnStyle} onClick={handleReset}>
                Reset to Defaults
              </button>
            </div>
          </>
        )}
      </div>

      <div style={footerStyle}>
        <button style={btnStyle} onClick={handleCancel}>
          Cancel
        </button>
        <button style={primaryBtnStyle} onClick={handleApply}>
          Apply
        </button>
      </div>
    </div>
  )
}
