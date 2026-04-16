/**
 * RoutineTemplateViewer.jsx
 * 구매한 트레이너 / 교육자가 루틴 템플릿을 주차별로 열람하는 컴포넌트.
 *
 * Props:
 *   templateData  {Object}  — get_routine_template() RPC 결과
 *                             { goal, level, duration_weeks, days_per_week,
 *                               equipment, weeks_data, preview_day, has_access, apply_count }
 *   post          {Object}  — community_posts row (title, price)
 *   isOwner       {boolean} — 판매자 본인 여부
 *   canApply      {boolean} — 트레이너 역할 여부 (적용 버튼 표시)
 *   onApply       {Function}— (weekNum) => void  — 적용 버튼 클릭 콜백
 */

import { useState } from 'react'
import { getGoalMeta, getLevelMeta, summarizeWeek } from '../../lib/routineTemplates'

const MUSCLE_COLORS = {
  가슴: '#4fc3f7', 등: '#c8f135', 어깨: '#ff9800', 이두: '#34d399',
  삼두: '#a78bfa', 하체: '#f97316', 코어: '#e040fb', 유산소: '#22c55e',
}

function MuscleTag({ name }) {
  const color = MUSCLE_COLORS[name] || '#888'
  return (
    <span style={{
      fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
      background: color + '20', color, border: `1px solid ${color}40`,
    }}>{name}</span>
  )
}

function SetRow({ s, idx }) {
  return (
    <tr>
      <td style={{ padding: '5px 6px', textAlign: 'center', fontSize: 11,
        color: 'var(--text-dim)', fontWeight: 700 }}>{idx + 1}</td>
      <td style={{ padding: '5px 6px', fontSize: 12, fontWeight: 600 }}>
        {s.reps || '—'}
      </td>
      <td style={{ padding: '5px 6px', fontSize: 11, color: 'var(--text-muted)' }}>
        {s.weight_note || '—'}
      </td>
      <td style={{ padding: '5px 6px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        {s.rest_sec ? `${s.rest_sec}s` : '—'}
      </td>
      <td style={{ padding: '5px 6px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        {s.rir != null ? `RIR ${s.rir}` : '—'}
      </td>
    </tr>
  )
}

function ExerciseCard({ ex, order }) {
  const [open, setOpen] = useState(order === 1)

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      marginBottom: 8, overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', cursor: 'pointer',
          background: open ? 'var(--surface2)' : 'transparent',
        }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(200,241,53,0.15)', color: '#c8f135',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800,
        }}>{order}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{ex.name}</div>
          {ex.primary_muscles?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
              {ex.primary_muscles.map(m => <MuscleTag key={m} name={m} />)}
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'right', flexShrink: 0 }}>
          {ex.sets?.length || 0}세트
          <span style={{ marginLeft: 6 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                  {['SET', '횟수', '무게 가이드', '휴식', 'RIR'].map(h => (
                    <th key={h} style={{ padding: '3px 6px', textAlign: h === 'SET' || h === '휴식' || h === 'RIR' ? 'center' : 'left', fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ex.sets?.map((s, si) => <SetRow key={si} s={s} idx={si} />)}
              </tbody>
            </table>
          </div>
          {ex.notes && (
            <div style={{
              marginTop: 8, padding: '8px 10px',
              background: 'rgba(200,241,53,0.06)', borderRadius: 6,
              fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
              borderLeft: '3px solid rgba(200,241,53,0.4)',
            }}>
              💡 {ex.notes}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DaySection({ day, dayIdx }) {
  const [open, setOpen] = useState(dayIdx === 0)

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      marginBottom: 10, overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '13px 14px', cursor: 'pointer',
          background: open ? 'rgba(52,211,153,0.06)' : 'var(--surface2)',
        }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(52,211,153,0.2)', color: '#34d399',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800,
        }}>
          {dayIdx + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{day.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            {day.focus && <span style={{ color: '#34d399' }}>{day.focus} · </span>}
            {day.exercises?.length || 0}종목
            {day.estimated_min ? ` · 약 ${day.estimated_min}분` : ''}
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '14px' }}>
          {day.exercises?.map((ex, ei) => (
            <ExerciseCard key={ei} ex={ex} order={ei + 1} />
          ))}
          {day.day_notes && (
            <div style={{
              marginTop: 10, padding: '10px 12px',
              background: 'rgba(79,195,247,0.06)', borderRadius: 8,
              fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7,
              borderLeft: '3px solid rgba(79,195,247,0.4)',
            }}>
              📋 {day.day_notes}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function RoutineTemplateViewer({ templateData, post, isOwner, canApply, onApply }) {
  const [activeWeek, setActiveWeek] = useState(0)

  if (!templateData) return null

  const {
    goal, level, duration_weeks, days_per_week,
    equipment, weeks_data, preview_day, has_access, apply_count,
  } = templateData

  const goalMeta  = getGoalMeta(goal)
  const levelMeta = getLevelMeta(level)
  const weeks     = weeks_data || []
  const currentWeek = weeks[activeWeek]

  return (
    <div>
      {/* ── 프로그램 요약 배너 ── */}
      <div style={{
        background: 'rgba(52,211,153,0.06)',
        border: '1px solid rgba(52,211,153,0.2)',
        borderRadius: 12, padding: '14px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {goal && (
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 700,
              background: goalMeta.color + '20', color: goalMeta.color,
            }}>
              {goalMeta.emoji} {goalMeta.label}
            </span>
          )}
          {level && (
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 700,
              background: 'var(--surface2)', color: 'var(--text-muted)',
            }}>
              {levelMeta.emoji} {levelMeta.label}
            </span>
          )}
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12,
            background: 'var(--surface2)', color: 'var(--text-muted)' }}>
            📅 {duration_weeks}주 · 주 {days_per_week}일
          </span>
          {apply_count > 0 && (
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12,
              background: 'rgba(200,241,53,0.12)', color: '#c8f135', marginLeft: 'auto' }}>
              🏋️ {apply_count}회 적용됨
            </span>
          )}
        </div>

        {equipment?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 2 }}>필요 장비:</span>
            {equipment.map(eq => (
              <span key={eq} style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(79,195,247,0.1)', color: '#4fc3f7',
              }}>{eq}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── 미구매 — 잠금 배너 ── */}
      {!has_access && (
        <div style={{
          background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 12, padding: '20px', textAlign: 'center', marginBottom: 16,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            구매 후 전체 주차별 운동 프로그램을 열람할 수 있습니다
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            아래 미리보기에서 1일차 운동 구성을 확인해보세요
          </div>
        </div>
      )}

      {/* ── 미리보기 (미구매 시) ── */}
      {!has_access && preview_day?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: '0.06em' }}>
            👁 미리보기 — Day 1 일부
          </div>
          {preview_day.slice(0, 3).map((ex, ei) => (
            <div key={ei} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', background: 'var(--surface2)',
              borderRadius: 8, marginBottom: 6,
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(200,241,53,0.15)', color: '#c8f135',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, flexShrink: 0,
              }}>{ei + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{ex.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>
                {ex.sets?.length || 0}세트
              </span>
            </div>
          ))}
          {preview_day.length > 3 && (
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', padding: '6px 0' }}>
              ... 외 {preview_day.length - 3}종목 더
            </div>
          )}
        </div>
      )}

      {/* ── 전체 주차 뷰어 (구매 후) ── */}
      {has_access && weeks.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: '0.06em', marginBottom: 8 }}>
            📋 전체 프로그램
          </div>

          {/* 주차 탭 */}
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto',
            marginBottom: 14, paddingBottom: 4,
          }}>
            {weeks.map((w, wi) => (
              <button key={wi}
                onClick={() => setActiveWeek(wi)}
                style={{
                  padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
                  border: activeWeek === wi ? '1.5px solid #34d399' : '1px solid var(--border)',
                  background: activeWeek === wi ? 'rgba(52,211,153,0.15)' : 'var(--surface2)',
                  color: activeWeek === wi ? '#34d399' : 'var(--text-muted)',
                }}>
                {w.label || `${wi + 1}주차`}
                <div style={{ fontSize: 9, opacity: 0.7, marginTop: 1 }}>
                  {summarizeWeek(w)}
                </div>
              </button>
            ))}
          </div>

          {/* 현재 주차 내용 */}
          {currentWeek?.days?.map((day, di) => (
            <DaySection key={di} day={day} dayIdx={di} />
          ))}

          {/* 적용 버튼 (트레이너만) */}
          {canApply && (
            <button
              onClick={() => onApply?.(currentWeek?.week || activeWeek + 1)}
              style={{
                width: '100%', marginTop: 8,
                padding: '13px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #34d399, #22c55e)',
                color: '#0a0a0a', fontWeight: 800, fontSize: 14,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              🏋️ {currentWeek?.label || `${activeWeek + 1}주차`} 회원에게 적용하기
            </button>
          )}

          {isOwner && (
            <div style={{
              marginTop: 10, padding: '10px 14px',
              background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)',
              borderRadius: 8, fontSize: 11, color: '#a78bfa', textAlign: 'center',
            }}>
              📦 본인 상품 — 구매자가 이 프로그램을 열람할 수 있습니다
            </div>
          )}
        </div>
      )}
    </div>
  )
}
