import { BrowserWindow, ipcMain } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import type { ShortcutBinding } from '../shared/shortcuts'
import { DEFAULT_SHORTCUTS } from '../shared/shortcuts'

interface Settings {
  shortcuts: ShortcutBinding[]
  defaultTheme: string
}

function getSettingsDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    return join(appData, 'yamindmap')
  }
  return join(homedir(), '.config', 'yamindmap')
}

function getSettingsPath(): string {
  return join(getSettingsDir(), 'settings.json')
}

let currentSettings: Settings = { shortcuts: [...DEFAULT_SHORTCUTS], defaultTheme: 'Default Blue' }

async function ensureDir(): Promise<void> {
  const dir = getSettingsDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

export async function loadSettings(): Promise<Settings> {
  try {
    const path = getSettingsPath()
    if (!existsSync(path)) return currentSettings
    const content = await readFile(path, 'utf-8')
    const parsed = JSON.parse(content) as Partial<Settings>
    if (parsed.shortcuts && Array.isArray(parsed.shortcuts)) {
      currentSettings.shortcuts = parsed.shortcuts
    }
    if (typeof parsed.defaultTheme === 'string') {
      currentSettings.defaultTheme = parsed.defaultTheme
    }
  } catch {
    // Use defaults on error
  }
  return currentSettings
}

async function saveSettings(): Promise<void> {
  await ensureDir()
  await writeFile(getSettingsPath(), JSON.stringify(currentSettings, null, 2), 'utf-8')
}

function broadcastSettings(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings-changed', currentSettings)
  }
}

export function getSettings(): Settings {
  return currentSettings
}

export function registerSettingsIpc(): void {
  ipcMain.handle('get-settings', () => {
    return currentSettings
  })

  ipcMain.handle('update-shortcuts', async (_event, shortcuts: ShortcutBinding[]) => {
    currentSettings.shortcuts = shortcuts
    await saveSettings()
    broadcastSettings()
    return true
  })

  ipcMain.handle('reset-shortcuts', async () => {
    currentSettings.shortcuts = [...DEFAULT_SHORTCUTS]
    await saveSettings()
    broadcastSettings()
    return currentSettings
  })

  ipcMain.handle('update-default-theme', async (_event, themeName: string) => {
    currentSettings.defaultTheme = themeName
    await saveSettings()
    broadcastSettings()
    return true
  })
}
