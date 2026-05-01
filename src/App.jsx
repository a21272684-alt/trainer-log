import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from './components/common/Toast'
import Landing from './pages/Landing'
import TrainerApp from './pages/TrainerApp'
import MemberPortal from './pages/MemberPortal'
import Report from './pages/Report'
import CommunityPortal from './pages/CommunityPortal'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Refund from './pages/Refund'
import GymPortal from './pages/GymPortal'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/trainer" element={<TrainerApp />} />
          <Route path="/member" element={<MemberPortal />} />
          <Route path="/report" element={<Report />} />
          <Route path="/community" element={<CommunityPortal />} />
          <Route path="/gym" element={<GymPortal />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/refund" element={<Refund />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
