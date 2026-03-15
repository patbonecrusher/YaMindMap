import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { registerFileOperations } from './file-operations'
import { registerSettingsIpc, loadSettings } from './settings-manager'
import { createWindow } from './window-manager'
import { setupMenu } from './menu'

if (is.dev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9333')
}

// Track file to open from Finder / argv
let pendingFilePath: string | null = null

// macOS: file opened via Finder double-click or drag
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (app.isReady()) {
    createWindow(filePath)
  } else {
    pendingFilePath = filePath
  }
})

app.whenReady().then(async () => {
  await loadSettings()
  registerIpcHandlers()
  registerFileOperations()
  registerSettingsIpc()
  setupMenu()

  // Check argv for file path (non-mac)
  const fileArg = process.argv.find((arg) => arg.endsWith('.yamind'))
  const initialFile = pendingFilePath || fileArg || null

  createWindow(initialFile)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
