import { BrowserWindow } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { is } from '@electron-toolkit/utils'

interface WindowState {
  filePath: string | null
  dirty: boolean
}

const windowStates = new Map<number, WindowState>()

export function createWindow(filePath: string | null = null): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'YaMindMap',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  windowStates.set(win.id, { filePath, dirty: false })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Send file content to renderer once ready
  win.webContents.on('did-finish-load', () => {
    if (filePath) {
      readFile(filePath, 'utf-8')
        .then((content) => {
          win.webContents.send('open-file', { filePath, content })
        })
        .catch((err) => {
          console.error('Failed to read file:', err)
        })
    }
  })

  win.on('closed', () => {
    windowStates.delete(win.id)
  })

  updateWindowTitle(win)

  return win
}

export function getWindowState(winId: number): WindowState | undefined {
  return windowStates.get(winId)
}

export function setWindowFilePath(winId: number, filePath: string | null): void {
  const state = windowStates.get(winId)
  if (state) {
    state.filePath = filePath
    const win = BrowserWindow.fromId(winId)
    if (win) updateWindowTitle(win)
  }
}

export function setWindowDirty(winId: number, dirty: boolean): void {
  const state = windowStates.get(winId)
  if (state) {
    state.dirty = dirty
    const win = BrowserWindow.fromId(winId)
    if (win) {
      win.setDocumentEdited(dirty)
      updateWindowTitle(win)
    }
  }
}

function updateWindowTitle(win: BrowserWindow): void {
  const state = windowStates.get(win.id)
  if (!state) return

  const name = state.filePath
    ? state.filePath.split('/').pop()?.replace('.yamind', '') || 'Untitled'
    : 'Untitled'
  const dirtyMark = state.dirty ? ' •' : ''
  win.setTitle(`${name}${dirtyMark} — YaMindMap`)
}

let settingsWindow: BrowserWindow | null = null

export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 780,
    height: 680,
    title: 'Settings — YaMindMap',
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?settings')
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { settings: '1' } })
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

export function getAllWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows()
}
