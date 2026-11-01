// 선 아이콘 모음 — 이모지 대신 쓰는 공통 아이콘 (디자인 개편 2026-11).
// 24×24 stroke 아이콘. color 기본값 currentColor 라 부모 글자색을 따른다.
// 새 아이콘이 필요하면 PATHS 에 추가하고 <Icon name="..." /> 로 쓴다.
const PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6" /><path d="M16 4.1a4 4 0 0 1 0 7.8M22 21c0-3-1.7-5-4-5.7" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  calendarCheck: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 15l2 2 4-4" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12l5 5 9-10" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  pencil: <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16z" />,
  chevronLeft: <path d="M15 18l-6-6 6-6" />,
  chevronRight: <path d="M9 18l6-6-6-6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronUp: <path d="M18 15l-6-6-6 6" />,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  clip: <path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3l7.5-7.5" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  hourglass: <path d="M6 2h12M6 22h12M7 2c0 5 5 6 5 10s-5 5-5 10M17 2c0 5-5 6-5 10s5 5 5 10" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  dumbbell: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  utensils: <path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 2c-2 2-3 4-3 7s1 4 3 4v9" />,
  scale: <><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M8.5 10a4.5 4.5 0 0 1 7 0" /><path d="M12 10l1.5-2" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  pause: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>,
  bookmark: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  trash: <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />,
  building: <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20" />,
  trophy: <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 6H4.5v1A2.5 2.5 0 0 0 7 9.5M17 6h2.5v1A2.5 2.5 0 0 1 17 9.5" />,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  bank: <path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z" />,
  coins: <><circle cx="9" cy="9" r="6" /><path d="M15.5 9.5a6 6 0 1 1-6 6" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  box: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></>,
  bulb: <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />,
  play: <path d="M8 5v14l11-7z" />,
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></>,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  shield: <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />,
  megaphone: <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14" />,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.5 12h11l2-8H6.2" /></>,
}

export default function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 2, fill = 'none', title, style }) {
  const p = PATHS[name]
  if (!p) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} aria-label={title}
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style }}>
      {p}
    </svg>
  )
}
