import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '@trainer-log/shared/components/common/Toast'
import GymPortal from './pages/GymPortal'
import '@trainer-log/shared/styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <GymPortal />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)
