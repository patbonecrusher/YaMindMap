import { BrowserWindow } from 'electron'
import { join } from 'path'
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

  // Send file path to renderer once ready
  win.webContents.on('did-finish-load', () => {
    if (filePath) {
      win.webContents.send('open-file', filePath)
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

export function getAllWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows()
}
