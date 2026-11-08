import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// 탭 화면의 버튼을 상단 제목 줄 오른쪽(GymOwnerPortal 의 #crm-topbar-slot)에 놓는다.
export default function TopbarActions({ children }) {
  const [el, setEl] = useState(null)
  useEffect(() => { setEl(document.getElementById('crm-topbar-slot')) }, [])
  return el ? createPortal(children, el) : null
}
