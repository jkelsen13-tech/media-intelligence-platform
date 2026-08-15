import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/news.css'
import { applyThemeFlag } from './lib/themeFlag'

// 04_TRACK_B Step 1: resolve the theme flag BEFORE first paint so users never
// see a dark-then-light flash when the light theme is enabled. Withhold
// posture: any flag-read failure still renders, in the default dark theme.
applyThemeFlag().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
