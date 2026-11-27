// 트레이너 앱 — 회원 목록 화면 (TrainerApp 에서 떼어냄).
// 검색어 · 필터 · 정렬은 다른 화면에 다녀와도 남도록 TrainerApp 이 들고 있고, 여기선 받아서 그리기만 한다.
import { useState } from 'react'
import Icon from '../../components/Icon'
import { getRiskLevel } from '@trainer-log/shared/lib/churnRisk'

export default function MemberList({
  trainer, members, logs, riskMap, todayAttendSet, canUse,
  memberSearch, setMemberSearch, memberFilter, setMemberFilter, memberSort, setMemberSort,
  onOpenReadModal, onAddMember, goAddMember, openRecord, quickToggleToday, openEditMember,
}) {
  const [showRiskInfo, setShowRiskInfo] = useState(false)
  return (
      <div className="page-t">
        {/* 제목 줄 — 회원 수 | 일지 확인 현황 · 회원 추가 */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
          <div style={{display:'flex',alignItems:'baseline',gap:'6px'}}>
            <span style={{fontSize:'22px',fontWeight:900,letterSpacing:'-0.6px'}}>회원</span>
            <span style={{fontSize:'15px',fontWeight:700,color:'var(--text-muted)'}}>{members.length}명</span>
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button
              onClick={onOpenReadModal}
              aria-label="일지 확인 현황"
              style={{position:'relative',width:'44px',height:'44px',border:'1px solid #E6E8E0',borderRadius:'14px',
                background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text)'}}
            >
              <Icon name="eye" size={20} />
              {(() => {
                const unread = logs.filter(l => !l.read_at).length
                return unread > 0 ? (
                  <span style={{position:'absolute',top:'-6px',right:'-6px',minWidth:'20px',height:'20px',padding:'0 5px',
                    boxSizing:'border-box',borderRadius:'10px',background:'#DC2626',color:'#fff',fontSize:'11px',fontWeight:800,
                    display:'flex',alignItems:'center',justifyContent:'center'}}>{unread}</span>
                ) : null
              })()}
            </button>
            <button className="btn btn-primary" style={{height:'44px',padding:'0 16px',borderRadius:'14px',fontSize:'14px',fontWeight:800,
              display:'flex',alignItems:'center',gap:'6px'}} onClick={onAddMember}><Icon name="plus" size={16} strokeWidth={2.6} />회원 추가</button>
          </div>
        </div>

        {/* ── 웰컴 체크리스트 (콜드스타트 first-run 가이드) ──
            "아직 회원이 없어요" 빈 화면을 대체. 회원·일지가 모두 생기면 자동으로 사라짐.
            단계는 실제 데이터(회원/일지/열람 여부)로 자동 판정. */}
        {(members.length === 0 || logs.length === 0) && (() => {
          const hasMember = members.length > 0
          const hasLog    = logs.length > 0
          const hasRead   = logs.some(l => l.read_at)
          const steps = [
            { done: hasMember, now: !hasMember,             t: '첫 회원 추가하기',      s: '이름·연락처만 있으면 30초' },
            { done: hasLog,    now: hasMember && !hasLog,   t: '첫 수업일지 작성·발송', s: '녹음 올리면 AI가 일지를 완성해요' },
            { done: hasRead,   now: false,                  t: '회원이 리포트 확인',    s: '회원 앱에서 바로 열람 (앱 설치 불필요)' },
          ]
          const doneCount = steps.filter(s => s.done).length
          const btnStyle = { marginTop:'8px', padding:'8px 16px', borderRadius:'9px', border:'none',
            background:'var(--accent)', color:'#0f0f0f', fontSize:'12px', fontWeight:800, cursor:'pointer', fontFamily:'inherit' }
          return (
            <div style={{background:'var(--surface)', border:'1px solid var(--accent)',
              borderRadius:'14px', padding:'16px 16px 8px', marginBottom:'12px'}}>
              <div style={{fontSize:'15px',fontWeight:800,color:'var(--text)',letterSpacing:'-0.3px'}}>
                환영해요, {trainer?.name || ''} 트레이너님
              </div>
              <div style={{fontSize:'12px',color:'var(--text-muted)',marginTop:'3px'}}>
                3분이면 첫 회원에게 리포트를 보낼 수 있어요.
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',fontWeight:600,color:'var(--text-dim)',margin:'13px 0 5px'}}>
                <span>시작 준비</span><span>{doneCount} / 3 완료</span>
              </div>
              <div style={{height:'5px',borderRadius:'3px',background:'var(--surface2)',overflow:'hidden',marginBottom:'4px'}}>
                <div style={{height:'100%',width:`${(doneCount/3)*100}%`,background:'var(--accent)',borderRadius:'3px',transition:'width .3s'}}/>
              </div>
              {steps.map((st,i) => (
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'10px 0',
                  borderTop: i===0 ? 'none' : '1px solid var(--border)'}}>
                  <div style={{width:'20px',height:'20px',borderRadius:'50%',flexShrink:0,marginTop:'1px',
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:800,
                    background: st.done ? 'var(--accent)' : st.now ? 'var(--text)' : 'var(--surface2)',
                    color:      st.done ? '#0f0f0f'      : st.now ? 'var(--surface)' : 'var(--text-dim)',
                    boxShadow:  st.now ? '0 0 0 3px rgba(200,241,53,0.3)' : 'none'}}>
                    {st.done ? '✓' : i+1}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'13px',fontWeight:700,
                      color: st.done ? 'var(--text-dim)' : 'var(--text)',
                      textDecoration: st.done ? 'line-through' : 'none'}}>{st.t}</div>
                    <div style={{fontSize:'11px',color:'var(--text-dim)',marginTop:'1px'}}>{st.s}</div>
                    {st.now && i===0 && (
                      <button style={btnStyle} onClick={goAddMember}>지금 첫 회원 추가하기</button>
                    )}
                    {st.now && i===1 && (
                      <button style={btnStyle} onClick={()=> members[0] && openRecord(members[0].id)}>
                        첫 수업일지 쓰기 →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {members.length > 0 && (() => {
          // 상태 계산
          function getStatus(m) {
            // members.suspended 컬럼 부재 — 잔여 세션 기반으로만 분기
            const r = m.total_sessions - m.done_sessions
            if (r <= 0) return 'expired'
            if (r <= 3) return 'expiring'
            return 'active'
          }
          // 필터 + 정렬
          const searchQ = memberSearch.trim().toLowerCase()
          const filtered = [...members].filter(m => {
            // 이름 검색
            if (searchQ && !m.name.toLowerCase().includes(searchQ)) return false
            // 상태 필터
            const s = getStatus(m)
            if (memberFilter === '전체') return true
            if (memberFilter === '활성') return s === 'active' || s === 'expiring'
            if (memberFilter === '만료') return s === 'expired'
            if (memberFilter === '이탈위험') {
              const rs = riskMap[m.id]
              return rs && (rs.riskLevel === 'risk' || rs.riskLevel === 'critical')
            }
            return true
          }).sort((a,b) => {
            if (memberSort === 'name')   return a.name.localeCompare(b.name, 'ko')
            if (memberSort === 'expire') return (a.total_sessions-a.done_sessions) - (b.total_sessions-b.done_sessions)
            if (memberSort === 'risk')   return (riskMap[b.id]?.riskScore ?? 0) - (riskMap[a.id]?.riskScore ?? 0)
            // 기본(created) 정렬: 이탈 위험도 critical/risk를 최상단 고정 후 등록일 내림차순
            const RISK_ORDER = { critical:0, risk:1, watch:2, safe:3 }
            const aOrd = RISK_ORDER[riskMap[a.id]?.riskLevel ?? 'safe'] ?? 3
            const bOrd = RISK_ORDER[riskMap[b.id]?.riskLevel ?? 'safe'] ?? 3
            if (aOrd !== bOrd) return aOrd - bOrd
            return new Date(b.created_at) - new Date(a.created_at)
          })
          return (
            <>
              {/* 이름 검색 */}
              <div style={{position:'relative',marginBottom:'10px'}}>
                <span style={{position:'absolute',left:'14px',top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)',display:'flex',pointerEvents:'none'}}><Icon name="search" size={18} /></span>
                <input
                  type="text"
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="회원 이름 검색"
                  aria-label="회원 이름 검색"
                  style={{width:'100%',height:'48px',padding:'0 40px 0 42px',borderRadius:'14px',border:'1px solid #E6E8E0',background:'#fff',color:'var(--text)',fontSize:'15px',fontFamily:'inherit',boxSizing:'border-box',outline:'none'}}
                />
                {memberSearch && (
                  <button aria-label="검색어 지우기" onClick={() => setMemberSearch('')}
                    style={{position:'absolute',right:'4px',top:'50%',transform:'translateY(-50%)',width:'40px',height:'40px',background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>

              {/* 상태 필터 — 한 줄 칩 (선택 = 잉크) */}
              <div style={{display:'flex',gap:'6px',marginBottom:'10px',overflowX:'auto',scrollbarWidth:'none'}}>
                {['전체','활성','만료','정지'].map(f => (
                  <button key={f} onClick={()=>setMemberFilter(f)}
                    style={{flexShrink:0,height:'36px',padding:'0 14px',borderRadius:'999px',fontSize:'13px',cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',
                      border: memberFilter===f ? 'none' : '1px solid #E6E8E0',
                      background: memberFilter===f ? '#111827' : '#fff',
                      color: memberFilter===f ? '#fff' : '#374151',
                      fontWeight: memberFilter===f ? 700 : 600}}>
                    {f}
                  </button>
                ))}
                {canUse('risk_analysis') && Object.keys(riskMap).length > 0 && (() => {
                  const riskCount = members.filter(m => {
                    const rs = riskMap[m.id]
                    return rs && (rs.riskLevel === 'risk' || rs.riskLevel === 'critical')
                  }).length
                  const on = memberFilter==='이탈위험'
                  return (
                    <button onClick={()=>setMemberFilter('이탈위험')}
                      style={{flexShrink:0,height:'36px',padding:'0 12px',borderRadius:'999px',fontSize:'13px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',
                        display:'flex',alignItems:'center',gap:'5px',
                        border: on ? 'none' : '1px solid #FECDD3',
                        background: on ? '#BE123C' : '#FFF1F2',
                        color: on ? '#fff' : '#BE123C'}}>
                      <span style={{width:'7px',height:'7px',borderRadius:'50%',background: on ? '#fff' : '#E11D48'}} />
                      이탈위험{riskCount > 0 ? ` ${riskCount}` : ''}
                    </button>
                  )
                })()}
              </div>

              {/* 이탈위험이란? 설명 */}
              {memberFilter === '이탈위험' && (
                <div style={{marginBottom:'10px'}}>
                  <button onClick={() => setShowRiskInfo(v => !v)}
                    style={{display:'flex',alignItems:'center',gap:'5px',background:'none',border:'none',padding:'6px 0',cursor:'pointer',fontFamily:'inherit',fontSize:'13px',color:'#BE123C',fontWeight:700}}>
                    <Icon name="info" size={15} /> 이탈위험이란?
                    <Icon name={showRiskInfo ? 'chevronUp' : 'chevronDown'} size={14} />
                  </button>
                  {showRiskInfo && (
                    <div style={{marginTop:'6px',background:'#fff',border:'1px solid #FECDD3',borderRadius:'16px',padding:'14px',fontSize:'13px',lineHeight:1.65}}>
                      <div style={{fontWeight:800,color:'var(--text)',marginBottom:'10px'}}>이탈위험 판단 기준</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',marginBottom:'12px'}}>
                        {[
                          ['안전','0~29점','#ECFCCB','#3F6212'],
                          ['관찰','30~49점','#FEF3C7','#92400E'],
                          ['위험','50~74점','#FFEDD5','#9A3412'],
                          ['이탈 임박','75~100점','#FEE2E2','#991B1B'],
                        ].map(([label, range, bg, fg]) => (
                          <div key={label} style={{background:bg,borderRadius:'10px',padding:'8px 10px'}}>
                            <div style={{fontWeight:800,color:fg,fontSize:'13px'}}>{label}</div>
                            <div style={{color:fg,fontSize:'12px',marginTop:'1px',opacity:0.85}}>{range}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{fontWeight:700,color:'var(--text)',marginBottom:'6px'}}>3가지 신호로 0~100점 계산</div>
                      <div style={{color:'var(--text-muted)',fontSize:'12px'}}>
                        <b style={{color:'var(--text)'}}>출석 (0~40점)</b> — 마지막 출석 7·14·21일 경과, 최근 2주 출석 0회, 출석 빈도 절반 이상 감소<br/>
                        <b style={{color:'var(--text)'}}>건강기록 (0~30점)</b> — 최근 2주 체중·수면 기록 없음, 기록 빈도 감소, 수면 품질 낮음<br/>
                        <b style={{color:'var(--text)'}}>수업 평점 (0~30점)</b> — 최근 3회 평점 낮음, 이전보다 평점 급락
                      </div>
                      <div style={{fontSize:'12px',color:'var(--text-muted)',marginTop:'8px'}}>위험(50점 이상)·이탈 임박(75점 이상) 회원이 필터에 표시돼요.</div>
                    </div>
                  )}
                </div>
              )}

              {/* 정렬 — 드롭다운 하나 */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
                <span style={{fontSize:'12px',color:'var(--text-muted)'}}>
                  {memberSort === 'created' ? '이탈위험 회원을 맨 위에 보여줘요' : filtered.length + '명'}
                </span>
                <label style={{position:'relative',display:'flex',alignItems:'center',margin:0,fontSize:'13px',fontWeight:700,color:'#374151'}}>
                  <select value={memberSort} onChange={e=>setMemberSort(e.target.value)} aria-label="정렬"
                    style={{appearance:'none',WebkitAppearance:'none',border:'none',background:'transparent',width:'auto',padding:'6px 22px 6px 8px',fontSize:'13px',fontWeight:700,color:'#374151',fontFamily:'inherit',cursor:'pointer',boxShadow:'none'}}>
                    <option value="created">등록일순</option>
                    <option value="name">이름순</option>
                    <option value="expire">만료예정순</option>
                    <option value="risk">위험도순</option>
                  </select>
                  <span style={{position:'absolute',right:0,pointerEvents:'none',display:'flex'}}><Icon name="chevronDown" size={16} /></span>
                </label>
              </div>
              {!filtered.length && (
                <div className="empty">
                  <p>{searchQ ? `"${memberSearch}" 검색 결과가 없어요` : '해당하는 회원이 없어요'}</p>
                </div>
              )}
              {filtered.map(m => {
                const status     = getStatus(m)
                const remain     = m.total_sessions - m.done_sessions
                const pct        = m.total_sessions > 0 ? Math.round((m.done_sessions / m.total_sessions) * 100) : 0
                const low        = remain <= 3
                const riskResult = riskMap[m.id]
                const showRisk   = riskResult && riskResult.riskLevel !== 'safe'
                const riskLv     = riskResult ? getRiskLevel(riskResult.riskScore) : null
                const isAttendedToday = todayAttendSet.has(m.id)
                const ST = { active:['활성','#ECFCCB','#3F6212'], expiring:['만료예정','#FEF3C7','#92400E'], expired:['만료','#FEE2E2','#991B1B'] }[status]
                return (
                  <div key={m.id} onClick={() => openRecord(m.id)}
                    style={{background:'#fff',borderRadius:'20px',padding:'16px',marginBottom:'10px',cursor:'pointer',
                      boxShadow:'0 1px 2px rgba(17,24,39,0.04), 0 6px 20px rgba(17,24,39,0.04)',display:'flex',flexDirection:'column',gap:'12px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                      <div style={{width:'44px',height:'44px',borderRadius:'50%',flexShrink:0,background:'#F2F3EF',color:'#111827',
                        display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:'16px'}}>
                        {m.name[0]}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'16px',fontWeight:800,letterSpacing:'-0.3px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.name}</div>
                        <div style={{display:'flex',gap:'6px',marginTop:'4px',flexWrap:'wrap'}}>
                          <span style={{padding:'2px 8px',borderRadius:'999px',background:ST[1],color:ST[2],fontSize:'12px',fontWeight:700}}>{ST[0]}</span>
                          {showRisk && riskLv && (
                            <span style={{padding:'2px 8px',borderRadius:'999px',background:'#FFF1F2',color:'#BE123C',fontSize:'12px',fontWeight:700}}>{riskLv.label}</span>
                          )}
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontSize:'26px',fontWeight:900,lineHeight:1,letterSpacing:'-0.5px',fontVariantNumeric:'tabular-nums',color: low ? '#DC2626' : 'var(--text)'}}>{remain}</div>
                        <div style={{fontSize:'12px',color:'var(--text-muted)',marginTop:'4px'}}>/ {m.total_sessions}회</div>
                      </div>
                    </div>
                    <div style={{height:'6px',borderRadius:'3px',background:'#EEF0EA',overflow:'hidden'}}>
                      <div style={{height:'100%',width:pct+'%',borderRadius:'3px',background: low ? '#DC2626' : '#84CC16'}} />
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr) 44px',gap:'8px'}}>
                      <button onClick={e => quickToggleToday(e, m.id)}
                        style={{height:'44px',borderRadius:'12px',fontSize:'14px',fontWeight:isAttendedToday?800:700,cursor:'pointer',fontFamily:'inherit',
                          display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',
                          border: isAttendedToday ? 'none' : '1px solid #E6E8E0',
                          background: isAttendedToday ? '#ECFCCB' : '#fff',
                          color: isAttendedToday ? '#3F6212' : 'var(--text)'}}>
                        <Icon name={isAttendedToday ? 'check' : 'calendarCheck'} size={17} strokeWidth={isAttendedToday ? 2.6 : 2} />
                        {isAttendedToday ? '출석 완료' : '출석 체크'}
                      </button>
                      <button onClick={e => { e.stopPropagation(); openRecord(m.id) }}
                        style={{height:'44px',borderRadius:'12px',border:'none',background:'#111827',color:'#fff',fontSize:'14px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',
                          display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                        <Icon name="file" size={17} color="#C8F135" />일지 쓰기
                      </button>
                      <button aria-label="회원 정보 수정" onClick={e => { e.stopPropagation(); openEditMember(m) }}
                        style={{height:'44px',borderRadius:'12px',border:'1px solid #E6E8E0',background:'#fff',cursor:'pointer',color:'#374151',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <Icon name="pencil" size={17} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </>
          )
        })()}
        {/* 회원 0명 빈 상태는 위 웰컴 체크리스트가 대체 */}
      </div>
  )
}
