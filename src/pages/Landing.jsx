import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ── 데이터 ────────────────────────────────────────────────────

const TRAINER_FEATURES = [
  { icon: '✦', title: 'AI 수업일지 자동 생성', desc: '녹음 파일 업로드만 하면 AI가 완성된 수업일지를 작성해줘요' },
  { icon: '👥', title: '회원 관리 올인원', desc: '상태 배지·결제 내역·정지 이력·방문 경로까지 한 곳에' },
  { icon: '📅', title: '주간 스케줄', desc: '수업·개인 일정을 블록으로 관리하고 수업 전 푸시 알림 발송' },
  { icon: '📊', title: '매출 자동 분석', desc: '세션 단가 기반 수익·미진행 세션 잔존가치를 자동 계산' },
  { icon: '⏸', title: '정지(홀딩) 관리', desc: '기간·사유·사진까지 기록하고 회원 상태에 자동 반영' },
  { icon: '🔔', title: '브라우저 종료 알림', desc: '앱을 닫아도 VAPID 푸시로 수업 시작 전 미리 알림' },
]

const MEMBER_FEATURES = [
  { icon: '📋', title: '수업일지 열람', desc: 'PDF 저장·복사로 내 성장 기록을 언제든 꺼내볼 수 있어요' },
  { icon: '⚖️', title: '체중·건강 추적', desc: '공복/저녁 체중, 수면 레벨을 기록하고 14일 추이를 확인' },
  { icon: '🏃', title: '개인운동 일지', desc: '60+ 종목 자동완성, 세트·볼륨 계산, 앞뒤 근육 다이어그램' },
  { icon: '🤝', title: '회원 커뮤니티', desc: '같은 센터 회원들과 운동 일상을 사진·이모지로 공유' },
]

const PROBLEMS = [
  {
    icon: '😮‍💨',
    title: '수업 끝나고 일지 쓰는 데 30분씩 쓰고 계신가요?',
    desc: '운동 종목, 세트 수, 느낀 점… 기억에 의존해서 손으로 하나하나 적다 보면 하루가 다 가요. 정작 다음 회원 준비는 뒷전이 되고요.',
  },
  {
    icon: '👻',
    title: '연락 없이 사라지는 회원, 막을 방법이 없었나요?',
    desc: '재등록 시기가 됐는데도 아무 신호가 없어요. 출석이 줄고 있다는 걸 알면서도 어떻게 말을 꺼내야 할지 모르죠.',
  },
  {
    icon: '📉',
    title: '이번 달 매출이 얼마인지 바로 답할 수 있나요?',
    desc: '엑셀도, 메모장도, 카카오톡도 다 따로따로. 세션 단가 × 잔여 횟수 계산을 머릿속으로 하고 계신다면, 이미 시간을 낭비하고 있는 거예요.',
  },
]

const SOLUTIONS = [
  {
    icon: '✦',
    title: '녹음만 올리면 일지가 완성돼요',
    desc: 'AI가 수업 내용을 분석해 운동 종목·세트·피드백을 완성된 일지로 만들어줘요. 회원에게는 카카오톡으로 바로 발송.',
    tag: 'AI 수업일지',
  },
  {
    icon: '🔔',
    title: '이탈 징후를 미리 알려줘요',
    desc: '출석률·건강기록·수업 평점을 분석해 이탈위험 회원을 자동으로 감지해요. 연락 타이밍을 놓치지 마세요.',
    tag: '이탈위험 감지',
  },
  {
    icon: '📊',
    title: '매출이 실시간으로 계산돼요',
    desc: '결제를 등록하면 세션 단가·잔존가치·월 매출이 자동으로 집계돼요. 대관·프리랜서·정직원 고용형태별 세금 계산도 지원해요.',
    tag: '매출 자동 분석',
  },
]

const STATS = [
  { num: '3분', label: '첫 수업일지 완성까지', sub: '녹음 업로드부터 발송까지' },
  { num: '98%', label: '리포트 평균 열람률', sub: '회원이 실제로 확인하는 일지' },
  { num: '0원', label: '시작 비용', sub: '무료 플랜으로 지금 바로 시작' },
]

const REVIEWS = [
  {
    name: '김O준 트레이너',
    location: '서울 마포구 · 1인샵',
    text: '수업 끝나고 일지 쓰는 게 제일 귀찮았는데, 녹음 올리면 알아서 써줘서 진짜 편해요. 회원들도 리포트 받으면 좋아해서 재등록률이 확실히 올라갔어요.',
    rating: 5,
    initial: '김',
  },
  {
    name: '이O현 트레이너',
    location: '경기 성남 · 프리랜서',
    text: '이탈위험 기능이 신기해요. 출석이 줄던 회원한테 미리 연락했더니 "연락 와줘서 감사하다"고 하더라고요. 그 회원 재등록했어요.',
    rating: 5,
    initial: '이',
  },
  {
    name: '박O영 트레이너',
    location: '부산 해운대 · 센터 소속',
    text: '매출 계산을 엑셀로 하다가 이걸로 바꿨는데 시간이 확 줄었어요. 세금 계산까지 해주는 건 몰랐는데 정산 탭 보고 깜짝 놀랐어요.',
    rating: 5,
    initial: '박',
  },
]

const KAKAO_MSGS = [
  { from: '회원', text: '트레이너님!! 리포트 너무 자세해서 깜짝 놀랐어요 ㅠㅠ 이렇게까지 신경 써주시다니 감동이에요 🥹', time: '오후 8:23' },
  { from: '회원', text: '오늘 운동 기록 딱 정리돼서 왔네요! 다음 수업도 기대돼요 💪', time: '오후 10:05' },
  { from: '회원', text: '와 선생님 이거 뭐예요?? 제 운동 내용이 다 정리돼있어요 ㅋㅋㅋ 친구한테도 자랑했어요', time: '오후 7:41' },
]

const TARGETS = [
  {
    type: '1인샵 운영 트레이너',
    icon: '🏠',
    color: '#c8f135',
    textColor: '#3f6212',
    bg: 'rgba(200,241,53,0.08)',
    border: 'rgba(200,241,53,0.3)',
    points: [
      '혼자 다 하느라 행정에 시간 다 빼앗기는 분',
      '회원 관리·매출·일지를 하나로 합치고 싶은 분',
      '더 많은 시간을 수업 품질에 쓰고 싶은 분',
    ],
  },
  {
    type: '프리랜서 트레이너',
    icon: '🧳',
    color: '#60a5fa',
    textColor: '#1d4ed8',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.3)',
    points: [
      '센터별 회원을 따로 관리하기 복잡한 분',
      '수수료·세금 계산이 번거로운 분',
      '이탈 걱정 없이 안정적인 수업을 원하는 분',
    ],
  },
  {
    type: '센터 소속 트레이너',
    icon: '🏢',
    color: '#a78bfa',
    textColor: '#7c3aed',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.3)',
    points: [
      '재등록률을 높여 인센티브를 늘리고 싶은 분',
      '회원과의 관계를 전문적으로 보여주고 싶은 분',
      '주간 리포트로 센터 내 신뢰를 쌓고 싶은 분',
    ],
  },
]

const PLANS = [
  {
    name: '무료 플랜',
    price: '0원',
    period: '영구 무료',
    highlight: false,
    tag: null,
    color: '#64748b',
    features: [
      'AI 수업일지 월 20회',
      '회원 관리 (최대 20명)',
      '수업 리포트 카카오 발송',
      '체중·건강 기록',
      '주간 스케줄',
      '매출 기본 분석',
    ],
    cta: '무료로 시작하기',
    ctaLink: '/trainer',
    note: '결제 수단 등록 불필요',
  },
  {
    name: 'Pro 플랜',
    price: '준비 중',
    period: '출시 예정',
    highlight: true,
    tag: '곧 출시',
    color: '#c8f135',
    features: [
      'AI 수업일지 무제한',
      '회원 관리 무제한',
      '이탈위험 자동 감지',
      '고용형태별 세금 계산',
      '주간 센터 리포트',
      '우선 고객 지원',
    ],
    cta: '출시 알림 받기',
    ctaLink: 'mailto:support@trainerlog.app?subject=Pro 플랜 출시 알림 신청',
    note: '얼리어답터 할인 예정',
  },
]

const FAQS = [
  {
    q: 'AI 수업일지를 만들려면 별도 비용이 드나요?',
    a: '크레딧 방식으로 운영돼요. 가입 시 기본 크레딧이 지급되며, 크레딧 1개로 AI 수업일지를 1회 생성할 수 있어요. 추가 크레딧은 합리적인 가격으로 충전할 수 있어요.',
  },
  {
    q: '회원이 별도로 앱을 설치해야 하나요?',
    a: '아니요. 회원은 트레이너가 카카오톡으로 보내는 링크를 클릭하기만 하면 돼요. 앱 설치 없이 브라우저에서 바로 수업 리포트를 확인할 수 있어요.',
  },
  {
    q: '트레이너 여러 명이 함께 쓸 수 있나요?',
    a: '현재는 트레이너 개인 계정 단위로 운영돼요. 각 트레이너가 개별 계정을 만들어 사용하면 됩니다. 센터 단위 플랜은 Pro 출시와 함께 검토 중이에요.',
  },
  {
    q: '기존에 쓰던 데이터를 옮겨올 수 있나요?',
    a: '현재는 직접 입력 방식만 지원해요. 회원 등록은 간단한 양식으로 빠르게 입력할 수 있어요. 데이터 마이그레이션 기능은 Pro 플랜과 함께 제공될 예정이에요.',
  },
  {
    q: '스마트폰에서도 잘 되나요?',
    a: '네. 모바일 브라우저에 최적화되어 있어요. 홈 화면에 추가(PWA)하면 앱처럼 사용할 수 있고, 수업 전 푸시 알림도 받을 수 있어요.',
  },
  {
    q: 'Pro 플랜 가격은 얼마인가요?',
    a: '아직 확정되지 않았어요. 얼리어답터분들에게 더 합리적인 가격으로 제공할 예정이에요. 출시 알림을 신청해두시면 가장 먼저 안내드릴게요.',
  },
]


// ── 애니메이션 헬퍼 ───────────────────────────────────────────

// 뷰포트 진입 감지
function useInView(threshold = 0.12) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect() } },
      { threshold }
    )
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, inView]
}

// 섹션 전체: 아래에서 위로 페이드인
function FadeUp({ children, delay = 0 }) {
  const [ref, inView] = useInView(0.1)
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0px)' : 'translateY(52px)',
      transition: `opacity 0.85s cubic-bezier(.22,1,.36,1) ${delay}ms, transform 0.85s cubic-bezier(.22,1,.36,1) ${delay}ms`,
    }}>
      {children}
    </div>
  )
}

// 카드: 왼쪽에서 슬라이드인 (delay로 순차 등장)
function SlideCard({ children, delay = 0 }) {
  const [ref, inView] = useInView(0.06)
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateX(0px)' : 'translateX(-52px)',
      transition: `opacity 0.65s ease ${delay}ms, transform 0.65s cubic-bezier(.22,1,.36,1) ${delay}ms`,
      height: '100%',
    }}>
      {children}
    </div>
  )
}

// 숫자 카운트업 (ex. "98%" → 0%…98%)
function CountUp({ value }) {
  const [ref, inView] = useInView(0.5)
  const [display, setDisplay] = useState('0')
  useEffect(() => {
    if (!inView) return
    const str = String(value)
    const match = str.match(/^(\D*)(\d+\.?\d*)(\D*)$/)
    if (!match) { setDisplay(str); return }
    const [, pre, numStr, post] = match
    const target = parseFloat(numStr)
    if (target === 0) { setDisplay(str); return }
    const duration = 1600
    const startTime = performance.now()
    const tick = (now) => {
      const t = Math.min((now - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3) // ease-out cubic
      const curr = Math.round(ease * target)
      setDisplay(`${pre}${curr}${post}`)
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [inView, value])
  return <span ref={ref}>{display}</span>
}


export default function Landing() {
  const [openFaq, setOpenFaq] = useState(null)
  const [stats,   setStats]   = useState(STATS)
  const [reviews, setReviews] = useState(REVIEWS)
  const [kakao,   setKakao]   = useState(KAKAO_MSGS)
  const [faqs,    setFaqs]    = useState(FAQS)

  useEffect(() => {
    supabase.from('app_settings')
      .select('key, value')
      .in('key', ['landing_stats','landing_reviews','landing_kakao','landing_faqs'])
      .then(({ data }) => {
        if (!data) return
        data.forEach(row => {
          if (row.key === 'landing_stats'   && Array.isArray(row.value)) setStats(row.value)
          if (row.key === 'landing_reviews' && Array.isArray(row.value)) setReviews(row.value)
          if (row.key === 'landing_kakao'   && Array.isArray(row.value)) setKakao(row.value)
          if (row.key === 'landing_faqs'    && Array.isArray(row.value)) setFaqs(row.value)
        })
      })
  }, [])

  return (
    <div style={{background:'#f8fafc',color:'#0f172a',minHeight:'100vh',fontFamily:"'Noto Sans KR',sans-serif",overflowX:'hidden'}}>

      {/* ── STICKY NAV ── */}
      <nav style={{position:'sticky',top:0,zIndex:100,background:'rgba(248,250,252,0.92)',backdropFilter:'blur(16px)',borderBottom:'1px solid #e2e8f0',padding:'0 20px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',height:'54px'}}>
          <div style={{fontSize:'17px',fontWeight:900,letterSpacing:'-0.5px',color:'#111'}}>
            오<span style={{background:'#c8f135',color:'#111',padding:'1px 7px',borderRadius:'5px',marginLeft:'2px'}}>운</span>
          </div>
          <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
            <Link to="/trainer" style={{fontSize:'13px',fontWeight:700,padding:'7px 16px',borderRadius:'9px',background:'#111827',color:'#fff',textDecoration:'none'}}>트레이너 앱</Link>
            <Link to="/member" style={{fontSize:'13px',fontWeight:700,padding:'7px 16px',borderRadius:'9px',background:'#c8f135',color:'#111',textDecoration:'none'}}>회원 포털</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{position:'relative',minHeight:'90vh',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',padding:'60px 24px 40px'}}>
        <div style={{position:'absolute',inset:0,
          backgroundImage:'url(https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1920&q=80)',
          backgroundSize:'cover',backgroundPosition:'center 30%',zIndex:0}}/>
        <div style={{position:'absolute',inset:0,
          background:'linear-gradient(110deg,rgba(248,250,252,0.96) 0%,rgba(248,250,252,0.78) 45%,rgba(248,250,252,0.30) 100%)',
          zIndex:1}}/>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:'160px',
          background:'linear-gradient(transparent,#f8fafc)',zIndex:2}}/>

        <div style={{position:'relative',zIndex:3,width:'100%',maxWidth:'860px',margin:'0 auto'}}>
          <div style={{maxWidth:'560px'}}>
            <div style={{display:'inline-block',fontSize:'11px',fontWeight:700,letterSpacing:'0.14em',
              color:'#3f6212',background:'rgba(200,241,53,0.3)',padding:'5px 14px',borderRadius:'20px',
              border:'1px solid rgba(132,204,22,0.5)',marginBottom:'24px'}}>
              FOR PERSONAL TRAINERS &amp; MEMBERS
            </div>
            <h1 style={{fontSize:'clamp(32px,7vw,58px)',fontWeight:900,letterSpacing:'-2px',
              lineHeight:1.1,color:'#0f172a',margin:'0 0 20px'}}>
              좋은 트레이너는<br/>
              <span style={{color:'#84cc16'}}>기록</span>으로 증명합니다
            </h1>
            <p style={{fontSize:'clamp(16px,2.5vw,20px)',fontWeight:600,color:'#334155',
              margin:'0 0 12px',lineHeight:1.5,letterSpacing:'-0.3px'}}>
              수업일지 · 회원관리 · 매출분석을<br/>하나의 앱으로
            </p>
            <p style={{fontSize:'14px',color:'#64748b',lineHeight:1.9,margin:'0 0 32px',maxWidth:'380px'}}>
              AI가 수업일지를 대신 쓰고, 회원은 포털에서 기록을 확인해요.<br/>
              트레이너의 전문성이 데이터로 쌓입니다.
            </p>
            <div style={{display:'flex',gap:'10px',flexWrap:'wrap',marginBottom:'28px'}}>
              <Link to="/trainer" style={{background:'#0f172a',color:'#fff',padding:'14px 28px',
                borderRadius:'12px',fontWeight:700,fontSize:'14px',textDecoration:'none',
                boxShadow:'0 4px 20px rgba(15,23,42,0.25)',letterSpacing:'-0.3px'}}>
                무료로 시작하기 →
              </Link>
              <Link to="/member" style={{background:'#c8f135',color:'#0f172a',padding:'14px 28px',
                borderRadius:'12px',fontWeight:700,fontSize:'14px',textDecoration:'none',
                boxShadow:'0 4px 20px rgba(200,241,53,0.45)',letterSpacing:'-0.3px'}}>
                회원 포털 입장
              </Link>
            </div>
            <div style={{display:'flex',gap:'16px',flexWrap:'wrap',alignItems:'center'}}>
              {['✓ 무료 플랜으로 지금 시작','✓ 3분이면 첫 리포트 발송','✓ 결제 수단 등록 불필요'].map((t,i) => (
                <span key={i} style={{fontSize:'12px',fontWeight:600,color:'#16a34a'}}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 숫자 기반 신뢰 지표 (CountUp) ── */}
      <section style={{background:'#fff',borderTop:'1px solid #f1f5f9',borderBottom:'1px solid #f1f5f9',padding:'40px 24px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'24px',textAlign:'center'}}>
          {stats.map((s,i) => (
            <SlideCard key={i} delay={i * 150}>
              <div style={{padding:'8px'}}>
                <div style={{fontSize:'clamp(28px,5vw,42px)',fontWeight:900,letterSpacing:'-2px',color:'#0f172a',lineHeight:1}}>
                  <CountUp value={s.num} />
                </div>
                <div style={{fontSize:'13px',fontWeight:700,color:'#334155',margin:'6px 0 4px'}}>{s.label}</div>
                <div style={{fontSize:'11px',color:'#94a3b8'}}>{s.sub}</div>
              </div>
            </SlideCard>
          ))}
        </div>
      </section>

      {/* ── 문제 인식 (PROBLEM) ── */}
      <section style={{background:'#f8fafc',padding:'80px 24px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto'}}>
          <FadeUp>
            <div style={{textAlign:'center',marginBottom:'48px'}}>
              <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#dc2626',marginBottom:'10px'}}>PROBLEM</div>
              <h2 style={{fontSize:'clamp(22px,4vw,32px)',fontWeight:800,color:'#0f172a',letterSpacing:'-1px',margin:'0 0 10px',lineHeight:1.3}}>
                이런 상황, 익숙하지 않으신가요?
              </h2>
              <p style={{fontSize:'14px',color:'#64748b',margin:0}}>트레이너라면 누구나 한 번쯤 겪어봤을 이야기</p>
            </div>
          </FadeUp>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'16px'}}>
            {PROBLEMS.map((p,i) => (
              <SlideCard key={i} delay={i * 130}>
                <div style={{background:'#fff',border:'1px solid #fee2e2',borderRadius:'16px',padding:'24px',
                  boxShadow:'0 2px 12px rgba(239,68,68,0.06)',height:'100%',boxSizing:'border-box'}}>
                  <div style={{fontSize:'28px',marginBottom:'12px'}}>{p.icon}</div>
                  <div style={{fontSize:'14px',fontWeight:700,color:'#0f172a',marginBottom:'10px',lineHeight:1.4,letterSpacing:'-0.3px'}}>{p.title}</div>
                  <div style={{fontSize:'13px',color:'#64748b',lineHeight:1.75}}>{p.desc}</div>
                </div>
              </SlideCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── 솔루션 (SOLUTION) ── */}
      <section style={{background:'#fff',padding:'80px 24px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto'}}>
          <FadeUp>
            <div style={{textAlign:'center',marginBottom:'48px'}}>
              <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#16a34a',marginBottom:'10px'}}>SOLUTION</div>
              <h2 style={{fontSize:'clamp(22px,4vw,32px)',fontWeight:800,color:'#0f172a',letterSpacing:'-1px',margin:'0 0 10px',lineHeight:1.3}}>
                오운이 이렇게 해결해드려요
              </h2>
              <p style={{fontSize:'14px',color:'#64748b',margin:0}}>복잡한 설정 없이, 쓰는 즉시 달라집니다</p>
            </div>
          </FadeUp>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'16px'}}>
            {SOLUTIONS.map((s,i) => (
              <SlideCard key={i} delay={i * 130}>
                <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'16px',padding:'24px',
                  boxShadow:'0 2px 12px rgba(22,163,74,0.06)',height:'100%',boxSizing:'border-box'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'14px'}}>
                    <span style={{fontSize:'20px'}}>{s.icon}</span>
                    <span style={{fontSize:'11px',fontWeight:700,color:'#16a34a',background:'rgba(22,163,74,0.1)',
                      padding:'3px 10px',borderRadius:'20px',letterSpacing:'0.05em'}}>{s.tag}</span>
                  </div>
                  <div style={{fontSize:'15px',fontWeight:700,color:'#0f172a',marginBottom:'8px',letterSpacing:'-0.3px'}}>{s.title}</div>
                  <div style={{fontSize:'13px',color:'#475569',lineHeight:1.75}}>{s.desc}</div>
                </div>
              </SlideCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI 수업일지 하이라이트 ── */}
      <section style={{background:'#f8fafc',padding:'0 24px 80px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto'}}>
          <FadeUp>
            <div style={{background:'linear-gradient(135deg,#0f172a 0%,#14290a 100%)',borderRadius:'24px',padding:'40px 36px',color:'#fff',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:'-60px',right:'-60px',width:'240px',height:'240px',
                background:'radial-gradient(circle,rgba(200,241,53,0.18) 0%,transparent 70%)',pointerEvents:'none'}}/>
              <div style={{position:'absolute',bottom:'-40px',left:'30%',width:'180px',height:'180px',
                background:'radial-gradient(circle,rgba(132,204,22,0.08) 0%,transparent 70%)',pointerEvents:'none'}}/>
              <div style={{position:'relative',zIndex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'18px'}}>
                  <span style={{fontSize:'24px'}}>✦</span>
                  <span style={{fontSize:'12px',fontWeight:700,color:'#c8f135',letterSpacing:'0.1em'}}>AI POWERED</span>
                </div>
                <div style={{fontSize:'clamp(20px,4vw,28px)',fontWeight:800,lineHeight:1.3,marginBottom:'16px',letterSpacing:'-0.5px'}}>
                  수업 후 녹음 파일만 올리면<br/>수업일지가 완성됩니다
                </div>
                <div style={{fontSize:'14px',color:'rgba(255,255,255,0.65)',lineHeight:1.85,marginBottom:'28px'}}>
                  Gemini AI가 음성을 분석해 운동 종목·세트·느낀점을 자동으로 일지로 변환해요.<br/>
                  완성된 일지는 카카오톡으로 회원에게 즉시 전달됩니다.
                </div>
                <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
                  {['녹음 업로드','AI 분석','일지 완성','카카오 발송'].map((step,i) => (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{background:'rgba(200,241,53,0.18)',color:'#c8f135',borderRadius:'50%',
                        width:'24px',height:'24px',display:'flex',alignItems:'center',justifyContent:'center',
                        fontSize:'12px',fontWeight:700,flexShrink:0,border:'1px solid rgba(200,241,53,0.3)'}}>
                        {i+1}
                      </span>
                      <span style={{fontSize:'13px',color:'rgba(255,255,255,0.8)'}}>{step}</span>
                      {i < 3 && <span style={{color:'#334155',fontSize:'16px'}}>›</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── 회원 카카오톡 반응 ── */}
      <section style={{background:'#fff',padding:'80px 24px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto'}}>
          <FadeUp>
            <div style={{textAlign:'center',marginBottom:'48px'}}>
              <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#f59e0b',marginBottom:'10px'}}>MEMBER REACTION</div>
              <h2 style={{fontSize:'clamp(22px,4vw,32px)',fontWeight:800,color:'#0f172a',letterSpacing:'-1px',margin:'0 0 10px',lineHeight:1.3}}>
                리포트를 받은 회원들의 반응
              </h2>
              <p style={{fontSize:'14px',color:'#64748b',margin:0}}>실제 회원들이 보내온 메시지예요</p>
            </div>
          </FadeUp>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'14px'}}>
            {kakao.map((msg, i) => (
              <SlideCard key={i} delay={i * 130}>
                <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'16px',padding:'16px',
                  boxShadow:'0 2px 12px rgba(0,0,0,0.05)',height:'100%',boxSizing:'border-box'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
                    <div style={{width:'32px',height:'32px',borderRadius:'50%',background:'#fee2e2',
                      display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0}}>
                      🙋
                    </div>
                    <div>
                      <div style={{fontSize:'12px',fontWeight:700,color:'#0f172a'}}>회원</div>
                      <div style={{fontSize:'10px',color:'#94a3b8'}}>수업 리포트 수신 후</div>
                    </div>
                  </div>
                  <div style={{background:'#fff8e1',border:'1px solid #fde68a',borderRadius:'0px 12px 12px 12px',
                    padding:'10px 13px',fontSize:'13px',color:'#1c1917',lineHeight:1.7,position:'relative'}}>
                    {msg.text}
                    <div style={{textAlign:'right',fontSize:'10px',color:'#a8a29e',marginTop:'6px'}}>{msg.time}</div>
                  </div>
                </div>
              </SlideCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── 트레이너 후기 (RESULTS) ── */}
      <section style={{background:'#f8fafc',padding:'80px 24px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto'}}>
          <FadeUp>
            <div style={{textAlign:'center',marginBottom:'48px'}}>
              <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#7c3aed',marginBottom:'10px'}}>RESULTS</div>
              <h2 style={{fontSize:'clamp(22px,4vw,32px)',fontWeight:800,color:'#0f172a',letterSpacing:'-1px',margin:'0 0 10px',lineHeight:1.3}}>
                이미 검증된 트레이너들의 선택
              </h2>
              <p style={{fontSize:'14px',color:'#64748b',margin:0}}>오운을 쓰고 달라진 점들</p>
            </div>
          </FadeUp>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'16px'}}>
            {reviews.map((r,i) => (
              <SlideCard key={i} delay={i * 130}>
                <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'16px',padding:'24px',
                  boxShadow:'0 2px 12px rgba(0,0,0,0.05)',height:'100%',boxSizing:'border-box'}}>
                  <div style={{display:'flex',marginBottom:'12px'}}>
                    {[...Array(r.rating)].map((_,j) => (
                      <span key={j} style={{color:'#f59e0b',fontSize:'14px'}}>★</span>
                    ))}
                  </div>
                  <p style={{fontSize:'13px',color:'#334155',lineHeight:1.8,margin:'0 0 16px'}}>"{r.text}"</p>
                  <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                    <div style={{width:'36px',height:'36px',borderRadius:'50%',background:'linear-gradient(135deg,#c8f135,#84cc16)',
                      display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:'15px',color:'#1a2e05',flexShrink:0}}>
                      {r.initial}
                    </div>
                    <div>
                      <div style={{fontSize:'13px',fontWeight:700,color:'#0f172a'}}>{r.name}</div>
                      <div style={{fontSize:'11px',color:'#94a3b8'}}>{r.location}</div>
                    </div>
                  </div>
                </div>
              </SlideCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── 타겟별 분기 ── */}
      <section style={{background:'#fff',padding:'80px 24px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto'}}>
          <FadeUp>
            <div style={{textAlign:'center',marginBottom:'48px'}}>
              <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#0284c7',marginBottom:'10px'}}>WHO IS IT FOR</div>
              <h2 style={{fontSize:'clamp(22px,4vw,32px)',fontWeight:800,color:'#0f172a',letterSpacing:'-1px',margin:'0 0 10px',lineHeight:1.3}}>
                어떤 트레이너에게 맞을까요?
              </h2>
              <p style={{fontSize:'14px',color:'#64748b',margin:0}}>고용형태에 맞게 활용할 수 있어요</p>
            </div>
          </FadeUp>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'16px'}}>
            {TARGETS.map((t,i) => (
              <SlideCard key={i} delay={i * 130}>
                <div style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:'16px',padding:'24px',height:'100%',boxSizing:'border-box'}}>
                  <div style={{fontSize:'28px',marginBottom:'12px'}}>{t.icon}</div>
                  <div style={{fontSize:'15px',fontWeight:800,color:'#0f172a',marginBottom:'14px',letterSpacing:'-0.3px'}}>{t.type}</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                    {t.points.map((p,j) => (
                      <div key={j} style={{display:'flex',gap:'8px',alignItems:'flex-start'}}>
                        <span style={{color:t.color,fontWeight:700,fontSize:'14px',flexShrink:0,marginTop:'1px'}}>✓</span>
                        <span style={{fontSize:'13px',color:'#334155',lineHeight:1.6}}>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SlideCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── 회원 포털 기능 ── */}
      <section style={{background:'#f8fafc',padding:'80px 24px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto'}}>
          <FadeUp>
            <div style={{marginBottom:'40px',textAlign:'center'}}>
              <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#0284c7',marginBottom:'10px'}}>MEMBER PORTAL</div>
              <h2 style={{fontSize:'clamp(22px,4vw,32px)',fontWeight:800,color:'#0f172a',letterSpacing:'-1px',margin:'0 0 10px',lineHeight:1.3}}>
                회원이 직접 기록하고 확인하는 공간
              </h2>
              <p style={{fontSize:'14px',color:'#64748b',margin:0}}>트레이너와 연결된 나만의 건강 기록장</p>
            </div>
          </FadeUp>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'16px'}}>
            {MEMBER_FEATURES.map((f,i) => (
              <SlideCard key={i} delay={i * 130}>
                <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:'16px',padding:'24px',
                  boxShadow:'0 2px 8px rgba(2,132,199,0.06)',height:'100%',boxSizing:'border-box'}}>
                  <div style={{fontSize:'28px',marginBottom:'12px'}}>{f.icon}</div>
                  <div style={{fontSize:'15px',fontWeight:700,color:'#0f172a',marginBottom:'8px',letterSpacing:'-0.3px'}}>{f.title}</div>
                  <div style={{fontSize:'13px',color:'#475569',lineHeight:1.7}}>{f.desc}</div>
                </div>
              </SlideCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── 요금제 ── */}
      <section style={{background:'#0f172a',padding:'80px 24px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto'}}>
          <FadeUp>
            <div style={{textAlign:'center',marginBottom:'48px'}}>
              <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#c8f135',marginBottom:'12px'}}>PRICING</div>
              <h2 style={{fontSize:'clamp(22px,4vw,32px)',fontWeight:800,color:'#fff',letterSpacing:'-1px',margin:'0 0 10px',lineHeight:1.3}}>
                합리적인 요금제
              </h2>
              <p style={{fontSize:'14px',color:'rgba(255,255,255,0.45)',margin:0}}>무료 플랜으로 시작하고, 필요할 때 업그레이드하세요</p>
            </div>
          </FadeUp>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'16px',maxWidth:'640px',margin:'0 auto'}}>
            {PLANS.map((plan, i) => (
              <SlideCard key={i} delay={i * 150}>
                <div style={{
                  background: plan.highlight ? 'linear-gradient(145deg,#1e2f08,#0f1a03)' : 'rgba(255,255,255,0.04)',
                  border: plan.highlight ? '1px solid rgba(200,241,53,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius:'20px',
                  padding:'28px 24px',
                  position:'relative',
                  boxShadow: plan.highlight ? '0 8px 32px rgba(200,241,53,0.15)' : 'none',
                  height:'100%',boxSizing:'border-box',
                }}>
                  {plan.tag && (
                    <div style={{position:'absolute',top:'-12px',left:'50%',transform:'translateX(-50%)',
                      background:'#c8f135',color:'#0f172a',fontSize:'11px',fontWeight:800,padding:'4px 14px',
                      borderRadius:'20px',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>
                      {plan.tag}
                    </div>
                  )}
                  <div style={{fontSize:'13px',fontWeight:700,color: plan.highlight ? '#c8f135' : '#94a3b8',marginBottom:'8px'}}>{plan.name}</div>
                  <div style={{fontSize:'clamp(28px,5vw,38px)',fontWeight:900,color:'#fff',letterSpacing:'-2px',lineHeight:1,marginBottom:'4px'}}>{plan.price}</div>
                  <div style={{fontSize:'12px',color:'rgba(255,255,255,0.4)',marginBottom:'24px'}}>{plan.period}</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'24px'}}>
                    {plan.features.map((f, j) => (
                      <div key={j} style={{display:'flex',gap:'8px',alignItems:'center'}}>
                        <span style={{color: plan.highlight ? '#c8f135' : '#64748b',fontSize:'13px',flexShrink:0}}>✓</span>
                        <span style={{fontSize:'13px',color:'rgba(255,255,255,0.7)'}}>{f}</span>
                      </div>
                    ))}
                  </div>
                  {plan.ctaLink.startsWith('/') ? (
                    <Link to={plan.ctaLink} style={{
                      display:'block',textAlign:'center',padding:'12px',
                      background: plan.highlight ? '#c8f135' : 'rgba(255,255,255,0.08)',
                      color: plan.highlight ? '#0f172a' : '#fff',
                      borderRadius:'10px',fontWeight:700,fontSize:'14px',textDecoration:'none',marginBottom:'8px'
                    }}>
                      {plan.cta}
                    </Link>
                  ) : (
                    <a href={plan.ctaLink} style={{
                      display:'block',textAlign:'center',padding:'12px',
                      background: plan.highlight ? '#c8f135' : 'rgba(255,255,255,0.08)',
                      color: plan.highlight ? '#0f172a' : '#fff',
                      borderRadius:'10px',fontWeight:700,fontSize:'14px',textDecoration:'none',marginBottom:'8px'
                    }}>
                      {plan.cta}
                    </a>
                  )}
                  <div style={{textAlign:'center',fontSize:'11px',color:'rgba(255,255,255,0.3)'}}>{plan.note}</div>
                </div>
              </SlideCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{background:'#f8fafc',padding:'80px 24px'}}>
        <div style={{maxWidth:'680px',margin:'0 auto'}}>
          <FadeUp>
            <div style={{textAlign:'center',marginBottom:'48px'}}>
              <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#64748b',marginBottom:'10px'}}>FAQ</div>
              <h2 style={{fontSize:'clamp(22px,4vw,32px)',fontWeight:800,color:'#0f172a',letterSpacing:'-1px',margin:'0 0 10px',lineHeight:1.3}}>
                자주 묻는 질문
              </h2>
            </div>
          </FadeUp>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {faqs.map((faq, i) => (
              <FadeUp key={i} delay={i * 60}>
                <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'14px',overflow:'hidden',
                  boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{width:'100%',padding:'18px 20px',background:'none',border:'none',cursor:'pointer',
                      display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',textAlign:'left'}}
                  >
                    <span style={{fontSize:'14px',fontWeight:600,color:'#0f172a',lineHeight:1.4}}>{faq.q}</span>
                    <span style={{fontSize:'18px',color:'#94a3b8',flexShrink:0,transition:'transform 0.2s',
                      transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)'}}>+</span>
                  </button>
                  {openFaq === i && (
                    <div style={{padding:'0 20px 18px',fontSize:'13px',color:'#475569',lineHeight:1.85,
                      borderTop:'1px solid #f1f5f9',paddingTop:'14px'}}>
                      {faq.a}
                    </div>
                  )}
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── 최하단 CTA ── */}
      <section style={{background:'#0f172a',padding:'80px 24px'}}>
        <div style={{maxWidth:'860px',margin:'0 auto'}}>
          <FadeUp>
            <div style={{textAlign:'center',marginBottom:'48px'}}>
              <div style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.13em',color:'#c8f135',marginBottom:'12px'}}>GET STARTED</div>
              <h2 style={{fontSize:'clamp(24px,5vw,36px)',fontWeight:800,color:'#fff',letterSpacing:'-1px',margin:'0 0 10px'}}>
                어떤 역할로 시작할까요?
              </h2>
              <p style={{fontSize:'14px',color:'rgba(255,255,255,0.5)',margin:0}}>포털을 선택해 바로 시작할 수 있어요</p>
            </div>
          </FadeUp>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
            <SlideCard delay={0}>
              <Link to="/trainer" style={{
                background:'linear-gradient(145deg,#1e293b,#162004)',
                border:'1px solid rgba(200,241,53,0.3)',borderRadius:'20px',padding:'32px 24px',
                textAlign:'center',textDecoration:'none',color:'#fff',display:'block',
                boxShadow:'0 8px 32px rgba(0,0,0,0.3)',height:'100%',boxSizing:'border-box'}}>
                <div style={{fontSize:'36px',marginBottom:'14px'}}>💪</div>
                <div style={{fontSize:'17px',fontWeight:800,marginBottom:'8px',letterSpacing:'-0.5px'}}>트레이너 앱</div>
                <div style={{fontSize:'12px',color:'rgba(255,255,255,0.5)',lineHeight:1.7,marginBottom:'18px'}}>
                  수업일지 · 회원관리<br/>스케줄 · 매출 분석
                </div>
                <div style={{display:'inline-block',fontSize:'13px',color:'#c8f135',fontWeight:700,
                  background:'rgba(200,241,53,0.1)',padding:'7px 16px',borderRadius:'8px',
                  border:'1px solid rgba(200,241,53,0.25)'}}>
                  무료로 시작하기 →
                </div>
              </Link>
            </SlideCard>

            <SlideCard delay={150}>
              <Link to="/member" style={{
                background:'linear-gradient(145deg,#1e293b,#041020)',
                border:'1px solid rgba(79,195,247,0.3)',borderRadius:'20px',padding:'32px 24px',
                textAlign:'center',textDecoration:'none',color:'#fff',display:'block',
                boxShadow:'0 8px 32px rgba(0,0,0,0.3)',height:'100%',boxSizing:'border-box'}}>
                <div style={{fontSize:'36px',marginBottom:'14px'}}>🏃</div>
                <div style={{fontSize:'17px',fontWeight:800,marginBottom:'8px',letterSpacing:'-0.5px'}}>회원 포털</div>
                <div style={{fontSize:'12px',color:'rgba(255,255,255,0.5)',lineHeight:1.7,marginBottom:'18px'}}>
                  수업일지 · 체중관리<br/>개인운동 · 커뮤니티
                </div>
                <div style={{display:'inline-block',fontSize:'13px',color:'#4fc3f7',fontWeight:700,
                  background:'rgba(79,195,247,0.1)',padding:'7px 16px',borderRadius:'8px',
                  border:'1px solid rgba(79,195,247,0.25)'}}>
                  입장하기 →
                </div>
              </Link>
            </SlideCard>
          </div>

          <SlideCard delay={300}>
            <Link to="/community" style={{
              background:'linear-gradient(145deg,#1e293b,#1a0d04)',
              border:'1px solid rgba(255,152,0,0.3)',borderRadius:'20px',padding:'26px 30px',
              textDecoration:'none',color:'#fff',display:'flex',alignItems:'center',
              justifyContent:'space-between',gap:'16px',boxShadow:'0 8px 32px rgba(0,0,0,0.3)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'18px'}}>
                <div style={{fontSize:'36px'}}>🤝</div>
                <div>
                  <div style={{fontSize:'16px',fontWeight:800,marginBottom:'4px',letterSpacing:'-0.5px'}}>커뮤니티</div>
                  <div style={{fontSize:'12px',color:'rgba(255,255,255,0.5)'}}>트레이너 구인 · 구직 · 센터 매칭 · 수강생 모집</div>
                </div>
              </div>
              <div style={{display:'inline-block',fontSize:'13px',color:'#ff9800',fontWeight:700,
                background:'rgba(255,152,0,0.1)',padding:'7px 16px',borderRadius:'8px',
                border:'1px solid rgba(255,152,0,0.25)',flexShrink:0}}>
                입장하기 →
              </div>
            </Link>
          </SlideCard>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{background:'#0a0f1a',borderTop:'1px solid #1e293b',padding:'28px 24px',textAlign:'center'}}>
        <div style={{fontSize:'15px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'14px',color:'#94a3b8'}}>
          오<span style={{background:'#c8f135',color:'#111',padding:'0 5px',borderRadius:'4px',marginLeft:'2px',fontSize:'13px'}}>운</span>
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:'24px',marginBottom:'12px'}}>
          <Link to="/trainer" style={{fontSize:'12px',color:'#475569',textDecoration:'none'}}>트레이너 앱</Link>
          <Link to="/member" style={{fontSize:'12px',color:'#475569',textDecoration:'none'}}>회원 포털</Link>
          <Link to="/community" style={{fontSize:'12px',color:'#475569',textDecoration:'none'}}>커뮤니티</Link>
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:'20px',marginBottom:'16px'}}>
          <Link to="/terms" style={{fontSize:'11px',color:'#64748b',textDecoration:'none'}}>이용약관</Link>
          <Link to="/privacy" style={{fontSize:'11px',color:'#64748b',textDecoration:'none'}}>개인정보처리방침</Link>
          <Link to="/refund" style={{fontSize:'11px',color:'#64748b',textDecoration:'none'}}>환불정책</Link>
        </div>
        <div style={{fontSize:'11px',color:'#1e293b',fontFamily:"'DM Mono',monospace"}}>v2.0 · 오운</div>
      </footer>
    </div>
  )
}
