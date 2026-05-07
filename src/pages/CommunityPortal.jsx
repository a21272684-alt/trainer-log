import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/common/Toast'
import TermsAgreementModal from '../components/common/TermsAgreementModal'

/* ═══════════════════════════════════════════════
   Storage 비용 절감용 클라이언트 이미지 압축기
   - 외부 라이브러리 없이 Canvas API만 사용
   - 최대 너비 1024px, WebP, 품질 0.8
   - GIF 또는 변환 실패 시 원본 그대로 fallback
═══════════════════════════════════════════════ */
const IMG_MAX_WIDTH = 1024
const IMG_QUALITY = 0.8

function compressImageFile(file, { maxWidth = IMG_MAX_WIDTH, quality = IMG_QUALITY } = {}) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) { resolve(file); return }
    if (file.type === 'image/gif') { resolve(file); return } // GIF 애니메이션 보존
    const reader = new FileReader()
    reader.onerror = () => resolve(file)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => resolve(file)
      img.onload = () => {
        try {
          const ratio = img.width > maxWidth ? maxWidth / img.width : 1
          const w = Math.round(img.width * ratio)
          const h = Math.round(img.height * ratio)
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return }
            // 압축 결과가 원본보다 크면 원본 유지
            if (blob.size >= file.size) { resolve(file); return }
            const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')
            const compressed = new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() })
            resolve(compressed)
          }, 'image/webp', quality)
        } catch {
          resolve(file)
        }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

/* ═══════════════════════════════════════════════
   Design tokens
═══════════════════════════════════════════════ */
const T = {
  accent:      '#10B981',
  accentLight: '#D1FAE5',
  accentText:  '#065F46',
  bg:          '#F9FAFB',
  surface:     '#FFFFFF',
  surface2:    '#F3F4F6',
  border:      '#E5E7EB',
  text:        '#111827',
  muted:       '#6B7280',
  dim:         '#9CA3AF',
  danger:      '#EF4444',
  blue:        '#3B82F6',
  purple:      '#8B5CF6',
  orange:      '#F59E0B',
  pink:        '#EC4899',
  cyan:        '#06B6D4',
  yellow:      '#FEE500',
  shadow:      '0 1px 4px rgba(0,0,0,0.06)',
  shadowMd:    '0 4px 18px rgba(0,0,0,0.09)',
}

/* ═══════════════════════════════════════════════
   Category metadata
═══════════════════════════════════════════════ */
const CAT = {
  trainer_hire:     { label: '트레이너 채용',    emoji: '👔', color: T.blue,   tab: 'jobs',    hint: '트레이너를 채용하는 센터·개인 PT 사업자' },
  trainer_seek:     { label: '구직 (트레이너)',   emoji: '🙋', color: T.purple, tab: 'jobs',    hint: '일자리를 찾는 트레이너' },
  gym_partner:      { label: '센터 제휴·협력',   emoji: '🤝', color: T.orange, tab: 'jobs',    hint: '센터 간 협력 및 제휴 제안' },
  education_hire:   { label: '수강생 구인',       emoji: '📚', color: T.pink,   tab: 'jobs',    hint: '교육 강좌·세미나 수강생 모집' },
  member_recruit:   { label: '레슨 회원 모집',    emoji: '🏋️', color: T.accent, tab: 'ptmatch', hint: '1:1 PT·그룹 레슨 회원을 모집하는 트레이너' },
  find_trainer:     { label: '트레이너 찾기',     emoji: '🔍', color: T.cyan,   tab: 'ptmatch', hint: 'PT 받고 싶은 회원이 트레이너를 구하는 글' },
  market_routine:   { label: '운동 루틴',         emoji: '💪', color: T.accent, tab: 'market',  hint: '운동 루틴 데이터 판매' },
  market_program:   { label: '트레이닝 프로그램', emoji: '📅', color: T.blue,   tab: 'market',  hint: '주차별 트레이닝 계획 판매' },
  market_nutrition: { label: '식단 가이드',       emoji: '🥗', color: T.orange, tab: 'market',  hint: '목표별 식단·칼로리 가이드 판매' },
  market_content:   { label: '교육 콘텐츠',       emoji: '📖', color: T.purple, tab: 'market',  hint: '강의·세미나 자료 판매' },
}

const JOB_CATS     = ['trainer_hire','trainer_seek','gym_partner','education_hire']
const PTMATCH_CATS = ['member_recruit','find_trainer']
const MARKET_CATS  = ['market_routine','market_program','market_nutrition','market_content']

const ROLE = {
  trainer:    { label: '트레이너',  emoji: '💪', color: T.accent },
  member:     { label: '회원',      emoji: '🏃', color: T.blue },
  educator:   { label: '교육강사',  emoji: '📚', color: T.purple },
  gym_owner:  { label: '센터대표',  emoji: '🏢', color: T.orange },
  instructor: { label: '강사',      emoji: '🎓', color: T.pink },
}

/* ═══════════════════════════════════════════════
   Utility helpers
═══════════════════════════════════════════════ */
function timeAgo(d) {
  const m = Math.floor((Date.now() - new Date(d)) / 60000)
  if (m < 1)  return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}
function fmtPrice(p) { return p === 0 ? '무료' : `${Number(p).toLocaleString()}원` }

function isVideoUrl(url) {
  if (!url) return false
  return /youtube\.com|youtu\.be|vimeo\.com/i.test(url)
}

/* ═══════════════════════════════════════════════
   Sub-components
═══════════════════════════════════════════════ */
function Avatar({ user, size = 36 }) {
  if (user?.avatar_url) return (
    <img
      src={user.avatar_url} alt={user?.name || ''}
      crossOrigin="anonymous"
      style={{ width: size, height: size, borderRadius: '50%',
        objectFit: 'cover', flexShrink: 0, border: `2px solid ${T.border}` }}
    />
  )
  const r = ROLE[user?.role]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: r?.color || T.accent, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: Math.round(size * 0.38),
    }}>
      {user?.name?.[0] || '?'}
    </div>
  )
}

function CatBadge({ cat }) {
  const c = CAT[cat]; if (!c) return null
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: c.color + '1a', color: c.color, border: `1px solid ${c.color}30`,
      display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
    }}>{c.emoji} {c.label}</span>
  )
}

function RoleBadge({ role }) {
  const r = ROLE[role]; if (!r) return null
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
      background: r.color + '1a', color: r.color, border: `1px solid ${r.color}30`,
    }}>{r.emoji} {r.label}</span>
  )
}

function StatusBadge({ status }) {
  const MAP = {
    pending:  { label: '대기중', bg: '#FEF3C7', color: '#D97706' },
    accepted: { label: '수락됨', bg: T.accentLight, color: T.accentText },
    rejected: { label: '거절됨', bg: '#FEE2E2', color: '#DC2626' },
  }
  const s = MAP[status]; if (!s) return null
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px',
      borderRadius: 10, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

/* ── PostCard ── */
function PostCard({ post, onClick, myId }) {
  const isClosed = post.status === 'closed'
  return (
    <div onClick={onClick} style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 14, padding: '14px 16px', marginBottom: 10,
      cursor: 'pointer', position: 'relative', overflow: 'hidden',
      boxShadow: T.shadow, opacity: isClosed ? 0.6 : 1,
    }}>
      {isClosed && (
        <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10,
          fontWeight: 800, color: T.dim, background: T.surface2,
          padding: '2px 7px', borderRadius: 8 }}>마감</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <CatBadge cat={post.category} />
        {post.user_id === myId && (
          <span style={{ fontSize: 10, color: T.dim, marginLeft: 'auto' }}>내 글</span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 5, lineHeight: 1.4 }}>
        {post.title}
      </div>
      {post.location && (
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 5 }}>📍 {post.location}</div>
      )}
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 8 }}>
        {post.content?.length > 90 ? post.content.slice(0, 90) + '…' : post.content}
      </div>
      {post.image_urls?.[0] && (
        <div style={{ marginBottom: 8, borderRadius: 8, overflow: 'hidden',
          height: 110, position: 'relative' }}>
          <img src={post.image_urls[0]} alt="" crossOrigin="anonymous"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {post.image_urls.length > 1 && (
            <span style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 10,
              background: 'rgba(0,0,0,0.55)', color: '#fff',
              padding: '2px 6px', borderRadius: 6 }}>+{post.image_urls.length - 1}</span>
          )}
        </div>
      )}
      {post.video_url && (
        <div style={{ fontSize: 11, color: T.blue, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          ▶ 영상 첨부됨
        </div>
      )}
      {post.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {post.tags.map(t => (
            <span key={t} style={{ fontSize: 10, color: T.muted, background: T.surface2,
              padding: '2px 7px', borderRadius: 10 }}>#{t}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <Avatar user={post.author} size={20} />
        <RoleBadge role={post.author?.role} />
        <span style={{ fontSize: 11, color: T.muted }}>{post.author?.name}</span>
        {post.author?.location && (
          <span style={{ fontSize: 10, color: T.dim }}>· {post.author.location}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: T.dim }}>{timeAgo(post.created_at)}</span>
        {post.contact_count > 0 && (
          <span style={{ fontSize: 10, color: T.muted }}>💬 {post.contact_count}</span>
        )}
      </div>
    </div>
  )
}

/* ── MarketCard ── */
function MarketCard({ item, isPurchased, isMine, onClick }) {
  const isFree = item.price === 0
  return (
    <div onClick={onClick} style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 14, padding: '14px 16px', marginBottom: 10,
      cursor: 'pointer', boxShadow: T.shadow,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <CatBadge cat={item.category} />
        {(isPurchased || isMine) && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10,
            background: T.accentLight, color: T.accentText }}>
            {isMine ? '내 상품' : '🔓 구매완료'}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800,
          color: isFree ? T.accent : T.text }}>
          {fmtPrice(item.price)}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 5 }}>
        {item.title}
      </div>
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 8 }}>
        {item.content?.length > 70 ? item.content.slice(0, 70) + '…' : item.content}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Avatar user={item.author} size={20} />
        <span style={{ fontSize: 11, color: T.muted }}>{item.author?.name}</span>
        <RoleBadge role={item.author?.role} />
        <span style={{ marginLeft: 'auto', fontSize: 10, color: T.dim }}>{timeAgo(item.created_at)}</span>
      </div>
    </div>
  )
}

/* ── Reusable Input / Textarea ── */
function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 6 }}>
          {label}{required && <span style={{ color: T.danger, marginLeft: 2 }}>*</span>}
        </div>
      )}
      {children}
      {hint && <div style={{ fontSize: 10, color: T.dim, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1.5px solid ${T.border}`, background: T.surface,
  fontSize: 13, color: T.text, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}
const textareaStyle = { ...inputStyle, resize: 'vertical', lineHeight: 1.7 }

/* ── Section header ── */
function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.dim,
      letterSpacing: '0.06em', padding: '14px 16px 8px',
      textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

/* ── Back header ── */
function BackHeader({ onBack, title, right }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: T.surface, borderBottom: `1px solid ${T.border}`,
      padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: T.shadow,
    }}>
      <button onClick={onBack} style={{
        background: 'none', border: `1.5px solid ${T.border}`, color: T.muted,
        borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
        fontSize: 16, lineHeight: 1, fontFamily: 'inherit',
      }}>←</button>
      <span style={{ fontSize: 15, fontWeight: 700, color: T.text, flex: 1 }}>{title}</span>
      {right}
    </div>
  )
}

/* ── KakaoTalk button ── */
function KakaoBtn({ link }) {
  if (!link) return null
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: '13px 16px', borderRadius: 12, background: T.yellow, color: '#191919',
      fontWeight: 800, fontSize: 14, textDecoration: 'none', width: '100%',
      boxSizing: 'border-box', marginBottom: 10,
    }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path fillRule="evenodd" clipRule="evenodd"
          d="M9 1C4.582 1 1 3.806 1 7.25c0 2.178 1.417 4.09 3.56 5.19l-.91 3.394c-.08.3.264.535.518.356L8.44 13.84c.184.016.37.024.56.024 4.418 0 8-2.806 8-6.25S13.418 1 9 1z"
          fill="#191919"/>
      </svg>
      카카오톡으로 문의하기
    </a>
  )
}

/* ── Video link display ── */
function VideoLink({ url }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px', borderRadius: 10,
      background: '#EFF6FF', border: `1px solid #BFDBFE`,
      color: T.blue, fontWeight: 600, fontSize: 13,
      textDecoration: 'none', marginBottom: 12,
    }}>
      <span style={{ fontSize: 18 }}>▶</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        영상 보기
      </span>
      <span style={{ fontSize: 10, color: T.dim }}>↗</span>
    </a>
  )
}

/* ── Btn primitive ── */
function Btn({ children, onClick, variant = 'primary', disabled, style: s }) {
  const base = {
    padding: '11px 18px', borderRadius: 10, fontFamily: 'inherit',
    fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none', transition: 'opacity 0.15s', opacity: disabled ? 0.55 : 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  }
  const variants = {
    primary: { background: T.accent, color: '#fff' },
    ghost:   { background: 'transparent', border: `1.5px solid ${T.border}`, color: T.muted },
    danger:  { background: '#FEE2E2', color: T.danger },
    green:   { background: T.accentLight, color: T.accentText },
    kakao:   { background: T.yellow, color: '#191919' },
  }
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...base, ...variants[variant], ...s }}>
      {children}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function CommunityPortal() {
  const showToast  = useToast()
  const navigate   = useNavigate()
  const postImgRef = useRef(null)
  const regPhotoRef = useRef(null)

  /* ── Auth ── */
  const [screen,   setScreen]   = useState('loading')
  const [user,     setUser]     = useState(null)
  const [authUser, setAuthUser] = useState(null)

  /* ── Bottom nav / sub-screen tracking ── */
  const [navTab,    setNavTab]    = useState('all')  // all|jobs|ptmatch|market|my
  const [prevNav,   setPrevNav]   = useState('all')  // restore on back

  /* ── Feed ── */
  const [posts,       setPosts]       = useState([])
  const [feedLoading, setFeedLoading] = useState(false)

  /* ── Market ── */
  const [marketItems,   setMarketItems]   = useState([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [myPurchases,   setMyPurchases]   = useState([])

  /* ── Post detail ── */
  const [selPost,          setSelPost]          = useState(null)
  const [contacts,         setContacts]         = useState([])
  const [myContact,        setMyContact]        = useState(null)
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactMsg,       setContactMsg]       = useState('')

  /* ── Market detail ── */
  const [selMarket,     setSelMarket]     = useState(null)
  const [marketContent, setMarketContent] = useState(null)  // market_item_contents row
  const [purchasing,    setPurchasing]    = useState(false)
  // 연락 요청 중복 발송 방어
  const [sendingContact, setSendingContact] = useState(false)

  /* ── Write post form ── */
  const INIT_WRITE = {
    cat: '', title: '', content: '', videoUrl: '',
    location: '', tags: [], tagInput: '', images: [], imagePreviews: [],
  }
  const [wf, setWf]         = useState(INIT_WRITE)
  const [uploading, setUploading] = useState(false)

  /* ── Market-write form ── */
  const INIT_MW = {
    type: 'market_routine', title: '', content: '', price: 0,
    videoUrl: '', externalUrl: '', routineJson: '',
    tags: [], tagInput: '',
  }
  const [mw, setMw] = useState(INIT_MW)

  /* ── My page ── */
  const [myTab,            setMyTab]            = useState('posts')
  const [myPosts,          setMyPosts]          = useState([])
  const [sentContacts,     setSentContacts]     = useState([])
  const [receivedContacts, setReceivedContacts] = useState([])
  const [myPurchasedItems, setMyPurchasedItems] = useState([])

  /* ── Register form ── */
  const INIT_REG = { name: '', role: '', location: '', bio: '', phone: '', kakaoLink: '' }
  const [reg,          setReg]          = useState(INIT_REG)
  const [regPhoto,     setRegPhoto]     = useState(null)
  const [regPreview,   setRegPreview]   = useState('')
  const [regUploading, setRegUploading] = useState(false)

  /* ════════════════════════════════
     AUTH
  ════════════════════════════════ */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleAuthUser(session.user)
      else setScreen('login')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_IN'  && session) handleAuthUser(session.user)
      if (ev === 'SIGNED_OUT') { setUser(null); setAuthUser(null); setScreen('login') }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleAuthUser(gUser) {
    setAuthUser(gUser)
    try {
      const { data, error } = await supabase.from('community_users')
        .select('*').eq('auth_id', gUser.id).maybeSingle()
      if (error) throw error
      if (data) { setUser(data); setScreen('main') }
      else {
        setReg(f => ({ ...f, name: gUser.user_metadata?.full_name || gUser.email?.split('@')[0] || '' }))
        setScreen('register')
      }
    } catch(e) {
      showToast('인증 오류: ' + e.message)
      await supabase.auth.signOut(); setAuthUser(null); setScreen('login')
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  { redirectTo: window.location.origin + '/community' },
    })
    if (error) showToast('구글 로그인 오류: ' + error.message)
  }

  async function signInWithKakao() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options:  { redirectTo: window.location.origin + '/community' },
    })
    if (error) showToast('카카오 로그인 오류: ' + error.message)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null); setAuthUser(null); setScreen('login')
  }

  /* ════════════════════════════════
     REGISTER
  ════════════════════════════════ */
  function handleRegPhoto(e) {
    const file = e.target.files[0]; if (!file) return
    if (!file.type.startsWith('image/')) return showToast('이미지 파일만 가능합니다')
    if (file.size > 5 * 1024 * 1024) return showToast('5MB 이하 이미지를 선택해주세요')
    setRegPhoto(file)
    setRegPreview(URL.createObjectURL(file))
  }

  async function register() {
    if (!reg.name.trim()) return showToast('이름을 입력해주세요')
    if (!reg.role)        return showToast('역할을 선택해주세요')
    setRegUploading(true)
    try {
      let avatarUrl = null
      if (regPhoto) {
        // Storage RLS 정책: 첫 폴더 = auth.uid()::text 강제
        if (!authUser?.id) throw new Error('로그인이 필요해요')
        // 프로필 사진도 동일하게 클라이언트 압축 (WebP / 1024px / 0.8)
        const compressedAvatar = await compressImageFile(regPhoto)
        const ext = (compressedAvatar.name.split('.').pop() || 'webp').toLowerCase()
        const fn  = `${authUser.id}/${Date.now()}.${ext}`
        const contentType = compressedAvatar.type || 'image/webp'
        const { error: ue } = await supabase.storage
          .from('community-profiles').upload(fn, compressedAvatar, { upsert: true, contentType })
        if (ue) throw ue
        avatarUrl = supabase.storage.from('community-profiles').getPublicUrl(fn).data.publicUrl
      }
      const { data, error } = await supabase.from('community_users').insert({
        auth_id:    authUser.id,
        name:       reg.name.trim(),
        role:       reg.role,
        location:   reg.location.trim() || null,
        bio:        reg.bio.trim() || null,
        phone:      reg.phone.trim() || null,
        kakao_link: reg.kakaoLink.trim() || null,
        avatar_url: avatarUrl,
      }).select().single()
      if (error) throw error
      setUser(data); setScreen('main')
      showToast('환영합니다! 커뮤니티에 오신 걸 환영해요 🎉')
    } catch(e) { showToast('가입 오류: ' + e.message) }
    setRegUploading(false)
  }

  /* ════════════════════════════════
     DATA LOADING
  ════════════════════════════════ */
  useEffect(() => {
    if (screen === 'main' && user) {
      if (navTab === 'market') loadMarketItems()
      else if (navTab === 'my') loadMyData()
      else loadPosts()
    }
  }, [screen, navTab, user])

  async function loadPosts() {
    setFeedLoading(true)
    try {
      let q = supabase.from('community_posts')
        .select('*, author:community_users(*)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(60)
      if (navTab === 'jobs')    q = q.in('category', JOB_CATS)
      else if (navTab === 'ptmatch') q = q.in('category', PTMATCH_CATS)
      else q = q.in('category', [...JOB_CATS, ...PTMATCH_CATS])
      const { data, error } = await q
      if (error) throw error
      setPosts(data || [])
    } catch(e) { console.warn('[loadPosts]', e.message) }
    setFeedLoading(false)
  }

  async function loadMarketItems() {
    setMarketLoading(true)
    try {
      const { data: items, error } = await supabase.from('community_posts')
        .select('*, author:community_users(*)')
        .in('category', MARKET_CATS)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(60)
      if (error) throw error
      setMarketItems(items || [])
      if (!myPurchases.length && user) {
        const { data: p } = await supabase.from('market_purchases')
          .select('post_id').eq('buyer_id', user.id)
        setMyPurchases((p || []).map(r => r.post_id))
      }
    } catch(e) { console.warn('[loadMarketItems]', e.message) }
    setMarketLoading(false)
  }

  async function loadMyData() {
    try {
      const [postsRes, sentRes, purchRes] = await Promise.all([
        supabase.from('community_posts').select('*, author:community_users(*)')
          .eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('community_contacts').select('*, post:community_posts(*)')
          .eq('requester_id', user.id).order('created_at', { ascending: false }),
        supabase.from('market_purchases')
          .select('*, post:community_posts(*, author:community_users(*))')
          .eq('buyer_id', user.id).order('purchased_at', { ascending: false }),
      ])
      const postsData = postsRes.data || []
      setMyPosts(postsData)
      setSentContacts(sentRes.data || [])
      const pd = purchRes.data || []
      setMyPurchasedItems(pd.filter(r => r.post))
      setMyPurchases(pd.map(r => r.post_id))
      const ids = postsData.map(p => p.id)
      if (ids.length) {
        const { data: rcv } = await supabase.from('community_contacts')
          .select('*, requester:community_users(*), post:community_posts(title)')
          .in('post_id', ids).order('created_at', { ascending: false })
        setReceivedContacts(rcv || [])
      } else setReceivedContacts([])
    } catch(e) { console.warn('[loadMyData]', e.message) }
  }

  /* ════════════════════════════════
     POST DETAIL & CONTACTS
  ════════════════════════════════ */
  async function openDetail(post) {
    setSelPost(post); setContacts([]); setMyContact(null)
    setContactMsg(`안녕하세요! 저는 ${user?.name}입니다.`)
    setPrevNav(navTab); setScreen('detail')

    // 권한 검증: 게시글 작성자 본인만 전체 컨택 목록 조회 가능
    const isAuthor = post?.user_id && user?.id && post.user_id === user.id

    if (isAuthor) {
      // 작성자: 본 게시글에 들어온 모든 연락 요청 열람
      const { data } = await supabase.from('community_contacts')
        .select('*, requester:community_users(*)')
        .eq('post_id', post.id)
        .order('created_at', { ascending: false })
      const list = data || []
      setContacts(list)
      setMyContact(list.find(c => c.requester_id === user?.id) || null)
    } else {
      // 비작성자: 본인이 보낸 컨택만 조회 (타인 컨택 정보 노출 차단)
      if (!user?.id) { setContacts([]); setMyContact(null); return }
      const { data } = await supabase.from('community_contacts')
        .select('*, requester:community_users(*)')
        .eq('post_id', post.id)
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false })
      const list = data || []
      setContacts([])  // 비작성자에게는 전체 목록 미노출
      setMyContact(list[0] || null)
    }
  }

  async function sendContact() {
    if (sendingContact) return
    if (!contactMsg.trim()) return showToast('메시지를 입력해주세요')
    setSendingContact(true)
    try {
      const { error } = await supabase.from('community_contacts').insert({
        post_id: selPost.id, requester_id: user.id, message: contactMsg.trim(),
      })
      if (error) {
        if (error.code === '23505') { showToast('이미 연락 요청을 보냈습니다'); return }
        throw error
      }
      const { error: updErr } = await supabase.from('community_posts')
        .update({ contact_count: (selPost.contact_count || 0) + 1 })
        .eq('id', selPost.id)
      if (updErr) throw updErr
      const updated = { ...selPost, contact_count: (selPost.contact_count || 0) + 1 }
      setSelPost(updated); setShowContactModal(false)
      showToast('연락 요청을 보냈습니다')
      openDetail(updated)
    } catch (e) {
      console.error('연락 요청 오류:', e)
      showToast('오류: ' + (e?.message || '전송 실패'))
    } finally {
      setSendingContact(false)
    }
  }

  async function updateContactStatus(cid, status) {
    const { error } = await supabase.from('community_contacts')
      .update({ status }).eq('id', cid)
    if (error) return showToast('처리 오류')
    showToast(status === 'accepted' ? '수락했습니다' : '거절했습니다')
    openDetail(selPost)
  }

  async function closePost(postId) {
    const { error } = await supabase.from('community_posts')
      .update({ status: 'closed' }).eq('id', postId)
    if (error) return showToast('마감 처리 실패')
    showToast('마감 처리됐습니다')
    setSelPost(p => ({ ...p, status: 'closed' }))
  }

  async function deletePost(postId) {
    if (!window.confirm('정말 삭제하시겠습니까?')) return
    const { error } = await supabase.from('community_posts')
      .delete().eq('id', postId)
    if (error) return showToast('삭제 실패')
    showToast('삭제됐습니다')
    setScreen('main'); setNavTab(prevNav)
  }

  /* ════════════════════════════════
     WRITE POST
  ════════════════════════════════ */
  function handlePostImgChange(e) {
    const files = Array.from(e.target.files); if (!files.length) return
    const rem   = 5 - wf.images.length
    const toAdd = files.slice(0, rem)
    if (toAdd.some(f => !f.type.startsWith('image/'))) return showToast('이미지 파일만 가능합니다')
    if (toAdd.some(f => f.size > 10 * 1024 * 1024))    return showToast('10MB 이하 이미지만 가능합니다')
    setWf(f => ({ ...f, images: [...f.images, ...toAdd] }))
    toAdd.forEach(file => {
      const r = new FileReader()
      r.onload = ev => setWf(f => ({ ...f, imagePreviews: [...f.imagePreviews, ev.target.result] }))
      r.readAsDataURL(file)
    })
    e.target.value = ''
  }

  function removePostImg(idx) {
    setWf(f => ({
      ...f,
      images:        f.images.filter((_, i) => i !== idx),
      imagePreviews: f.imagePreviews.filter((_, i) => i !== idx),
    }))
  }

  async function uploadImages(files) {
    // Storage RLS 정책: 첫 폴더 = auth.uid()::text 강제
    if (!authUser?.id) throw new Error('로그인이 필요해요')
    const urls = []
    for (const file of files) {
      // Storage 비용 절감: Canvas WebP 압축 (1024px / quality 0.8) 강제 적용
      const compressed = await compressImageFile(file)
      const ext = (compressed.name.split('.').pop() || 'webp').toLowerCase()
      // 경로 최상단을 반드시 auth.uid() 로 — 그렇지 않으면 RLS 가 거부함
      const name = `${authUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const contentType = compressed.type || 'image/webp'
      const { error } = await supabase.storage.from('community-posts').upload(name, compressed, { contentType })
      if (error) throw error
      urls.push(supabase.storage.from('community-posts').getPublicUrl(name).data.publicUrl)
    }
    return urls
  }

  async function createPost() {
    // 필수값 가드 — DB CHECK/NOT NULL 위반(400) 사전 차단
    if (!user?.id)          return showToast('로그인이 필요해요')
    if (!wf.cat)            return showToast('카테고리를 선택해주세요')
    if (!wf.title?.trim())  return showToast('제목을 입력해주세요')
    if (!wf.content?.trim()) return showToast('내용을 입력해주세요')

    setUploading(true)
    let imageUrls = []
    try { imageUrls = await uploadImages(wf.images) }
    catch { setUploading(false); return showToast('이미지 업로드 실패') }

    // 페이로드 직렬화 안전화 — 빈 배열은 null 로 통일, 문자열 컬럼은 .trim() 강제.
    // 환각 컬럼(video_url / location / tags) 은 community_posts 스키마 부재로 페이로드에서 100% 제외.
    const payload = {
      user_id:    user.id,
      category:   String(wf.cat),
      title:      wf.title.trim(),
      content:    wf.content.trim(),
      image_urls: (Array.isArray(imageUrls) && imageUrls.length > 0) ? imageUrls.map(u => String(u)) : null,
      status:     'active',
    }

    const { error } = await supabase.from('community_posts').insert(payload)
    setUploading(false)
    if (error) {
      console.error('[createPost] payload:', payload, 'error:', error)
      return showToast('등록 오류: ' + (error?.message || '잠시 후 다시 시도해 주세요'))
    }
    showToast('게시글이 등록됐습니다')
    setWf(INIT_WRITE); setScreen('main'); setNavTab(prevNav)
    loadPosts()
  }

  function handleWfTagKey(e) {
    if (e.key !== 'Enter') return; e.preventDefault()
    const v = wf.tagInput.trim(); if (!v) return
    if (wf.tags.length >= 5) return showToast('태그는 최대 5개')
    setWf(f => ({ ...f, tags: f.tags.includes(v) ? f.tags : [...f.tags, v], tagInput: '' }))
  }

  /* ════════════════════════════════
     MARKET DETAIL
  ════════════════════════════════ */
  async function openMarketDetail(item) {
    setSelMarket(item); setMarketContent(null)
    setPrevNav(navTab); setScreen('market_detail')
    const isSeller    = item.user_id === user?.id
    const isPurchased = myPurchases.includes(item.id)
    if (isSeller || isPurchased || item.price === 0) {
      try {
        const { data } = await supabase.from('market_item_contents')
          .select('*').eq('post_id', item.id).maybeSingle()
        setMarketContent(data)
      } catch(e) { console.warn('[openMarketDetail]', e.message) }
    }
  }

  async function purchaseItem(item) {
    if (purchasing) return
    if (!user?.id || !item?.id) { showToast('상품 교환을 위한 정보가 부족해요'); return }
    setPurchasing(true)
    try {
      const { data, error } = await supabase.rpc('purchase_market_item', {
        p_post_id: item.id, p_buyer_id: user.id,
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || '상품 교환 처리 실패')
      setMyPurchases(prev => prev.includes(item.id) ? prev : [...prev, item.id])
      showToast(item.price === 0 ? '✓ 무료 상품을 받았어요' : '✓ 상품 교환 완료!')
      const { data: content } = await supabase.from('market_item_contents')
        .select('*').eq('post_id', item.id).maybeSingle()
      setMarketContent(content)
    } catch(e) {
      console.error('상품 교환 오류:', e)
      showToast('상품 교환 실패: ' + (e?.message || '네트워크 오류'))
    } finally {
      setPurchasing(false)
    }
  }

  /* ════════════════════════════════
     MARKET WRITE
  ════════════════════════════════ */
  async function createMarketPost() {
    if (!user?.id)            return showToast('로그인이 필요해요')
    if (!mw.title?.trim())    return showToast('상품명을 입력해주세요')
    if (!mw.content?.trim())  return showToast('상품 소개를 입력해주세요')
    if (mw.price < 0)         return showToast('가격을 확인해주세요')
    setUploading(true)
    try {
      // 환각 컬럼(video_url / tags) 제거 — community_posts 스키마 부재
      const marketPayload = {
        user_id:   user.id,
        category:  String(mw.type),
        title:     mw.title.trim(),
        content:   mw.content.trim(),
        price:     Number.isFinite(parseInt(mw.price, 10)) ? parseInt(mw.price, 10) : 0,
        status:    'active',
      }
      const { data: post, error } = await supabase.from('community_posts')
        .insert(marketPayload)
        .select('id').single()
      if (error) {
        console.error('[createMarketPost] payload:', marketPayload, 'error:', error)
        throw error
      }

      // 구매자 전용 콘텐츠
      const isRoutine      = mw.type === 'market_routine'
      const purchaserContent = isRoutine ? mw.routineJson.trim() : mw.externalUrl.trim()
      if (purchaserContent) {
        const { error: ce } = await supabase.from('market_item_contents').insert({
          post_id:      post.id,
          full_content: purchaserContent,
          external_url: isRoutine ? null : mw.externalUrl.trim(),
        })
        if (ce) throw ce
      }
      showToast('🛒 상품이 등록됐어요!')
      setMw(INIT_MW); setScreen('main'); setNavTab('market')
      loadMarketItems()
    } catch(e) { showToast('등록 오류: ' + e.message) }
    setUploading(false)
  }

  function handleMwTagKey(e) {
    if (e.key !== 'Enter') return; e.preventDefault()
    const v = mw.tagInput.trim(); if (!v) return
    if (mw.tags.length >= 5) return showToast('태그는 최대 5개')
    setMw(f => ({ ...f, tags: f.tags.includes(v) ? f.tags : [...f.tags, v], tagInput: '' }))
  }

  /* ════════════════════════════════
     NAV helper
  ════════════════════════════════ */
  function goTab(tab) {
    setNavTab(tab)
    if (screen !== 'main') setScreen('main')
  }

  /* ════════════════════════════════
     RENDER — loading
  ════════════════════════════════ */
  if (screen === 'loading') return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%',
        border: `3px solid ${T.accentLight}`, borderTopColor: T.accent,
        animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 13, color: T.muted }}>잠시만요…</div>
    </div>
  )

  /* ════════════════════════════════
     RENDER — login
  ════════════════════════════════ */
  if (screen === 'login') return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '20px 20px 40px' }}>
      <div style={{ width: '100%', maxWidth: 380, background: T.surface,
        borderRadius: 20, padding: '36px 28px', boxShadow: T.shadowMd,
        border: `1px solid ${T.border}` }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-1.5px', color: T.text, marginBottom: 4 }}>
            오<span style={{ color: T.accent }}>운</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.dim,
              marginLeft: 8, letterSpacing: '0.1em' }}>COMMUNITY</span>
          </div>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, margin: 0 }}>
            트레이너 · 회원 · 교육강사 · 센터대표가<br />함께하는 구인·구직·PT매칭 커뮤니티
          </p>
        </div>

        {/* Google */}
        <button onClick={signInWithGoogle} style={{
          width: '100%', padding: '12px 16px', borderRadius: 12, border: `1.5px solid ${T.border}`,
          background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          marginBottom: 10, color: T.text,
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          Google로 시작하기
        </button>

        {/* Kakao */}
        <button onClick={signInWithKakao} style={{
          width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none',
          background: T.yellow, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 10, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', color: '#191919',
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path fillRule="evenodd" clipRule="evenodd"
              d="M9 1C4.582 1 1 3.806 1 7.25c0 2.178 1.417 4.09 3.56 5.19l-.91 3.394c-.08.3.264.535.518.356L8.44 13.84c.184.016.37.024.56.024 4.418 0 8-2.806 8-6.25S13.418 1 9 1z"
              fill="#191919"/>
          </svg>
          카카오로 시작하기
        </button>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button onClick={() => navigate('/')} style={{
            background: 'none', border: 'none', color: T.dim,
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>← 홈으로 돌아가기</button>
        </div>
      </div>
    </div>
  )

  /* ════════════════════════════════
     RENDER — register
  ════════════════════════════════ */
  if (screen === 'register') return (
    <div style={{ minHeight: '100vh', background: T.bg, paddingBottom: 40 }}>
      <div style={{
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: '14px 20px', display: 'flex', alignItems: 'center',
        gap: 10, boxShadow: T.shadow, position: 'sticky', top: 0, zIndex: 100,
      }}>
        <span style={{ fontSize: 16, fontWeight: 900, color: T.text }}>
          오<span style={{ color: T.accent }}>운</span> 커뮤니티
        </span>
        <span style={{ fontSize: 12, color: T.muted, marginLeft: 4 }}>회원가입</span>
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 6 }}>
          프로필을 만들어보세요
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
          역할에 따라 보이는 카테고리와 글쓰기 권한이 달라져요.
        </div>

        {/* Profile photo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div onClick={() => regPhotoRef.current?.click()} style={{
            width: 72, height: 72, borderRadius: '50%', cursor: 'pointer',
            background: regPreview ? 'transparent' : T.surface2,
            border: `2px dashed ${T.border}`, overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {regPreview
              ? <img src={regPreview} alt="" crossOrigin="anonymous"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 24 }}>📷</span>
            }
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>프로필 사진 (선택)</div>
            <div style={{ fontSize: 11, color: T.dim }}>5MB 이하 이미지</div>
          </div>
          <input ref={regPhotoRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={handleRegPhoto} />
        </div>

        <Field label="이름" required>
          <input style={inputStyle} placeholder="실명 또는 닉네임"
            value={reg.name} onChange={e => setReg(f => ({ ...f, name: e.target.value }))} />
        </Field>

        <Field label="역할" required>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {Object.entries(ROLE).map(([key, r]) => (
              <div key={key} onClick={() => setReg(f => ({ ...f, role: key }))} style={{
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                border: `1.5px solid ${reg.role === key ? r.color : T.border}`,
                background: reg.role === key ? r.color + '12' : T.surface,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 18 }}>{r.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 600,
                  color: reg.role === key ? r.color : T.text }}>{r.label}</span>
              </div>
            ))}
          </div>
        </Field>

        <Field label="활동 지역 (선택)">
          <input style={inputStyle} placeholder="예: 서울 강남, 부산 해운대"
            value={reg.location} onChange={e => setReg(f => ({ ...f, location: e.target.value }))} />
        </Field>

        <Field label="소개 (선택)">
          <textarea style={{ ...textareaStyle, height: 80 }} placeholder="간단한 자기소개"
            value={reg.bio} onChange={e => setReg(f => ({ ...f, bio: e.target.value }))} />
        </Field>

        <Field label="연락처 (선택)" hint="수락 시 상대방에게 공개됩니다">
          <input style={inputStyle} placeholder="010-0000-0000"
            value={reg.phone} onChange={e => setReg(f => ({ ...f, phone: e.target.value }))} />
        </Field>

        <Field label="카카오톡 오픈채팅 링크 (선택)" hint="상세 페이지에서 문의하기 버튼으로 노출됩니다">
          <input style={inputStyle} placeholder="https://open.kakao.com/o/..."
            value={reg.kakaoLink} onChange={e => setReg(f => ({ ...f, kakaoLink: e.target.value }))} />
        </Field>

        <button onClick={register} disabled={regUploading} style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 'none',
          background: T.accent, color: '#fff', fontSize: 15, fontWeight: 800,
          cursor: regUploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          opacity: regUploading ? 0.6 : 1,
        }}>
          {regUploading ? '가입 중…' : '커뮤니티 입장하기'}
        </button>
      </div>
    </div>
  )

  /* ════════════════════════════════
     RENDER — post detail
  ════════════════════════════════ */
  if (screen === 'detail' && selPost) {
    const isMyPost = selPost.user_id === user?.id
    const isClosed = selPost.status  === 'closed'
    return (
      <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 40 }}>
        <BackHeader
          onBack={() => { setScreen('main'); setNavTab(prevNav) }}
          title="게시글 상세"
          right={
            isMyPost ? (
              <div style={{ display: 'flex', gap: 8 }}>
                {!isClosed && (
                  <Btn variant="ghost" onClick={() => closePost(selPost.id)}
                    style={{ fontSize: 12, padding: '6px 10px' }}>마감</Btn>
                )}
                <Btn variant="danger" onClick={() => deletePost(selPost.id)}
                  style={{ fontSize: 12, padding: '6px 10px' }}>삭제</Btn>
              </div>
            ) : null
          }
        />

        <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px' }}>
          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CatBadge cat={selPost.category} />
              {isClosed && (
                <span style={{ fontSize: 11, fontWeight: 700, color: T.dim,
                  background: T.surface2, padding: '2px 8px', borderRadius: 8 }}>마감됨</span>
              )}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 10, lineHeight: 1.4 }}>
              {selPost.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar user={selPost.author} size={30} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{selPost.author?.name}</span>
                  <RoleBadge role={selPost.author?.role} />
                </div>
                {selPost.author?.location && (
                  <div style={{ fontSize: 11, color: T.dim }}>📍 {selPost.author.location}</div>
                )}
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: T.dim }}>
                {timeAgo(selPost.created_at)}
              </span>
            </div>
          </div>

          {/* Content */}
          <div style={{ background: T.surface, borderRadius: 14, padding: '16px',
            border: `1px solid ${T.border}`, marginBottom: 14 }}>
            {selPost.location && (
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>📍 {selPost.location}</div>
            )}
            <div style={{ fontSize: 14, color: T.text, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {selPost.content}
            </div>

            {/* Tags */}
            {selPost.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {selPost.tags.map(t => (
                  <span key={t} style={{ fontSize: 11, color: T.muted, background: T.surface2,
                    padding: '3px 9px', borderRadius: 10 }}>#{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Images */}
          {selPost.image_urls?.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
              {selPost.image_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  style={{ borderRadius: 10, overflow: 'hidden', display: 'block',
                    height: 140, gridColumn: i === 0 && selPost.image_urls.length === 1 ? 'span 2' : '' }}>
                  <img src={url} alt={`이미지 ${i + 1}`} crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </a>
              ))}
            </div>
          )}

          {/* Video link */}
          <VideoLink url={selPost.video_url} />

          {/* KakaoTalk */}
          {!isMyPost && <KakaoBtn link={selPost.author?.kakao_link} />}

          {/* Contact action */}
          {!isMyPost && !isClosed && (
            <div style={{ marginBottom: 14 }}>
              {myContact ? (
                <div style={{ padding: '14px 16px', borderRadius: 12,
                  background: T.accentLight, border: `1px solid ${T.accentText}30` }}>
                  <div style={{ fontSize: 13, color: T.accentText, fontWeight: 600, marginBottom: 6 }}>
                    연락 요청을 보냈습니다
                  </div>
                  <StatusBadge status={myContact.status} />
                  {myContact.status === 'accepted' && (
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>
                      수락되었습니다. 위 카카오톡 버튼으로 직접 연락해보세요.
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setShowContactModal(true)} style={{
                  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                  background: T.accent, color: '#fff', fontSize: 15, fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  연락하기
                </button>
              )}
            </div>
          )}

          {/* Contacts list (my post only) */}
          {isMyPost && contacts.length > 0 && (
            <div style={{ background: T.surface, borderRadius: 14, padding: '16px',
              border: `1px solid ${T.border}`, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>
                연락 요청 {contacts.length}건
              </div>
              {contacts.map(c => (
                <div key={c.id} style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Avatar user={c.requester} size={28} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{c.requester?.name}</span>
                        <RoleBadge role={c.requester?.role} />
                      </div>
                      {c.requester?.location && (
                        <div style={{ fontSize: 10, color: T.dim }}>📍 {c.requester.location}</div>
                      )}
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.message && (
                    <div style={{ fontSize: 12, color: T.muted, background: T.surface2,
                      padding: '8px 12px', borderRadius: 8, marginBottom: 8 }}>
                      "{c.message}"
                    </div>
                  )}
                  {c.status === 'accepted' && c.requester?.phone && (
                    <div style={{ fontSize: 12, color: T.accentText, background: T.accentLight,
                      padding: '8px 12px', borderRadius: 8, fontWeight: 600, marginBottom: 8 }}>
                      📞 {c.requester.phone}
                    </div>
                  )}
                  {c.requester?.kakao_link && c.status === 'accepted' && (
                    <KakaoBtn link={c.requester.kakao_link} />
                  )}
                  {c.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn variant="primary" onClick={() => updateContactStatus(c.id, 'accepted')}
                        style={{ flex: 1, fontSize: 13 }}>수락</Btn>
                      <Btn variant="danger" onClick={() => updateContactStatus(c.id, 'rejected')}
                        style={{ flex: 1, fontSize: 13 }}>거절</Btn>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact modal */}
        {showContactModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 999, display: 'flex', alignItems: 'flex-end', padding: '0' }}>
            <div style={{ width: '100%', background: T.surface, borderRadius: '20px 20px 0 0',
              padding: '24px 20px 40px', boxShadow: T.shadowMd }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 16 }}>
                연락 메시지
              </div>
              <textarea style={{ ...textareaStyle, height: 100, marginBottom: 12 }}
                value={contactMsg}
                onChange={e => setContactMsg(e.target.value)}
                placeholder="자기소개나 문의 내용을 적어주세요" />
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" onClick={() => setShowContactModal(false)}
                  style={{ flex: 1 }}>취소</Btn>
                <Btn variant="primary" onClick={sendContact} disabled={sendingContact} style={{ flex: 2, opacity: sendingContact ? 0.55 : 1, cursor: sendingContact ? 'not-allowed' : 'pointer' }}>
                  {sendingContact ? '전송 중…' : '연락 요청 보내기'}
                </Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ════════════════════════════════
     RENDER — write post
  ════════════════════════════════ */
  if (screen === 'write') {
    const WRITABLE_CATS = navTab === 'market'
      ? MARKET_CATS
      : navTab === 'jobs'    ? JOB_CATS
      : navTab === 'ptmatch' ? PTMATCH_CATS
      : [...JOB_CATS, ...PTMATCH_CATS]

    return (
      <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 40 }}>
        <BackHeader
          onBack={() => { setWf(INIT_WRITE); setScreen('main'); setNavTab(prevNav) }}
          title="글쓰기"
        />
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px' }}>

          {/* Category */}
          <Field label="카테고리" required>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {WRITABLE_CATS.map(key => {
                const c = CAT[key]; const active = wf.cat === key
                return (
                  <div key={key} onClick={() => setWf(f => ({ ...f, cat: key }))} style={{
                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${active ? c.color : T.border}`,
                    background: active ? c.color + '12' : T.surface,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 18 }}>{c.emoji}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700,
                        color: active ? c.color : T.text }}>{c.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            {wf.cat && (
              <div style={{ fontSize: 11, color: T.muted, marginTop: 8, padding: '8px 10px',
                background: T.surface2, borderRadius: 8 }}>
                💡 {CAT[wf.cat]?.hint}
              </div>
            )}
          </Field>

          <Field label="제목" required>
            <input style={inputStyle} maxLength={50} placeholder="제목을 입력해주세요"
              value={wf.title} onChange={e => setWf(f => ({ ...f, title: e.target.value }))} />
            <div style={{ fontSize: 10, color: T.dim, textAlign: 'right', marginTop: 3 }}>
              {wf.title.length}/50
            </div>
          </Field>

          <Field label="내용" required>
            <textarea style={{ ...textareaStyle, height: 140 }} maxLength={800}
              placeholder="상세한 내용을 작성해주세요"
              value={wf.content} onChange={e => setWf(f => ({ ...f, content: e.target.value }))} />
            <div style={{ fontSize: 10, color: T.dim, textAlign: 'right', marginTop: 3 }}>
              {wf.content.length}/800
            </div>
          </Field>

          <Field label="지역 (선택)">
            <input style={inputStyle} placeholder="예: 서울 강남, 부산 해운대"
              value={wf.location} onChange={e => setWf(f => ({ ...f, location: e.target.value }))} />
          </Field>

          {/* Images */}
          <Field label="사진 첨부 (선택)" hint="최대 5장 · 10MB 이하 · Supabase Storage 저장">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {wf.imagePreviews.map((src, i) => (
                <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                  <img src={src} alt="" style={{ width: 80, height: 80,
                    borderRadius: 8, objectFit: 'cover', border: `1px solid ${T.border}` }} />
                  <button onClick={() => removePostImg(i)} style={{
                    position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                    borderRadius: '50%', background: T.danger, color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>×</button>
                </div>
              ))}
              {wf.images.length < 5 && (
                <div onClick={() => postImgRef.current?.click()} style={{
                  width: 80, height: 80, borderRadius: 8, cursor: 'pointer',
                  border: `2px dashed ${T.border}`, background: T.surface2,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 4,
                }}>
                  <span style={{ fontSize: 20 }}>📷</span>
                  <span style={{ fontSize: 9, color: T.dim }}>사진 추가</span>
                </div>
              )}
            </div>
            <input ref={postImgRef} type="file" accept="image/*" multiple
              style={{ display: 'none' }} onChange={handlePostImgChange} />
          </Field>

          {/* Video URL */}
          <Field label="영상 링크 (선택)"
            hint="대용량 영상은 YouTube / Vimeo에 업로드 후 링크만 입력하세요. 직접 업로드는 지원하지 않습니다.">
            <input style={inputStyle}
              placeholder="https://www.youtube.com/watch?v=..."
              value={wf.videoUrl} onChange={e => setWf(f => ({ ...f, videoUrl: e.target.value }))} />
          </Field>

          {/* Tags */}
          <Field label="태그 (선택)" hint="Enter로 추가 · 최대 5개">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: wf.tags.length ? 8 : 0 }}>
              {wf.tags.map(tag => (
                <span key={tag} style={{ fontSize: 12, background: T.accentLight, color: T.accentText,
                  padding: '3px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                  #{tag}
                  <button onClick={() => setWf(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: T.accentText, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
            <input style={inputStyle}
              placeholder={wf.tags.length < 5 ? '태그 입력 후 Enter…' : ''}
              value={wf.tagInput}
              onChange={e => setWf(f => ({ ...f, tagInput: e.target.value }))}
              onKeyDown={handleWfTagKey}
              disabled={wf.tags.length >= 5} />
          </Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Btn variant="ghost" onClick={() => { setWf(INIT_WRITE); setScreen('main'); setNavTab(prevNav) }}
              style={{ flex: 1 }}>취소</Btn>
            <Btn variant="primary" onClick={createPost} disabled={uploading}
              style={{ flex: 2 }}>{uploading ? '업로드 중…' : '등록하기'}</Btn>
          </div>
        </div>
      </div>
    )
  }

  /* ════════════════════════════════
     RENDER — market detail
  ════════════════════════════════ */
  if (screen === 'market_detail' && selMarket) {
    const isSeller    = selMarket.user_id === user?.id
    const isPurchased = myPurchases.includes(selMarket.id)
    const hasAccess   = isSeller || isPurchased || selMarket.price === 0
    const isRoutine   = selMarket.category === 'market_routine'
    const isFree      = selMarket.price === 0

    return (
      <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 40 }}>
        <BackHeader
          onBack={() => { setScreen('main'); setNavTab('market') }}
          title="상품 상세"
          right={
            isSeller ? (
              <Btn variant="danger" onClick={() => deletePost(selMarket.id)}
                style={{ fontSize: 12, padding: '6px 10px' }}>삭제</Btn>
            ) : null
          }
        />

        <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px' }}>
          {/* Info card */}
          <div style={{ background: T.surface, borderRadius: 14, padding: '16px',
            border: `1px solid ${T.border}`, marginBottom: 14, boxShadow: T.shadow }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CatBadge cat={selMarket.category} />
              <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 900,
                color: isFree ? T.accent : T.text }}>
                {fmtPrice(selMarket.price)}
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 10 }}>
              {selMarket.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Avatar user={selMarket.author} size={28} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{selMarket.author?.name}</span>
                  <RoleBadge role={selMarket.author?.role} />
                </div>
                {selMarket.author?.location && (
                  <div style={{ fontSize: 10, color: T.dim }}>📍 {selMarket.author.location}</div>
                )}
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: T.dim }}>
                {timeAgo(selMarket.created_at)}
              </span>
            </div>
            <div style={{ fontSize: 14, color: T.text, lineHeight: 1.8, whiteSpace: 'pre-wrap',
              marginBottom: 12 }}>
              {selMarket.content}
            </div>
            {selMarket.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selMarket.tags.map(t => (
                  <span key={t} style={{ fontSize: 11, color: T.muted, background: T.surface2,
                    padding: '3px 9px', borderRadius: 10 }}>#{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Public video link (preview) */}
          {selMarket.video_url && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.dim,
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                미리보기 영상
              </div>
              <VideoLink url={selMarket.video_url} />
            </div>
          )}

          {/* KakaoTalk */}
          {!isSeller && <KakaoBtn link={selMarket.author?.kakao_link} />}

          {/* Purchase / Access gate */}
          {!hasAccess && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 14, padding: '20px', textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
              <div style={{ fontSize: 14, color: T.muted, marginBottom: 14, lineHeight: 1.6 }}>
                구매 후 전문 콘텐츠를 확인할 수 있습니다
              </div>
              <button onClick={() => purchaseItem(selMarket)} disabled={purchasing} style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                background: T.accent, color: '#fff', fontSize: 15, fontWeight: 800,
                cursor: purchasing ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                opacity: purchasing ? 0.6 : 1,
              }}>
                {purchasing ? '처리 중…' : isFree ? '무료로 받기' : `${fmtPrice(selMarket.price)} 구매하기`}
              </button>
              {selMarket.price > 0 && (
                <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>
                  💡 결제는 판매자와 카카오톡으로 직접 협의해주세요
                </div>
              )}
            </div>
          )}

          {/* Purchaser content */}
          {hasAccess && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.accentText,
                letterSpacing: '0.06em', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>🔓</span>
                {isSeller ? '등록된 콘텐츠 (본인)' : isFree ? '무료 전문 콘텐츠' : '구매 완료 — 전문 콘텐츠'}
              </div>

              {marketContent ? (
                <>
                  {/* External URL (for non-routine types) */}
                  {marketContent.external_url && (
                    <a href={marketContent.external_url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                        borderRadius: 10, background: T.accentLight, border: `1px solid ${T.accentText}25`,
                        color: T.accentText, fontWeight: 700, fontSize: 13,
                        textDecoration: 'none', marginBottom: 12 }}>
                      <span style={{ fontSize: 18 }}>🔗</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        외부 자료 열기 (Notion / Drive 등)
                      </span>
                      <span style={{ fontSize: 10 }}>↗</span>
                    </a>
                  )}

                  {/* Routine JSON or full text */}
                  {marketContent.full_content && (
                    <div style={{ background: T.surface2, border: `1px solid ${T.border}`,
                      borderRadius: 12, padding: '14px 16px', fontSize: 13, lineHeight: 1.8,
                      whiteSpace: 'pre-wrap', color: T.text,
                      fontFamily: isRoutine ? "'DM Mono', monospace" : 'inherit',
                      maxHeight: 400, overflowY: 'auto' }}>
                      {marketContent.full_content}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: T.dim, fontSize: 13 }}>
                  등록된 전문 콘텐츠가 없습니다
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ════════════════════════════════
     RENDER — market write
  ════════════════════════════════ */
  if (screen === 'market_write') {
    const isRoutine = mw.type === 'market_routine'
    return (
      <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 40 }}>
        <BackHeader
          onBack={() => { setMw(INIT_MW); setScreen('main'); setNavTab('market') }}
          title="🛒 상품 등록"
        />
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px' }}>

          {/* Type selector */}
          <Field label="상품 유형" required>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {MARKET_CATS.map(key => {
                const c = CAT[key]; const active = mw.type === key
                return (
                  <div key={key} onClick={() => setMw(f => ({ ...f, type: key }))} style={{
                    padding: '12px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${active ? c.color : T.border}`,
                    background: active ? c.color + '12' : T.surface,
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{c.emoji}</div>
                    <div style={{ fontSize: 12, fontWeight: 700,
                      color: active ? c.color : T.text }}>{c.label}</div>
                    <div style={{ fontSize: 10, color: T.dim, marginTop: 2, lineHeight: 1.4 }}>
                      {c.hint}
                    </div>
                  </div>
                )
              })}
            </div>
          </Field>

          {/* Price */}
          <Field label="가격" required>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min={0} step={1000} style={{ ...inputStyle, flex: 1 }}
                placeholder="0 = 무료"
                value={mw.price}
                onChange={e => setMw(f => ({ ...f, price: Math.max(0, parseInt(e.target.value) || 0) }))} />
              <span style={{ fontSize: 13, color: T.muted }}>원</span>
              <button onClick={() => setMw(f => ({ ...f, price: 0 }))} style={{
                padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`,
                background: mw.price === 0 ? T.accentLight : T.surface2,
                color: mw.price === 0 ? T.accentText : T.muted,
                cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              }}>무료</button>
            </div>
            {mw.price > 0 && (
              <div style={{ fontSize: 11, color: T.orange, marginTop: 6 }}>
                💡 결제는 구매자와 카카오톡으로 직접 협의해주세요 (명예 과금 방식)
              </div>
            )}
          </Field>

          <Field label="상품명" required>
            <input style={inputStyle} maxLength={50}
              placeholder="예: 12주 벌크업 루틴 (중급자용)"
              value={mw.title} onChange={e => setMw(f => ({ ...f, title: e.target.value }))} />
            <div style={{ fontSize: 10, color: T.dim, textAlign: 'right', marginTop: 3 }}>
              {mw.title.length}/50
            </div>
          </Field>

          <Field label="상품 소개 (공개)" required hint="구매 전 모든 사람에게 공개됩니다">
            <textarea style={{ ...textareaStyle, height: 100 }} maxLength={400}
              placeholder="상품 구성, 기대 효과, 대상 등을 소개해주세요"
              value={mw.content} onChange={e => setMw(f => ({ ...f, content: e.target.value }))} />
            <div style={{ fontSize: 10, color: T.dim, textAlign: 'right', marginTop: 3 }}>
              {mw.content.length}/400
            </div>
          </Field>

          {/* Public preview video */}
          <Field label="미리보기 영상 링크 (선택, 공개)"
            hint="YouTube / Vimeo 링크를 입력하세요. 영상 파일 직접 업로드는 지원하지 않습니다.">
            <input style={inputStyle}
              placeholder="https://www.youtube.com/watch?v=..."
              value={mw.videoUrl} onChange={e => setMw(f => ({ ...f, videoUrl: e.target.value }))} />
          </Field>

          {/* Purchaser-only content */}
          <div style={{ background: T.accentLight, border: `1px solid ${T.accentText}20`,
            borderRadius: 12, padding: '14px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.accentText, marginBottom: 10 }}>
              🔒 구매자 전용 콘텐츠
            </div>

            {isRoutine ? (
              <Field label="운동 루틴 데이터 (JSON 형식)"
                hint="운동 종목·세트·반복수를 JSON 텍스트로 입력합니다. 빈 칸이면 등록 생략됩니다.">
                <textarea style={{ ...textareaStyle, height: 180, fontFamily: "'DM Mono',monospace",
                  fontSize: 11, background: T.surface }}
                  placeholder={`[\n  {\n    "name": "스쿼트",\n    "sets": [{"reps":"12","weight":"60kg"}]\n  }\n]`}
                  value={mw.routineJson} onChange={e => setMw(f => ({ ...f, routineJson: e.target.value }))} />
              </Field>
            ) : (
              <>
                <Field label="외부 자료 링크 (Notion / Google Drive 등)"
                  hint="구매자에게만 공개됩니다. 노션 공유 링크, 드라이브 파일 링크 등을 입력하세요.">
                  <input style={{ ...inputStyle, background: T.surface }}
                    placeholder="https://notion.so/... 또는 https://drive.google.com/..."
                    value={mw.externalUrl} onChange={e => setMw(f => ({ ...f, externalUrl: e.target.value }))} />
                </Field>
              </>
            )}
          </div>

          {/* Tags */}
          <Field label="태그 (선택)" hint="Enter로 추가 · 최대 5개">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: mw.tags.length ? 8 : 0 }}>
              {mw.tags.map(tag => (
                <span key={tag} style={{ fontSize: 12, background: T.accentLight, color: T.accentText,
                  padding: '3px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                  #{tag}
                  <button onClick={() => setMw(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: T.accentText, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
            <input style={inputStyle}
              placeholder={mw.tags.length < 5 ? '태그 입력 후 Enter…' : ''}
              value={mw.tagInput}
              onChange={e => setMw(f => ({ ...f, tagInput: e.target.value }))}
              onKeyDown={handleMwTagKey}
              disabled={mw.tags.length >= 5} />
          </Field>

          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={() => { setMw(INIT_MW); setScreen('main'); setNavTab('market') }}
              style={{ flex: 1 }}>취소</Btn>
            <Btn variant="primary" onClick={createMarketPost} disabled={uploading}
              style={{ flex: 2, background: T.accent }}>
              {uploading ? '등록 중…' : '🛒 마켓에 등록하기'}
            </Btn>
          </div>
        </div>
      </div>
    )
  }

  /* ════════════════════════════════
     RENDER — main (feed / market / my)
  ════════════════════════════════ */
  const BOTTOM_NAV = [
    {
      key: 'all', label: '전체',
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? T.accent : T.dim} stroke="none">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
        </svg>
      ),
    },
    {
      key: 'jobs', label: '구인구직',
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={a ? T.accent : T.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
          <line x1="12" y1="12" x2="12" y2="16"/>
          <line x1="10" y1="14" x2="14" y2="14"/>
        </svg>
      ),
    },
    {
      key: 'ptmatch', label: 'PT매칭',
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={a ? T.accent : T.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      ),
    },
    {
      key: 'market', label: '마켓',
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={a ? T.accent : T.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
      ),
    },
    {
      key: 'my', label: '내활동',
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={a ? T.accent : T.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      ),
    },
  ]

  return (
    <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 72 }}>

      {/* 최초 로그인 1회 약관 동의 모달 (user_metadata.terms_agreed 미설정 시 강제 노출) */}
      <TermsAgreementModal />

      {/* ── Top bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: '13px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', boxShadow: T.shadow,
      }}>
        <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.8px', color: T.text }}>
          오<span style={{ color: T.accent }}>운</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.dim, marginLeft: 6, letterSpacing: '0.08em' }}>
            COMMUNITY
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {navTab !== 'my' && navTab !== 'market' && (
            <button onClick={() => { setPrevNav(navTab); setScreen('write') }} style={{
              background: T.accent, border: 'none', color: '#fff', borderRadius: 8,
              padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>+ 글쓰기</button>
          )}
          {navTab === 'market' && (
            <button onClick={() => setScreen('market_write')} style={{
              background: T.accent, border: 'none', color: '#fff', borderRadius: 8,
              padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>+ 상품 등록</button>
          )}
          <button onClick={signOut} style={{
            background: 'none', border: `1.5px solid ${T.border}`, color: T.muted,
            borderRadius: 8, padding: '6px 10px', fontSize: 11, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>로그아웃</button>
        </div>
      </div>

      {/* ── Feed: all / jobs / ptmatch ── */}
      {(navTab === 'all' || navTab === 'jobs' || navTab === 'ptmatch') && (
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 8px' }}>
          {/* Category header label */}
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 8 }}>
            {navTab === 'all' && <><span style={{ fontSize: 16 }}>🏠</span> 전체 피드</>}
            {navTab === 'jobs' && <><span style={{ fontSize: 16 }}>💼</span> 구인구직</>}
            {navTab === 'ptmatch' && <><span style={{ fontSize: 16 }}>🏋️</span> PT 매칭</>}
            <button onClick={loadPosts} style={{
              marginLeft: 'auto', background: 'none', border: `1px solid ${T.border}`,
              color: T.muted, borderRadius: 7, padding: '4px 10px',
              fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}>새로고침</button>
          </div>

          {feedLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: T.dim, fontSize: 13 }}>
              불러오는 중…
            </div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 14, color: T.muted, marginBottom: 8 }}>아직 게시글이 없습니다</div>
              <button onClick={() => { setPrevNav(navTab); setScreen('write') }} style={{
                background: T.accent, border: 'none', color: '#fff', borderRadius: 10,
                padding: '10px 20px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>첫 글 작성하기</button>
            </div>
          ) : (
            posts.map(p => (
              <PostCard key={p.id} post={p} onClick={() => openDetail(p)} myId={user?.id} />
            ))
          )}
        </div>
      )}

      {/* ── Market ── */}
      {navTab === 'market' && (
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 8px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🛒</span> 교육 마켓
            <button onClick={loadMarketItems} style={{
              marginLeft: 'auto', background: 'none', border: `1px solid ${T.border}`,
              color: T.muted, borderRadius: 7, padding: '4px 10px',
              fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}>새로고침</button>
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14,
            paddingBottom: 4, scrollbarWidth: 'none' }}>
            {[{ key: null, label: '전체', emoji: '🛒' }, ...MARKET_CATS.map(k => ({ key: k, ...CAT[k] }))].map(f => (
              <button key={f.key || 'all'} style={{
                flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: 'none',
                background: 'transparent', border: `1px solid ${T.border}`,
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                color: T.muted, whiteSpace: 'nowrap',
              }}>
                {f.emoji} {f.label}
              </button>
            ))}
          </div>

          {marketLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: T.dim, fontSize: 13 }}>
              불러오는 중…
            </div>
          ) : marketItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🏪</div>
              <div style={{ fontSize: 14, color: T.muted, marginBottom: 8 }}>등록된 상품이 없습니다</div>
              <button onClick={() => setScreen('market_write')} style={{
                background: T.accent, border: 'none', color: '#fff', borderRadius: 10,
                padding: '10px 20px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>첫 상품 등록하기</button>
            </div>
          ) : (
            marketItems.map(item => (
              <MarketCard
                key={item.id} item={item}
                isPurchased={myPurchases.includes(item.id)}
                isMine={item.user_id === user?.id}
                onClick={() => openMarketDetail(item)}
              />
            ))
          )}
        </div>
      )}

      {/* ── My page ── */}
      {navTab === 'my' && (
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 8px' }}>
          {/* Profile card */}
          <div style={{ background: T.surface, borderRadius: 16, padding: '16px',
            border: `1px solid ${T.border}`, marginBottom: 16, boxShadow: T.shadow,
            display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar user={user} size={52} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 4 }}>
                {user?.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RoleBadge role={user?.role} />
                {user?.location && (
                  <span style={{ fontSize: 11, color: T.dim }}>📍 {user.location}</span>
                )}
              </div>
              {user?.bio && (
                <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{user.bio}</div>
              )}
            </div>
          </div>

          {/* My tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: 16 }}>
            {[
              { key: 'posts',    label: '내 글' },
              { key: 'sent',     label: '보낸 연락' },
              { key: 'received', label: '받은 연락' },
              { key: 'purchases',label: '구매 내역' },
            ].map(t => (
              <button key={t.key} onClick={() => setMyTab(t.key)} style={{
                flex: 1, padding: '10px 4px', border: 'none', background: 'none',
                borderBottom: `2.5px solid ${myTab === t.key ? T.accent : 'transparent'}`,
                color: myTab === t.key ? T.accent : T.muted,
                fontSize: 12, fontWeight: myTab === t.key ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}>{t.label}</button>
            ))}
          </div>

          {/* My posts */}
          {myTab === 'posts' && (
            myPosts.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: T.dim, fontSize: 13 }}>
                  작성한 글이 없습니다
                </div>
              : myPosts.map(p => (
                  <PostCard key={p.id} post={p} onClick={() => openDetail(p)} myId={user?.id} />
                ))
          )}

          {/* Sent contacts */}
          {myTab === 'sent' && (
            sentContacts.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: T.dim, fontSize: 13 }}>
                  보낸 연락이 없습니다
                </div>
              : sentContacts.map(c => (
                  <div key={c.id} style={{ background: T.surface, borderRadius: 12,
                    padding: '14px 16px', marginBottom: 10, border: `1px solid ${T.border}`,
                    boxShadow: T.shadow }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>
                      {c.post?.title || '(삭제된 글)'}
                    </div>
                    {c.message && (
                      <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>"{c.message}"</div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <StatusBadge status={c.status} />
                      <span style={{ fontSize: 10, color: T.dim }}>{timeAgo(c.created_at)}</span>
                    </div>
                  </div>
                ))
          )}

          {/* Received contacts */}
          {myTab === 'received' && (
            receivedContacts.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: T.dim, fontSize: 13 }}>
                  받은 연락이 없습니다
                </div>
              : receivedContacts.map(c => (
                  <div key={c.id} style={{ background: T.surface, borderRadius: 12,
                    padding: '14px 16px', marginBottom: 10, border: `1px solid ${T.border}`,
                    boxShadow: T.shadow }}>
                    <div style={{ fontSize: 11, color: T.dim, marginBottom: 6 }}>
                      📋 {c.post?.title || '(글 제목 없음)'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Avatar user={c.requester} size={26} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{c.requester?.name}</span>
                      <RoleBadge role={c.requester?.role} />
                      <StatusBadge status={c.status} />
                    </div>
                    {c.message && (
                      <div style={{ fontSize: 12, color: T.muted, background: T.surface2,
                        padding: '8px 10px', borderRadius: 8, marginBottom: 8 }}>
                        "{c.message}"
                      </div>
                    )}
                    {c.status === 'accepted' && c.requester?.phone && (
                      <div style={{ fontSize: 12, color: T.accentText, background: T.accentLight,
                        padding: '8px 12px', borderRadius: 8, fontWeight: 600, marginBottom: 8 }}>
                        📞 {c.requester.phone}
                      </div>
                    )}
                    {c.requester?.kakao_link && c.status === 'accepted' && (
                      <KakaoBtn link={c.requester.kakao_link} />
                    )}
                    {c.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <Btn variant="primary" style={{ flex: 1, fontSize: 12 }}
                          onClick={() => updateContactStatus(c.id, 'accepted')}>수락</Btn>
                        <Btn variant="danger" style={{ flex: 1, fontSize: 12 }}
                          onClick={() => updateContactStatus(c.id, 'rejected')}>거절</Btn>
                      </div>
                    )}
                  </div>
                ))
          )}

          {/* Purchases */}
          {myTab === 'purchases' && (
            myPurchasedItems.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0', color: T.dim, fontSize: 13 }}>
                  구매한 상품이 없습니다
                </div>
              : myPurchasedItems.map(p => {
                  const item = p.post
                  return (
                    <div key={p.id} onClick={() => openMarketDetail(item)} style={{
                      background: T.surface, borderRadius: 12, padding: '14px 16px',
                      marginBottom: 10, border: `1px solid ${T.border}`,
                      boxShadow: T.shadow, cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <CatBadge cat={item.category} />
                        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 10,
                          background: p.amount === 0 ? T.accentLight : '#FEF9C3',
                          color: p.amount === 0 ? T.accentText : '#854D0E' }}>
                          {p.amount === 0 ? '무료' : `${Number(p.amount).toLocaleString()}원`}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>
                        {item.title}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: T.dim }}>{item.author?.name}</span>
                        <span style={{ fontSize: 10, color: T.dim, marginLeft: 'auto' }}>
                          {timeAgo(p.purchased_at)}
                        </span>
                        <span style={{ fontSize: 10, color: T.accentText }}>🔓 열람 가능</span>
                      </div>
                    </div>
                  )
                })
          )}
        </div>
      )}

      {/* ════════════════════════════════
          Bottom navigation
      ════════════════════════════════ */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
        background: T.surface, borderTop: `1px solid ${T.border}`,
        display: 'flex', boxShadow: '0 -2px 16px rgba(0,0,0,0.07)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {BOTTOM_NAV.map(({ key, label, icon }) => {
          const active = navTab === key
          return (
            <button key={key} onClick={() => goTab(key)} style={{
              flex: 1, padding: '8px 4px 10px', border: 'none', background: 'none',
              cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 3, position: 'relative', fontFamily: 'inherit',
            }}>
              {active && (
                <span style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 24, height: 2.5, background: T.accent, borderRadius: 2,
                }} />
              )}
              {icon(active)}
              <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500,
                color: active ? T.accent : T.dim }}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
