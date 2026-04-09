import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from './components/common/Toast'
import Landing from './pages/Landing'
import AdminPortal from './pages/AdminPortal'
import TrainerApp from './pages/TrainerApp'
import MemberPortal from './pages/MemberPortal'
import Report from './pages/Report'
import CommunityPortal from './pages/CommunityPortal'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/admin" element={<AdminPortal />} />
          <Route path="/trainer" element={<TrainerApp />} />
          <Route path="/member" element={<MemberPortal />} />
          <Route path="/report" element={<Report />} />
          <Route path="/community" element={<CommunityPortal />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
