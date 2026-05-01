import { useState } from 'react'
import Login from './Login'
import GymOwnerPortal from './GymOwnerPortal'
import './styles/crm.css'

export default function CrmApp() {
  const [trainer, setTrainer] = useState(null)
  const [gym,     setGym]     = useState(null)

  function handleLogin(t, g) {
    setTrainer(t)
    setGym(g)
  }

  function handleLogout() {
    setTrainer(null)
    setGym(null)
  }

  if (!trainer || !gym) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <GymOwnerPortal
      trainer={trainer}
      gym={gym}
      onLogout={handleLogout}
    />
  )
}
