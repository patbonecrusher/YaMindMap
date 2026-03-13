import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { createWindow, setWindowFilePath, setWindowDirty } from './window-manager'

export function registerFileOperations(): void {
  // New document
  ipcMain.handle('file-new', () => {
    createWindow()
  })

  // Open file dialog
  ipcMain.handle('file-open', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      title: 'Open Mind Map',
      properties: ['openFile'],
      filters: [
        { name: 'YaMindMap Files', extensions: ['yamind'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]

    try {
      const content = await readFile(filePath, 'utf-8')
      setWindowFilePath(win.id, filePath)
      setWindowDirty(win.id, false)
      return { filePath, content }
    } catch (err) {
      dialog.showErrorBox('Error', `Could not open file: ${err}`)
      return null
    }
  })

  // Open specific file (from Finder or argv)
  ipcMain.handle('file-open-path', async (_event, filePath: string) => {
    try {
      const content = await readFile(filePath, 'utf-8')
      return { filePath, content }
    } catch (err) {
      dialog.showErrorBox('Error', `Could not open file: ${err}`)
      return null
    }
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
