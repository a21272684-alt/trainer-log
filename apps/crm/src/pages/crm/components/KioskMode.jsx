import { useState, useEffect, useRef } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'

// ── 태블릿 터치 출석 (전체 화면) ─────────────────────────────────
// 전화번호 뒤 4자리 → (동명이면 선택) → 입장 / 만료 안내 / 정지 중(풀고 입장).
// 나가기 = 직원 PIN 4자리. 판정·기록은 전부 서버 RPC(089) — 화면 조작으로 입장 처리 불가.
// 자동문: 추후 'ok' 응답 시 서버에서 열림 명령을 보내도록 연결 예정 (gym_checkins.door_opened).

const mono = { fontFamily: "'DM Mono', monospace" }
const RESET_MS = { ok: 5000, already: 5000, expired: 8000, notfound: 4000, error: 5000 }
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '<']
const MAX_PIN_FAILS = 5
const PIN_LOCK_MS = 30000

const md = d => (d ? d.slice(5).replace('-', '/') : '')

function Keypad({ onKey, disabled }) {
  return (
    <div className="kiosk-keypad">
      {KEYS.map(k => (
        <button key={k} type="button" disabled={disabled}
          className={`kiosk-key ${k === 'C' || k === '<' ? 'fn' : ''}`}
          aria-label={k === 'C' ? '모두 지우기' : k === '<' ? '한 글자 지우기' : k}
          onClick={() => onKey(k)}>
          {k === 'C' ? '지우기' : k === '<' ? '←' : k}
        </button>
      ))}
    </div>
  )
}

function Dots({ value }) {
  return (
    <div style={{ display: 'flex', gap: '12px' }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={`kiosk-dot ${value[i] ? 'on' : ''}`}>{value[i] ? value[i] : ''}</div>
      ))}
    </div>
  )
}

export default function KioskMode({ gymId, gymName, onExit }) {
  const [screen,  setScreen]  = useState('input')   // input|choose|result|expired|paused|notfound|error|pin
  const [code,    setCode]    = useState('')
  const [cands,   setCands]   = useState([])
  const [result,  setResult]  = useState(null)
  const [busy,    setBusy]    = useState(false)
  const [now,     setNow]     = useState(new Date())
  const [pin,     setPin]     = useState('')
  const [pinMsg,  setPinMsg]  = useState('')
  const pinFails  = useRef(0)
  const pinLockUntil = useRef(0)
  const timer     = useRef(null)

  // 전체 화면 시도 (브라우저가 막으면 그냥 화면 안에서 동작)
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {})
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => {
      clearInterval(t); clearTimeout(timer.current)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  function reset() {
    clearTimeout(timer.current)
    setScreen('input'); setCode(''); setCands([]); setResult(null); setBusy(false)
  }

  function show(next, data) {
    clearTimeout(timer.current)
    setResult(data || null)
    setScreen(next)
    const ms = RESET_MS[next === 'result' ? (data?.status || 'ok') : next]
    if (ms) timer.current = setTimeout(reset, ms)
  }

  function handleRpcResult({ data, error }) {
    setBusy(false)
    if (error) { show('error', { message: error.message }); return }
    if (data.status === 'paused')  { clearTimeout(timer.current); setResult(data); setScreen('paused'); timer.current = setTimeout(reset, 20000); return }
    if (data.status === 'expired') { show('expired', data); return }
    show('result', data)
  }

  async function checkin(memberId) {
    setBusy(true)
    handleRpcResult(await supabase.rpc('crm_kiosk_checkin', { p_gym_id: gymId, p_member_id: memberId }))
  }

  async function lookup(last4) {
    setBusy(true)
    const { data, error } = await supabase.rpc('crm_kiosk_lookup', { p_gym_id: gymId, p_last4: last4 })
    if (error) { setBusy(false); show('error', { message: error.message }); return }
    if (!data?.length) { setBusy(false); show('notfound'); return }
    if (data.length === 1) { checkin(data[0].member_id); return }
    setBusy(false); setCands(data); setScreen('choose')
    timer.current = setTimeout(reset, 20000)
  }

  function onKey(k) {
    if (busy) return
    if (k === 'C') return setCode('')
    if (k === '<') return setCode(c => c.slice(0, -1))
    const next = (code + k).slice(0, 4)
    setCode(next)
    if (next.length === 4) lookup(next)
  }

  async function endPause() {
    setBusy(true)
    handleRpcResult(await supabase.rpc('crm_kiosk_end_pause', { p_gym_id: gymId, p_hold_id: result.hold.id }))
  }

  // ── 직원 PIN ──
  function openPin() { clearTimeout(timer.current); setPin(''); setPinMsg(''); setScreen('pin') }

  async function onPinKey(k) {
    if (busy) return
    if (Date.now() < pinLockUntil.current) {
      setPinMsg(`잠시 후 다시 시도해주세요 (${Math.ceil((pinLockUntil.current - Date.now()) / 1000)}초)`)
      return
    }
    if (k === 'C') return setPin('')
    if (k === '<') return setPin(p => p.slice(0, -1))
    const next = (pin + k).slice(0, 4)
    setPin(next)
    if (next.length < 4) return
    setBusy(true)
    const { data, error } = await supabase.rpc('crm_verify_kiosk_pin', { p_gym_id: gymId, p_pin: next })
    setBusy(false)
    if (!error && data === true) { onExit(); return }
    pinFails.current += 1
    setPin('')
    if (pinFails.current >= MAX_PIN_FAILS) {
      pinFails.current = 0
      pinLockUntil.current = Date.now() + PIN_LOCK_MS
      setPinMsg('PIN 을 여러 번 틀렸어요. 30초 뒤 다시 시도해주세요.')
    } else {
      setPinMsg(`PIN 이 맞지 않아요 (${pinFails.current}/${MAX_PIN_FAILS})`)
    }
  }

  const dateText = now.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short' })
  const timeText = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const r = result

  return (
    <div className="kiosk" role="application" aria-label="터치 출석">
      <div className="kiosk-top">
        <div><span className="kiosk-brand">{gymName}</span><span style={{ fontSize: '15px', color: '#AEB6C2', marginLeft: '10px' }}>출석</span></div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ ...mono, fontSize: '18px', color: '#AEB6C2' }}>{dateText} {timeText}</span>
          <button type="button" className="kiosk-lock" aria-label="출석 화면 나가기 (직원 PIN)" onClick={openPin}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </button>
        </div>
      </div>

      {screen === 'input' && (
        <div className="kiosk-body kiosk-row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '26px', width: '380px' }}>
            <div className="kiosk-title">전화번호<br />뒷 4자리를<br />눌러주세요</div>
            <Dots value={code} />
            <div style={{ fontSize: '15px', color: '#AEB6C2', lineHeight: 1.6 }}>
              {busy ? '확인 중…' : <>회원권 정보가 화면에 잠깐 표시돼요.<br />문의는 안내 데스크로 와주세요.</>}
            </div>
          </div>
          <Keypad onKey={onKey} disabled={busy} />
        </div>
      )}

      {screen === 'choose' && (
        <div className="kiosk-body kiosk-col">
          <div className="kiosk-h2">본인 이름을 눌러주세요</div>
          <div style={{ width: '520px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cands.map(c => (
              <button key={c.member_id} type="button" className="kiosk-cand" disabled={busy}
                onClick={() => checkin(c.member_id)}>{c.masked_name}</button>
            ))}
          </div>
          <button type="button" className="kiosk-btn ghost" onClick={reset}>다시 입력</button>
        </div>
      )}

      {screen === 'result' && r && (
        <div className="kiosk-body kiosk-col">
          <div className="kiosk-badge ok" aria-hidden="true">
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="3"><path d="M5 12l5 5 9-10" /></svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="kiosk-h1">{r.name}님, 반가워요</div>
            <div style={{ fontSize: '18px', color: '#AEB6C2', marginTop: '6px' }}>
              {r.pause_ended ? `회원권 정지를 풀고 입장했어요 · 정지 ${r.paused_days}일 반영`
                : r.status === 'already' ? `오늘 이미 입장했어요 · 첫 입장 ${new Date(r.first_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                : '입장 처리됐어요'}
            </div>
          </div>
          <div className="kiosk-infos">
            <div className="kiosk-info">
              <span className="k-l">회원권</span>
              <span className="k-v">{r.membership?.product_name || '없음'}</span>
              <span style={{ ...mono, fontSize: '14px', color: '#c8f135' }}>
                {r.membership ? `~${r.membership.end_date} · D-${r.membership.days_left}` : 'PT 회원'}
              </span>
            </div>
            <div className="kiosk-info">
              <span className="k-l">PT 잔여</span>
              <span className="k-v" style={mono}>{r.pt_remaining}회</span>
              <span style={{ fontSize: '14px', color: '#AEB6C2' }}>{r.trainer_name ? `담당 ${r.trainer_name}` : ''}</span>
            </div>
            <div className="kiosk-info">
              <span className="k-l">락커</span>
              <span className="k-v" style={mono}>{r.locker ? `${r.locker.number}번` : '없음'}</span>
              <span style={{ ...mono, fontSize: '14px', color: '#AEB6C2' }}>{r.locker ? `~${md(r.locker.end_date)}` : ''}</span>
            </div>
          </div>
          <button type="button" className="kiosk-btn ghost" onClick={reset}>확인</button>
        </div>
      )}

      {screen === 'expired' && r && (
        <div className="kiosk-body kiosk-col" style={{ textAlign: 'center' }}>
          <div className="kiosk-badge bad" aria-hidden="true">!</div>
          <div className="kiosk-h1">회원권이 만료됐어요</div>
          <div style={{ fontSize: '20px', color: '#AEB6C2', lineHeight: 1.6 }}>
            {r.name}님{r.last ? ` · ${r.last.product_name || '회원권'} (~${md(r.last.end_date)} 만료)` : ''}<br />
            재등록은 안내 데스크로 와주세요
          </div>
          <button type="button" className="kiosk-btn ghost" onClick={reset}>확인</button>
        </div>
      )}

      {screen === 'paused' && r && (
        <div className="kiosk-body kiosk-col" style={{ textAlign: 'center' }}>
          <div className="kiosk-badge pause" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8FB0F5" strokeWidth="2.4"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          </div>
          <div className="kiosk-h1">회원권 정지 중이에요</div>
          <div style={{ fontSize: '20px', color: '#AEB6C2' }}>{r.name}님 · 정지 {md(r.hold.start_date)} ~ {md(r.hold.end_date)}</div>
          <button type="button" className="kiosk-btn lime" disabled={busy} onClick={endPause}>
            {busy ? '처리 중…' : '정지 풀고 오늘부터 이용하기'}
          </button>
          <div style={{ fontSize: '15px', color: '#8B93A1', lineHeight: 1.6, maxWidth: '640px' }}>
            {r.hold.elapsed_days > 0
              ? <>누르면 정지가 어제까지로 끝나요. 실제로 쉰 {r.hold.elapsed_days}일만 정지로 남고,<br />회원권 만료일도 그만큼만 늘어난 상태로 바뀌어요.</>
              : <>오늘 시작한 정지라, 누르면 정지가 취소되고 회원권 날짜가 원래대로 돌아가요.</>}
          </div>
          <button type="button" className="kiosk-btn ghost small" onClick={reset}>그냥 돌아가기</button>
        </div>
      )}

      {screen === 'notfound' && (
        <div className="kiosk-body kiosk-col" style={{ textAlign: 'center' }}>
          <div className="kiosk-h1">등록된 번호가 없어요</div>
          <div style={{ fontSize: '20px', color: '#AEB6C2' }}>번호를 다시 확인하거나 안내 데스크로 와주세요</div>
          <button type="button" className="kiosk-btn ghost" onClick={reset}>다시 입력</button>
        </div>
      )}

      {screen === 'error' && (
        <div className="kiosk-body kiosk-col" style={{ textAlign: 'center' }}>
          <div className="kiosk-h1">잠시 문제가 생겼어요</div>
          <div style={{ fontSize: '18px', color: '#AEB6C2' }}>
            {(r?.message || '').includes('CHANGED_SINCE')
              ? '회원권 날짜가 따로 변경된 회원이라 자동으로 정지를 풀 수 없어요. 안내 데스크로 와주세요.'
              : '안내 데스크로 와주세요'}
          </div>
          <button type="button" className="kiosk-btn ghost" onClick={reset}>확인</button>
        </div>
      )}

      {screen === 'pin' && (
        <div className="kiosk-body kiosk-row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', width: '380px' }}>
            <div className="kiosk-title" style={{ fontSize: '34px' }}>직원 PIN 4자리</div>
            <Dots value={pin.replace(/./g, '•')} />
            <div style={{ fontSize: '15px', color: pinMsg ? '#F09A90' : '#8B93A1', minHeight: '24px' }}>
              {pinMsg || 'PIN 이 맞으면 출석 화면을 나가 CRM 으로 돌아가요'}
            </div>
            <button type="button" className="kiosk-btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={reset}>취소</button>
          </div>
          <Keypad onKey={onPinKey} disabled={busy} />
        </div>
      )}
    </div>
  )
}
