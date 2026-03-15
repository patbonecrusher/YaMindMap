import { createRoot } from 'react-dom/client'
import { App } from './App'
import { SettingsApp } from './components/settings/SettingsApp'

const isSettings = window.location.search.includes('settings')
const root = document.getElementById('root')!

createRoot(root).render(isSettings ? <SettingsApp /> : <App />)
