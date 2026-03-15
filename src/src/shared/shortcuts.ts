/** All shortcut actions in the app */
export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomFit'
  | 'addChild'
  | 'addSibling'
  | 'editNode'
  | 'deleteNode'
  | 'toggleFold'
  | 'insertUrl'
  | 'attachDocument'
  | 'attachPhoto'
  | 'createBoundary'
  | 'toggleStylePanel'

/** Human-readable labels for each action */
export const ACTION_LABELS: Record<ShortcutAction, string> = {
  undo: 'Undo',
  redo: 'Redo',
  zoomIn: 'Zoom In',
  zoomOut: 'Zoom Out',
  zoomFit: 'Zoom to Fit',
  addChild: 'Add Child',
  addSibling: 'Add Sibling',
  editNode: 'Edit Node',
  deleteNode: 'Delete',
  toggleFold: 'Toggle Fold',
  insertUrl: 'Insert Web Link',
  attachDocument: 'Attach Document',
  attachPhoto: 'Attach Photo',
  createBoundary: 'Create Boundary',
  toggleStylePanel: 'Toggle Style Panel'
}

/**
 * Shortcut binding format: modifier keys + key name
 * Examples: "Meta+z", "Meta+Shift+z", "Tab", "e", "Delete"
 */
export interface ShortcutBinding {
  action: ShortcutAction
  key: string
  meta: boolean
  shift: boolean
  alt: boolean
}

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { action: 'undo', key: 'z', meta: true, shift: false, alt: false },
  { action: 'redo', key: 'z', meta: true, shift: true, alt: false },
  { action: 'zoomIn', key: '=', meta: true, shift: false, alt: false },
  { action: 'zoomOut', key: '-', meta: true, shift: false, alt: false },
  { action: 'zoomFit', key: '0', meta: true, shift: false, alt: false },
  { action: 'addChild', key: 'Tab', meta: false, shift: false, alt: false },
  { action: 'addSibling', key: 'Enter', meta: false, shift: false, alt: false },
  { action: 'editNode', key: 'e', meta: false, shift: false, alt: false },
  { action: 'deleteNode', key: 'Backspace', meta: false, shift: false, alt: false },
  { action: 'toggleFold', key: '/', meta: true, shift: false, alt: false },
  { action: 'insertUrl', key: 'k', meta: true, shift: false, alt: false },
  { action: 'attachDocument', key: 'k', meta: true, shift: true, alt: false },
  { action: 'attachPhoto', key: 'p', meta: true, shift: true, alt: false },
  { action: 'createBoundary', key: 'g', meta: true, shift: false, alt: false },
  { action: 'toggleStylePanel', key: '.', meta: true, shift: false, alt: false }
]

/** Detect platform safely (works in both main and renderer) */
function isMac(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.platform?.startsWith('Mac') || navigator.userAgent?.includes('Mac')
  }
  if (typeof process !== 'undefined') {
    return process.platform === 'darwin'
  }
  return false
}

/** Serialize a binding to a human-readable string */
export function bindingToString(b: ShortcutBinding): string {
  const parts: string[] = []
  const mac = isMac()
  if (b.meta) parts.push(mac ? '⌘' : 'Ctrl')
  if (b.shift) parts.push('⇧')
  if (b.alt) parts.push(mac ? '⌥' : 'Alt')

  // Pretty-print special keys
  const keyMap: Record<string, string> = {
    Tab: 'Tab',
    Enter: '↵',
    Backspace: '⌫',
    Delete: '⌫',
    ' ': 'Space',
    '=': '+',
    '-': '-',
    '/': '/',
    '.': '.'
  }
  parts.push(keyMap[b.key] ?? b.key.toUpperCase())
  return parts.join('')
}

/** Check if a keyboard event matches a binding */
export function eventMatchesBinding(e: KeyboardEvent, b: ShortcutBinding): boolean {
  const meta = e.metaKey || e.ctrlKey
  if (b.meta !== meta) return false
  if (b.shift !== e.shiftKey) return false
  if (b.alt !== e.altKey) return false

  // Normalize key comparison
  const eventKey = e.key
  if (b.key === 'Backspace' && (eventKey === 'Backspace' || eventKey === 'Delete')) return true
  return eventKey === b.key
}

/** Find conflicts: two different actions with the same key combo */
export function findConflicts(bindings: ShortcutBinding[]): [ShortcutAction, ShortcutAction][] {
  const conflicts: [ShortcutAction, ShortcutAction][] = []
  for (let i = 0; i < bindings.length; i++) {
    for (let j = i + 1; j < bindings.length; j++) {
      const a = bindings[i]
      const b = bindings[j]
      if (a.key === b.key && a.meta === b.meta && a.shift === b.shift && a.alt === b.alt) {
        conflicts.push([a.action, b.action])
      }
    }
  }
  return conflicts
}

/** Serialize bindings for storage */
export function serializeShortcuts(bindings: ShortcutBinding[]): string {
  return JSON.stringify(bindings, null, 2)
}

/** Deserialize bindings from storage */
export function deserializeShortcuts(json: string): ShortcutBinding[] | null {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return null
    return parsed as ShortcutBinding[]
  } catch {
    return null
  }
}
