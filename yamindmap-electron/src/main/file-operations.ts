import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { createWindow, setWindowDirty } from './window-manager'

/** Show open dialog and create a new window with the selected file */
export async function openFileDialog(parentWin?: BrowserWindow): Promise<void> {
  const result = await dialog.showOpenDialog(parentWin ? { ...openDialogOptions } : openDialogOptions)
  if (result.canceled || result.filePaths.length === 0) return
  createWindow(result.filePaths[0])
}

const openDialogOptions = {
  title: 'Open Mind Map',
  properties: ['openFile' as const],
  filters: [
    { name: 'YaMindMap Files', extensions: ['yamind'] },
    { name: 'All Files', extensions: ['*'] }
  ]
}

export function registerFileOperations(): void {
  // New document
  ipcMain.handle('file-new', () => {
    createWindow()
  })

  // Open file dialog — always opens in a new window
  ipcMain.handle('file-open', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    await openFileDialog(win ?? undefined)
    return null
  })

  // Save to current path
  ipcMain.handle('file-save', async (event, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false

    const { getWindowState } = await import('./window-manager')
    const state = getWindowState(win.id)

    if (!state?.filePath) {
      return await saveAs(win, content)
    }

    try {
      await writeFile(state.filePath, content, 'utf-8')
      setWindowDirty(win.id, false)
      return true
    } catch (err) {
      dialog.showErrorBox('Error', `Could not save file: ${err}`)
      return false
    }
  })

  // Save As
  ipcMain.handle('file-save-as', async (event, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    return await saveAs(win, content)
  })

  // Update dirty state from renderer
  ipcMain.on('set-dirty', (event, dirty: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      setWindowDirty(win.id, dirty)
    }
  })
}

async function saveAs(win: BrowserWindow, content: string): Promise<boolean> {
  const result = await dialog.showSaveDialog(win, {
    title: 'Save Mind Map',
    defaultPath: 'untitled.yamind',
    filters: [
      { name: 'YaMindMap Files', extensions: ['yamind'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled || !result.filePath) return false

  try {
    await writeFile(result.filePath, content, 'utf-8')
    setWindowFilePath(win.id, result.filePath)
    setWindowDirty(win.id, false)
    return true
  } catch (err) {
    dialog.showErrorBox('Error', `Could not save file: ${err}`)
    return false
  }
}
