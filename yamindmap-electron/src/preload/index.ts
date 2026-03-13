import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  openPath: (filePath: string): Promise<void> => ipcRenderer.invoke('open-path', filePath),
  showOpenDialogDocument: (): Promise<string | null> => ipcRenderer.invoke('show-open-dialog-document'),
  showOpenDialogPhoto: (): Promise<string | null> => ipcRenderer.invoke('show-open-dialog-photo'),
  fetchPageTitle: (url: string): Promise<string | null> => ipcRenderer.invoke('fetch-page-title', url)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
