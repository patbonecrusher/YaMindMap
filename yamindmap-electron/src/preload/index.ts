import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Attachment operations
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  openPath: (filePath: string): Promise<void> => ipcRenderer.invoke('open-path', filePath),
  showOpenDialogDocument: (): Promise<string | null> => ipcRenderer.invoke('show-open-dialog-document'),
  showOpenDialogPhoto: (): Promise<string | null> => ipcRenderer.invoke('show-open-dialog-photo'),
  fetchPageTitle: (url: string): Promise<string | null> => ipcRenderer.invoke('fetch-page-title', url),

  // Window bounds
  getWindowBounds: (): Promise<{ x: number; y: number; width: number; height: number } | null> =>
    ipcRenderer.invoke('get-window-bounds'),
  setWindowBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }): Promise<void> =>
    ipcRenderer.invoke('set-window-bounds', bounds),

  // File operations
  fileNew: (): Promise<void> => ipcRenderer.invoke('file-new'),
  fileOpen: (): Promise<{ filePath: string; content: string } | null> => ipcRenderer.invoke('file-open'),
  fileSave: (content: string): Promise<boolean> => ipcRenderer.invoke('file-save', content),
  fileSaveAs: (content: string): Promise<boolean> => ipcRenderer.invoke('file-save-as', content),
  setDirty: (dirty: boolean): void => ipcRenderer.send('set-dirty', dirty),

  // Menu event listeners
  onMenuOpen: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu-open', handler)
    return () => ipcRenderer.removeListener('menu-open', handler)
  },
  onMenuSave: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu-save', handler)
    return () => ipcRenderer.removeListener('menu-save', handler)
  },
  onMenuSaveAs: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu-save-as', handler)
    return () => ipcRenderer.removeListener('menu-save-as', handler)
  },
  onMenuUndo: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu-undo', handler)
    return () => ipcRenderer.removeListener('menu-undo', handler)
  },
  onMenuRedo: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu-redo', handler)
    return () => ipcRenderer.removeListener('menu-redo', handler)
  },
  onOpenFile: (callback: (data: { filePath: string; content: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { filePath: string; content: string }): void => callback(data)
    ipcRenderer.on('open-file', handler)
    return () => ipcRenderer.removeListener('open-file', handler)
  },

  // Window
  closeWindow: (): void => ipcRenderer.send('close-window'),

  // Settings
  getSettings: (): Promise<{ shortcuts: unknown[] }> => ipcRenderer.invoke('get-settings'),
  updateShortcuts: (shortcuts: unknown[]): Promise<boolean> => ipcRenderer.invoke('update-shortcuts', shortcuts),
  resetShortcuts: (): Promise<{ shortcuts: unknown[]; defaultTheme: string }> => ipcRenderer.invoke('reset-shortcuts'),
  updateDefaultTheme: (themeName: string): Promise<boolean> => ipcRenderer.invoke('update-default-theme', themeName),
  onSettingsChanged: (callback: (settings: { shortcuts: unknown[] }) => void): (() => void) => {
    const handler = (_event: unknown, settings: { shortcuts: unknown[] }): void => callback(settings)
    ipcRenderer.on('settings-changed', handler)
    return () => ipcRenderer.removeListener('settings-changed', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
