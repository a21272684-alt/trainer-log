import { memo, useState, useEffect } from 'react'
import Modal from '@trainer-log/shared/components/common/Modal'

const REP_DAYS = ['월','화','수','목','금','토','일']  // 0=월 … 6=일

// 반복 스케쥴 미리보기/생성용 날짜 계산 (이번 주 월요일 기준, 지난 날짜 skip).
// TrainerApp 의 실제 생성 로직과 동일해야 함 (base = 실제 이번 주, weekOff 미적용).
function repeatDates(weekdays, unit, count) {
  const wds = [...weekdays].sort((a, b) => a - b)
  if (!wds.length || !count) return []
  const mon = new Date(); mon.setHours(0, 0, 0, 0)
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7))   // 이번 주 월요일
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const out = []
  if (unit === 'weeks') {
    for (let w = 0; w < count; w++) for (const wd of wds) {
      const d = new Date(mon); d.setDate(mon.getDate() + wd + w * 7)
      if (d >= today) out.push(d)
    }
  } else { // 'count' — 미래로 정확히 count 개
    for (let w = 0; w < 120 && out.length < count; w++) for (const wd of wds) {
      const d = new Date(mon); d.setDate(mon.getDate() + wd + w * 7)
      if (d >= today) { out.push(d); if (out.length >= count) break }
    }
  }
  return out
}

/**
 * ScheduleModal — 시간표 블록 추가/수정 모달.
 *
 * TrainerApp.jsx 가 7,000+ 줄짜리 단일 컴포넌트라 모달 input 키 입력마다
 * 부모 전체가 re-render → 시간표 그리드 / 회원 목록 전부 재계산되면서
 * 입력 응답성이 크게 떨어짐. 모달의 form state 를 모달 컴포넌트 내부로
 * 옮겨 부모와 격리. 부모는 open/initialBlock/콜백만 prop 으로 전달.
 *
 * - open=false 일 때는 Modal 이 null 반환 → 자식 트리 자체가 마운트 안 됨
 * - open 으로 켜질 때 + initialBlock 변경 시 useEffect 로 form state 리셋
 * - React.memo 로 부모 re-render 시 props 동일하면 skip
 *
 * onSave / onDelete / onCancelLesson 은 부모에서 useCallback 으로
 * stable reference 를 넘겨야 memo 가 효과를 봄.
 */
function ScheduleModal({
  open,
  initialBlock,    // null 이면 add 모드, { id, ... } 면 edit 모드
  members,
  colors,
  onClose,
  onSave,
  onSaveMany,
  onDelete,
  onCancelLesson,
}) {
  const isEdit = !!initialBlock?.id

  const [blockDate,     setBlockDate]     = useState('')
  const [blockStart,    setBlockStart]    = useState('09:00')
  const [blockEnd,      setBlockEnd]      = useState('10:00')
  const [blockMemo,     setBlockMemo]     = useState('')
  const [blockTitle,    setBlockTitle]    = useState('')
  const [blockMemberId, setBlockMemberId] = useState('')
  const [selType,       setSelType]       = useState('lesson')
  const [selColor,      setSelColor]      = useState('green')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelType,     setCancelType]     = useState('')
  const [cancelDetail,   setCancelDetail]   = useState('')
  // U-011: 저장 중 중복 클릭 방지
  const [saving, setSaving] = useState(false)

  // 반복(여러 회) 추가 모드 state — 추가 모드에서만 사용
  const [addMode, setAddMode] = useState('single')   // 'single' | 'repeat'
  const [repDays, setRepDays] = useState(() => new Set())  // 요일 idx(0=월..6=일)
  const [repUnit, setRepUnit] = useState('count')    // 'count'(총 회차) | 'weeks'(N주)
  const [repN,    setRepN]    = useState(12)

  // initialBlock 변경(=모달 새로 열기 / 다른 block 편집 진입) 시 form 리셋
  useEffect(() => {
    if (!initialBlock) return
    setBlockDate    (initialBlock.date     || '')
    setBlockStart   (initialBlock.start    || '09:00')
    setBlockEnd     (initialBlock.end      || '10:00')
    setBlockMemo    (initialBlock.memo     || '')
    setBlockTitle   (initialBlock.title    || '')
    setBlockMemberId(initialBlock.memberId || (members[0]?.id ?? ''))
    setSelType      (initialBlock.type     || 'lesson')
    setSelColor     (initialBlock.color    || 'green')
    setShowCancelForm(false)
    setCancelType('')
    setCancelDetail('')
    // 반복 모드 초기화 (모달 새로 열 때마다 단일 모드로 시작)
    setAddMode('single')
    setRepDays(new Set())
    setRepUnit('count')
    setRepN(12)
  }, [initialBlock, members])

  async function handleSave() {
    if (saving) return  // U-011: 중복 클릭 방지
    if (!blockDate || !blockStart || !blockEnd) { onSave(null, '날짜와 시간을 입력해주세요'); return }
    if (blockStart >= blockEnd) { onSave(null, '종료 시간이 시작보다 늦어야 해요'); return }
    setSaving(true)
    try {
      await onSave({
        id:       initialBlock?.id,
        date:     blockDate,
        start:    blockStart,
        end:      blockEnd,
        type:     selType,
        color:    selColor,
        memo:     blockMemo.trim(),
        memberId: selType === 'lesson'   ? blockMemberId       : null,
        title:    selType === 'personal' ? blockTitle.trim()   : null,
      })
    } finally {
      setSaving(false)
    }
  }

  // 반복(여러 회) 저장 — spec 을 부모(onSaveMany)로 넘기면 부모가 실제 세션들 생성
  async function handleSaveRepeat() {
    if (saving) return
    if (!blockMemberId)            { onSave(null, '회원을 선택해주세요'); return }
    if (!repDays.size)             { onSave(null, '요일을 하나 이상 선택해주세요'); return }
    if (!blockStart || !blockEnd)  { onSave(null, '시간을 입력해주세요'); return }
    if (blockStart >= blockEnd)    { onSave(null, '종료 시간이 시작보다 늦어야 해요'); return }
    if (!repN || repN < 1)         { onSave(null, '반복 수를 확인해주세요'); return }
    const dates = repeatDates(repDays, repUnit, repN)
    if (!dates.length)             { onSave(null, '추가할 세션이 없어요 (요일/기간 확인)'); return }
    setSaving(true)
    try {
      await onSaveMany({
        memberId: blockMemberId,
        weekdays: [...repDays].sort((a, b) => a - b),
        start:    blockStart,
        end:      blockEnd,
        color:    selColor,
        memo:     blockMemo.trim(),
        unit:     repUnit,
        count:    repN,
      })
    } finally {
      setSaving(false)
    }
  }

  function handleToggleCancel() {
    if (showCancelForm) {
      if (!cancelType) { onSave(null, '취소 사유를 선택해주세요'); return }
      onCancelLesson(initialBlock.id, cancelType, cancelDetail)
    } else {
      setShowCancelForm(true)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '스케쥴 수정' : '스케쥴 추가'} maxWidth="360px">
      {/* 추가 모드에서만: 단일 / 반복(여러 회) 토글 */}
      {!isEdit && (
        <div className="type-row" style={{marginBottom:'10px'}}>
          <button className={`type-btn${addMode==='single'?' active':''}`} onClick={()=>setAddMode('single')}>➕ 단일</button>
          <button className={`type-btn${addMode==='repeat'?' active':''}`} onClick={()=>setAddMode('repeat')}>🔁 반복(여러 회)</button>
        </div>
      )}
      {addMode==='single' && (
        <div className="type-row">
          <button className={`type-btn${selType==='lesson'?' active':''}`}   onClick={()=>setSelType('lesson')}>🏋️ 수업</button>
          <button className={`type-btn${selType==='personal'?' active':''}`} onClick={()=>setSelType('personal')}>📌 개인일정</button>
        </div>
      )}
      {((addMode==='single' && selType==='lesson') || addMode==='repeat') && (
        <div className="form-group"><label>회원</label>
          <select value={blockMemberId} onChange={e=>setBlockMemberId(e.target.value)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}
      {addMode==='single' && selType==='personal' && (
        <div className="form-group"><label>일정 제목</label>
          <input type="text" value={blockTitle} onChange={e=>setBlockTitle(e.target.value)} placeholder="미팅, 휴식 등" />
        </div>
      )}
      {addMode==='single' && (
        <div className="form-group"><label>날짜</label><input type="date" value={blockDate} onChange={e=>setBlockDate(e.target.value)} /></div>
      )}
      {addMode==='repeat' && (
        <>
          <div className="form-group"><label>요일 <span style={{color:'var(--text-dim)',fontWeight:400}}>(여러 개 선택)</span></label>
            <div style={{display:'flex',gap:'5px'}}>
              {REP_DAYS.map((d,i)=>{ const on=repDays.has(i); return (
                <button key={i} type="button"
                  onClick={()=>setRepDays(prev=>{ const s=new Set(prev); s.has(i)?s.delete(i):s.add(i); return s })}
                  style={{flex:1,padding:'9px 0',borderRadius:'8px',fontFamily:'inherit',fontWeight:800,fontSize:'13px',cursor:'pointer',
                    background:on?'var(--accent)':'var(--surface2)',color:on?'#141414':'var(--text-muted)',
                    border:`1px solid ${on?'var(--accent)':'var(--border)'}`}}>{d}</button>
              )})}
            </div>
          </div>
          <div className="form-group">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'7px'}}>
              <label style={{margin:0}}>반복 기간</label>
              <div style={{display:'flex',gap:'4px'}}>
                {[['count','회차'],['weeks','주']].map(([u,l])=>{ const on=repUnit===u; return (
                  <button key={u} type="button" onClick={()=>setRepUnit(u)}
                    style={{padding:'5px 11px',borderRadius:'7px',fontFamily:'inherit',fontWeight:700,fontSize:'12px',cursor:'pointer',
                      background:on?'var(--accent)':'var(--surface2)',color:on?'#141414':'var(--text-muted)',
                      border:`1px solid ${on?'var(--accent)':'var(--border)'}`}}>{l} 단위</button>
                )})}
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <button type="button" onClick={()=>setRepN(v=>Math.max(1,v-1))} style={{width:'36px',height:'36px',borderRadius:'8px',border:'1px solid var(--border)',background:'var(--surface2)',color:'inherit',fontSize:'18px',fontWeight:700,cursor:'pointer',flexShrink:0}}>−</button>
              <div style={{fontSize:'20px',fontWeight:900,minWidth:'54px',textAlign:'center'}}>{repN}<span style={{fontSize:'12px',color:'var(--text-muted)',marginLeft:'2px'}}>{repUnit==='weeks'?'주':'회'}</span></div>
              <button type="button" onClick={()=>setRepN(v=>Math.min(60,v+1))} style={{width:'36px',height:'36px',borderRadius:'8px',border:'1px solid var(--border)',background:'var(--surface2)',color:'inherit',fontSize:'18px',fontWeight:700,cursor:'pointer',flexShrink:0}}>+</button>
              <span style={{fontSize:'11px',color:'var(--text-dim)'}}>{repUnit==='weeks'?'이번 주부터':'총 세션 수'}</span>
            </div>
          </div>
        </>
      )}
      <div className="form-group"><label>시간</label>
        <div className="time-row">
          <input type="time" value={blockStart} onChange={e=>setBlockStart(e.target.value)} step="300" />
          <span>~</span>
          <input type="time" value={blockEnd}   onChange={e=>setBlockEnd(e.target.value)}   step="300" />
        </div>
      </div>
      <div className="form-group"><label>메모 (선택)</label>
        <input type="text" value={blockMemo} onChange={e=>setBlockMemo(e.target.value)} placeholder="특이사항" />
      </div>
      <div className="form-group"><label>색상</label>
        <div className="color-row">
          {colors.map(c => (
            <div key={c.id} className={`color-btn${selColor===c.id?' sel':''}`}
                 style={{background:c.bg}} onClick={()=>setSelColor(c.id)} />
          ))}
        </div>
      </div>
      {addMode==='repeat' && (() => {
        const dates = repeatDates(repDays, repUnit, repN)
        const dayNames = [...repDays].sort((a,b)=>a-b).map(i=>REP_DAYS[i]).join('·')
        return (
          <div style={{background:'rgba(200,241,53,0.08)',border:'1px solid rgba(200,241,53,0.25)',borderRadius:'10px',padding:'11px 12px',marginBottom:'12px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'8px',marginBottom:dates.length?'7px':0}}>
              <span style={{fontSize:'12px',color:'var(--text-muted)'}}>
                {repDays.size ? (repUnit==='weeks' ? `매주 ${dayNames} · ${repN}주` : `${dayNames} · 총 ${repN}회`) : '요일을 선택하세요'}
              </span>
              <span style={{fontSize:'14px',fontWeight:900,color:'var(--accent)',whiteSpace:'nowrap'}}>{dates.length}개</span>
            </div>
            {dates.length>0 && (
              <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
                {dates.slice(0,6).map((d,i)=>(
                  <span key={i} style={{fontSize:'10px',fontFamily:'monospace',background:'var(--surface2)',border:'1px solid var(--border)',color:'var(--text-muted)',borderRadius:'5px',padding:'2px 6px'}}>{d.getMonth()+1}/{d.getDate()}({REP_DAYS[(d.getDay()+6)%7]})</span>
                ))}
                {dates.length>6 && <span style={{fontSize:'10px',color:'var(--text-dim)',alignSelf:'center'}}>＋{dates.length-6}</span>}
              </div>
            )}
          </div>
        )
      })()}
      {showCancelForm && (
        <div>
          <div style={{height:'1px',background:'var(--border)',margin:'12px 0'}}></div>
          <div className="form-group">
            <label style={{color:'var(--danger)'}}>취소 사유</label>
            <select value={cancelType} onChange={e=>setCancelType(e.target.value)}>
              <option value="">사유 선택</option>
              <option value="회원 개인 사정">회원 개인 사정</option>
              <option value="회원 질병/부상">회원 질병/부상</option>
              <option value="트레이너 사정">트레이너 사정</option>
              <option value="시설 문제">시설 문제</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div className="form-group">
            <label style={{color:'var(--danger)'}}>취소 상세 내용 (선택)</label>
            <textarea value={cancelDetail} onChange={e=>setCancelDetail(e.target.value)}
                      placeholder="취소 사유를 자세히 적어주세요" rows={2} style={{minHeight:'60px'}} />
          </div>
        </div>
      )}
      <div style={{display:'flex',gap:'8px'}}>
        <button className="btn btn-primary" style={{flex:1, opacity: saving ? 0.55 : 1, cursor: saving ? 'not-allowed' : 'pointer'}}
                disabled={saving || (addMode==='repeat' && repeatDates(repDays, repUnit, repN).length===0)}
                onClick={addMode==='repeat' ? handleSaveRepeat : handleSave}>
          {saving ? '저장 중…' : (addMode==='repeat' ? `${repeatDates(repDays, repUnit, repN).length}개 세션 추가` : '저장')}
        </button>
        {isEdit && (
          <button className="btn btn-ghost btn-sm" onClick={handleToggleCancel}
                  style={{color:'var(--danger)',borderColor:'rgba(255,92,92,0.3)',
                          background:showCancelForm?'rgba(255,92,92,0.1)':'none'}}>
            {showCancelForm ? '취소 확정' : '취소 처리'}
          </button>
        )}
        {isEdit && !showCancelForm && (
          <button className="btn btn-ghost btn-sm"
                  style={{color:'var(--danger)',borderColor:'rgba(255,92,92,0.3)'}}
                  onClick={() => onDelete(initialBlock.id)}>삭제</button>
        )}
      </div>
    </Modal>
  )
}

export default memo(ScheduleModal)
