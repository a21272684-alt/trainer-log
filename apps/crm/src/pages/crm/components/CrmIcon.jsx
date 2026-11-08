// CRM 선 아이콘 — 메뉴 · 버튼에 쓰던 이모지를 대신한다.
// 24×24 기준, 색은 글자색(currentColor)을 따른다.

const PATHS = {
  home:      <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  calendar:  <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4V3h6v1M9 13l2 2 4-4" /></>,
  users:     <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3 2.9-4.6 5.5-4.6s4.9 1.6 5.5 4.6M16 5.5a3 3 0 0 1 0 5.6M18 14.6c1.4.6 2.3 2 2.6 4.4" /></>,
  locker:    <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M12 3v18M8.5 11v2M15.5 11v2" /></>,
  ticket:    <><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6z" /><path d="M14 5v14" strokeDasharray="2 2.5" /></>,
  send:      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  contract:  <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 17c1.5-2 2.5-2 3 0s1.5 1 3-1" /></>,
  chart:     <path d="M4 19V9M10 19V5M16 19v-7M21 19H3" />,
  cash:      <><rect x="3" y="6" width="18" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v5M17.5 9.5v5" /></>,
  box:       <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></>,
  star:      <path d="M12 3l1.9 4.6L19 8l-3.8 3.4L16.3 17 12 14.4 7.7 17l1.1-5.6L5 8l5.1-.4z" />,
  gear:      <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  tablet:    <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M10 18h4" /></>,
  logout:    <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
  search:    <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus:      <path d="M12 5v14M5 12h14" />,
  refresh:   <><path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" /></>,
  clock:     <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></>,
  userAway:  <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c.8-3.4 3.6-5.2 7-5.2M16 17h5" /></>,
  download:  <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  check:     <path d="m5 12 5 5 9-10" />,
  close:     <path d="M6 6l12 12M18 6 6 18" />,
  alert:     <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></>,
  filter:    <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  lock:      <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  note:      <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  user:      <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c.8-3.4 3.6-5.2 7-5.2s6.2 1.8 7 5.2" /></>,
}

export default function CrmIcon({ name, size = 17, stroke = 2, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={style} className={className}>
      {PATHS[name] || null}
    </svg>
  )
}
