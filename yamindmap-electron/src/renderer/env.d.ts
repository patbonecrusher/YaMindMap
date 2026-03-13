interface Window {
  api: {
    openExternal: (url: string) => Promise<void>
    openPath: (filePath: string) => Promise<void>
    showOpenDialogDocument: () => Promise<string | null>
    showOpenDialogPhoto: () => Promise<string | null>
    fetchPageTitle: (url: string) => Promise<string | null>
  }
}
