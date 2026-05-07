/**
 * ApplyRoutineModal.jsx
 * 트레이너가 구매한 루틴 템플릿을 회원에게 적용하는 모달.
 *
 * Props:
 *   templateData  {Object}   — get_routine_template() 결과
 *   post          {Object}   — community_posts row
 *   trainerId     {string}   — trainers.id
 *   members       {Array}    — [{ id, name, ... }]
 *   initialWeek   {number}   — 기본 선택 주차
 *   onApplied     {Function} — (routineId, memberId) => void
 *   onClose       {Function}
 */

import { useState } from 'react'
import { applyRoutineToMember, getGoalMeta, getLevelMeta } from '../../lib/routineTemplates'
import { useToast } from '../common/Toast'

export default function ApplyRoutineModal({
  templateData,
  post,
  trainerId,
  members = [],
  initialWeek = 1,
  onApplied,
  onClose,
}) {
  const showToast   = useToast()
  const [memberId,   setMemberId]   = useState('')
  const [weekNumber, setWeekNumber] = useState(initialWeek)
  const [applying,   setApplying]   = useState(false)
  const [done,       setDone]       = useState(null)  // { routineId }

  const weeks = templateData?.weeks_data || []
  const goalMeta  = getGoalMeta(templateData?.goal)
  const levelMeta = getLevelMeta(templateData?.level)

  async function handleApply() {
    if (!memberId) return showToast('회원을 선택해주세요')
    if (!trainerId) return showToast('트레이너 정보가 없습니다')

    setApplying(true)
    try {
      const result = await applyRoutineToMember({
        templateId: templateData.id,
        trainerId,
        memberId,
        weekNumber,
      })
      setDone({ routineId: result.routine_id })
      showToast('✅ 루틴이 회원에게 적용됐어요!')
      onApplied?.(result.routine_id, memberId)
    } catch (e) {
      showToast(e.message || '적용 중 오류가 발생했습니다')
    }
    setApplying(false)
  }

  const selectedMember = members.find(m => m.id === memberId)
  const selectedWeek   = weeks.find(w => w.week === weekNumber)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 env(safe-area-inset-bottom)',
      }}
      onClick={e => e.target === e.currentTarget && !applying && onClose()}>

      <div style={{
        background: 'var(--surface)',
        borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 560,
        maxHeight: '85vh', overflowY: 'auto',
        padding: '24px 20px 32px',
      }}>
        {/* 핸들 */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'var(--border)', margin: '0 auto 20px',
        }} />

        {done ? (
          /* ── 완료 화면 ── */
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              루틴이 적용됐어요!
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 6 }}>
              <strong style={{ color: 'var(--text)' }}>{selectedMember?.name}</strong> 회원의
              루틴 목록에 추가됐습니다.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24 }}>
              트레이너 앱 → 해당 회원 → 루틴 탭에서 확인하세요
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '12px 36px', borderRadius: 10, border: 'none',
                background: '#34d399', color: '#0a0a0a',
                fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              확인
            </button>
          </div>
        ) : (
          /* ── 선택 화면 ── */
          <>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
              루틴 적용하기
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20 }}>
              구매한 루틴을 회원의 루틴 목록에 추가합니다
            </div>

            {/* 상품 요약 */}
            <div style={{
              background: 'rgba(52,211,153,0.06)',
              border: '1px solid rgba(52,211,153,0.2)',
              borderRadius: 10, padding: '12px 14px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                {post?.title}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {templateData?.goal && (
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                    background: goalMeta.color + '20', color: goalMeta.color,
                  }}>
                    {goalMeta.emoji} {goalMeta.label}
                  </span>
                )}
                {templateData?.level && (
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10,
                    background: 'var(--surface2)', color: 'var(--text-muted)',
                  }}>
                    {levelMeta.emoji} {levelMeta.label}
                  </span>
                )}
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 10,
                  background: 'var(--surface2)', color: 'var(--text-muted)',
                }}>
                  📅 {templateData?.duration_weeks}주 프로그램
                </span>
              </div>
            </div>

            {/* 회원 선택 */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
                display: 'block', marginBottom: 6,
              }}>
                적용할 회원 선택 <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              {members.length === 0 ? (
                <div style={{
                  padding: '12px', background: 'var(--surface2)', borderRadius: 8,
                  fontSize: 12, color: 'var(--text-dim)', textAlign: 'center',
                }}>
                  등록된 회원이 없습니다
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {members.map(m => (
                    <div key={m.id}
                      onClick={() => setMemberId(m.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        border: memberId === m.id
                          ? '1.5px solid #34d399'
                          : '1px solid var(--border)',
                        background: memberId === m.id
                          ? 'rgba(52,211,153,0.08)'
                          : 'var(--surface2)',
                        transition: 'all 0.12s',
                      }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--comm)', color: '#0a0a0a',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 800, flexShrink: 0,
                      }}>
                        {m.name?.[0] || '?'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                        {m.goal && (
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                            목표: {m.goal}
                          </div>
                        )}
                      </div>
                      {memberId === m.id && (
                        <span style={{ color: '#34d399', fontSize: 16, fontWeight: 800 }}>✓</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 주차 선택 */}
            {weeks.length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
                  display: 'block', marginBottom: 6,
                }}>
                  적용할 주차
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {weeks.map(w => (
                    <button key={w.week}
                      onClick={() => setWeekNumber(w.week)}
                      style={{
                        padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                        border: weekNumber === w.week ? '1.5px solid #34d399' : '1px solid var(--border)',
                        background: weekNumber === w.week ? 'rgba(52,211,153,0.15)' : 'var(--surface2)',
                        color: weekNumber === w.week ? '#34d399' : 'var(--text-muted)',
                      }}>
                      {w.label || `${w.week}주차`}
                    </button>
                  ))}
                </div>
                {selectedWeek && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                    선택된 주차: {selectedWeek.label} — {selectedWeek.days?.length || 0}일
                  </div>
                )}
              </div>
            )}

            {/* 안내 */}
            <div style={{
              padding: '10px 12px', background: 'rgba(200,241,53,0.06)',
              border: '1px solid rgba(200,241,53,0.15)',
              borderRadius: 8, fontSize: 11, color: 'var(--text-dim)',
              lineHeight: 1.6, marginBottom: 20,
            }}>
              💡 적용하면 회원의 <strong style={{ color: 'var(--text)' }}>루틴 목록</strong>에
              자동으로 추가됩니다. 트레이너 앱에서 세트·무게를 조정하세요.
            </div>

            {/* 버튼 */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onClose}
                disabled={applying}
                style={{
                  flex: 1, padding: '13px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface2)',
                  color: 'var(--text-muted)', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                취소
              </button>
              <button
                onClick={handleApply}
                disabled={applying || !memberId}
                style={{
                  flex: 2, padding: '13px', borderRadius: 10, border: 'none',
                  background: memberId ? '#34d399' : 'var(--surface2)',
                  color: memberId ? '#0a0a0a' : 'var(--text-dim)',
                  fontWeight: 800, fontSize: 14,
                  cursor: memberId ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  opacity: applying ? 0.7 : 1,
                }}>
                {applying ? '적용 중...' : '🏋️ 적용하기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
