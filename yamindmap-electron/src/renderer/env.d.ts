interface Window {
  api: {
    // Attachment operations
    openExternal: (url: string) => Promise<void>
    openPath: (filePath: string) => Promise<void>
    showOpenDialogDocument: () => Promise<string | null>
    showOpenDialogPhoto: () => Promise<string | null>
    fetchPageTitle: (url: string) => Promise<string | null>

    // Window bounds
    getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>
    setWindowBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }) => Promise<void>

    // File operations
    fileNew: () => Promise<void>
    fileOpen: () => Promise<{ filePath: string; content: string } | null>
    fileSave: (content: string) => Promise<boolean>
    fileSaveAs: (content: string) => Promise<boolean>
    setDirty: (dirty: boolean) => void

    // Menu event listeners
    onMenuOpen: (callback: () => void) => () => void
    onMenuSave: (callback: () => void) => () => void
    onMenuSaveAs: (callback: () => void) => () => void
    onMenuUndo: (callback: () => void) => () => void
    onMenuRedo: (callback: () => void) => () => void
    onOpenFile: (callback: (data: { filePath: string; content: string }) => void) => () => void
  }
}
