import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/deck.css'
import './styles/buttons.css'
import './styles/loops.css'
import './styles/jog.css'
import './styles/fader.css'
import './styles/knob.css'
import './styles/vu.css'
import './styles/mixer.css'
import './styles/library.css'
import './styles/overlays.css'
import './styles/update.css'
import './styles/animations.css'
import './styles/responsive.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
