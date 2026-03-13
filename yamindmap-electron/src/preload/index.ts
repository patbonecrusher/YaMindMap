import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Attachment operations
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  openPath: (filePath: string): Promise<void> => ipcRenderer.invoke('open-path', filePath),
  showOpenDialogDocument: (): Promise<string | null> => ipcRenderer.invoke('show-open-dialog-document'),
  showOpenDialogPhoto: (): Promise<string | null> => ipcRenderer.invoke('show-open-dialog-photo'),
  fetchPageTitle: (url: string): Promise<string | null> => ipcRenderer.invoke('fetch-page-title', url),

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
  onOpenFile: (callback: (filePath: string) => void): (() => void) => {
    const handler = (_event: unknown, filePath: string): void => callback(filePath)
    ipcRenderer.on('open-file', handler)
    return () => ipcRenderer.removeListener('open-file', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
