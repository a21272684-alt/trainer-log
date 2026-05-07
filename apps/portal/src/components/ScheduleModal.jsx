import { memo, useState, useEffect } from 'react'
import Modal from '@trainer-log/shared/components/common/Modal'

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
  }, [initialBlock, members])

  function handleSave() {
    if (!blockDate || !blockStart || !blockEnd) { onSave(null, '날짜와 시간을 입력해주세요'); return }
    if (blockStart >= blockEnd) { onSave(null, '종료 시간이 시작보다 늦어야 해요'); return }
    onSave({
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
      <div className="type-row">
        <button className={`type-btn${selType==='lesson'?' active':''}`}   onClick={()=>setSelType('lesson')}>🏋️ 수업</button>
        <button className={`type-btn${selType==='personal'?' active':''}`} onClick={()=>setSelType('personal')}>📌 개인일정</button>
      </div>
      {selType==='lesson' && (
        <div className="form-group"><label>회원</label>
          <select value={blockMemberId} onChange={e=>setBlockMemberId(e.target.value)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}
      {selType==='personal' && (
        <div className="form-group"><label>일정 제목</label>
          <input type="text" value={blockTitle} onChange={e=>setBlockTitle(e.target.value)} placeholder="미팅, 휴식 등" />
        </div>
      )}
      <div className="form-group"><label>날짜</label><input type="date" value={blockDate} onChange={e=>setBlockDate(e.target.value)} /></div>
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
        <button className="btn btn-primary" style={{flex:1}} onClick={handleSave}>저장</button>
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
