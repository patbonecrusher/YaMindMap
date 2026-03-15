import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { net } from 'electron'

export function registerIpcHandlers(): void {
  // Close the sender's window
  ipcMain.on('close-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.close()
  })

  // Open URL in default browser
  ipcMain.handle('open-external', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  // Open file in default app
  ipcMain.handle('open-path', async (_event, filePath: string) => {
    await shell.openPath(filePath)
  })

  // Show open dialog for documents
  ipcMain.handle('show-open-dialog-document', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Attach Document',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Show open dialog for photos
  ipcMain.handle('show-open-dialog-photo', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Attach Photo',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Get window bounds (size + position)
  ipcMain.handle('get-window-bounds', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const bounds = win.getBounds()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  })

  // Set window bounds (size + position)
  ipcMain.handle('set-window-bounds', (event, bounds: { x?: number; y?: number; width?: number; height?: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const current = win.getBounds()
    win.setBounds({
      x: bounds.x ?? current.x,
      y: bounds.y ?? current.y,
      width: bounds.width ?? current.width,
      height: bounds.height ?? current.height
    })
  })

  // Fetch page title from URL
  ipcMain.handle('fetch-page-title', async (_event, url: string): Promise<string | null> => {
    try {
      const response = await net.fetch(url, {
        headers: { 'User-Agent': 'YaMindMap/1.0' }
      })
      if (!response.ok) return null
      const html = await response.text()
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      return match ? match[1].trim() : null
    } catch {
      return null
    }
  })
}
