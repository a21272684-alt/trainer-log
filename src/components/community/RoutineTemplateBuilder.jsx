/**
 * RoutineTemplateBuilder.jsx
 * 교육자가 주차별 운동 루틴을 구성하는 빌더 컴포넌트.
 *
 * Props:
 *   weeksData      {Array}    — 외부 state (주차 배열)
 *   onChange       {Function} — (weeksData) => void
 *   durationWeeks  {number}
 *   daysPerWeek    {number}
 *   onMetaChange   {Function} — ({ durationWeeks, daysPerWeek, equipment, goal, level }) => void
 *   goal           {string}
 *   level          {string}
 *   equipment      {Array}
 */

import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  ROUTINE_GOALS, ROUTINE_LEVELS, EQUIPMENT_OPTIONS, DAY_LABELS,
  makeEmptyWeek, makeEmptyDay, makeEmptyExercise, makeEmptySet,
  summarizeWeek,
} from '../../lib/routineTemplates'

// ── 인라인 스타일 토큰 ───────────────────────────────────────
const S = {
  card: {
    background: 'var(--surface2)',
    borderRadius: 12,
    padding: '14px',
    marginBottom: 10,
  },
  label: { fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6, display: 'block' },
  input: {
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text)',
    fontFamily: 'inherit', boxSizing: 'border-box',
  },
  inputSm: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--text)',
    fontFamily: 'inherit',
  },
  btn: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '7px 14px', fontSize: 12, color: 'var(--text)',
    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
  },
  btnGreen: {
    background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)',
    borderRadius: 8, padding: '7px 14px', fontSize: 12, color: '#34d399',
    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
  },
  btnDanger: {
    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#ef4444',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  row: { display: 'flex', gap: 8, alignItems: 'center' },
  divider: { borderTop: '1px solid var(--border)', margin: '12px 0' },
}

// ── 운동 이름 자동완성 훅 ─────────────────────────────────────
function useExerciseSearch() {
  const [results, setResults] = useState([])
  const timer = useRef(null)

  function search(q) {
    clearTimeout(timer.current)
    if (!q.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      const { data } = await supabase.rpc('search_exercises', { query: q, max_results: 8 })
      setResults(data || [])
    }, 200)
  }

  return { results, search, clear: () => setResults([]) }
}

// ── ExerciseRow — 단일 종목 편집 ─────────────────────────────
function ExerciseRow({ ex, onChange, onRemove, order }) {
  const { results, search, clear } = useExerciseSearch()
  const [showAc, setShowAc] = useState(false)

  function updateSet(si, field, val) {
    const newSets = ex.sets.map((s, i) =>
      i === si ? { ...s, [field]: field === 'rest_sec' || field === 'rir' ? (parseInt(val) || 0) : val } : s
    )
    onChange({ ...ex, sets: newSets })
  }

  function addSet() {
    onChange({ ...ex, sets: [...ex.sets, makeEmptySet(ex.sets.length + 1)] })
  }

  function removeSet(si) {
    if (ex.sets.length <= 1) return
    onChange({ ...ex, sets: ex.sets.filter((_, i) => i !== si) })
  }

  return (
    <div style={{ ...S.card, border: '1px solid var(--border)', marginBottom: 8 }}>
      {/* 종목 이름 */}
      <div style={{ ...S.row, marginBottom: 10, position: 'relative' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', width: 22 }}>
          {order}.
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            style={{ ...S.input, paddingRight: 36 }}
            placeholder="종목 이름 (예: 벤치프레스)"
            value={ex.name}
            onChange={e => {
              onChange({ ...ex, name: e.target.value })
              search(e.target.value)
              setShowAc(true)
            }}
            onFocus={() => { if (ex.name) setShowAc(true) }}
            onBlur={() => setTimeout(() => { setShowAc(false); clear() }, 150)}
          />
          {/* 자동완성 드롭다운 */}
          {showAc && results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', overflow: 'hidden',
            }}>
              {results.map(r => (
                <div key={r.id}
                  onMouseDown={() => {
                    onChange({
                      ...ex,
                      name: r.name,
                      primary_muscles: r.primary_muscles,
                    })
                    clear()
                    setShowAc(false)
                  }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                    display: 'flex', gap: 8, alignItems: 'center',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 36 }}>
                    {r.primary_muscles?.[0] || r.category}
                  </span>
                  <span>{r.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>
                    {r.equipment}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button style={S.btnDanger} onClick={onRemove}>✕</button>
      </div>

      {/* 근육 뱃지 */}
      {ex.primary_muscles?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {ex.primary_muscles.map(m => (
            <span key={m} style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 10,
              background: 'rgba(200,241,53,0.12)', color: '#c8f135',
            }}>{m}</span>
          ))}
        </div>
      )}

      {/* 세트 목록 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ color: 'var(--text-dim)' }}>
              {['SET', '횟수', '무게 가이드', '휴식(초)', 'RIR', ''].map(h => (
                <th key={h} style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ex.sets.map((s, si) => (
              <tr key={si}>
                <td style={{ padding: '4px', textAlign: 'center', color: 'var(--text-dim)' }}>{si + 1}</td>
                <td style={{ padding: '4px' }}>
                  <input style={{ ...S.inputSm, width: 60, textAlign: 'center' }}
                    placeholder="8-12"
                    value={s.reps}
                    onChange={e => updateSet(si, 'reps', e.target.value)} />
                </td>
                <td style={{ padding: '4px' }}>
                  <input style={{ ...S.inputSm, width: 90 }}
                    placeholder="1RM 75%"
                    value={s.weight_note}
                    onChange={e => updateSet(si, 'weight_note', e.target.value)} />
                </td>
                <td style={{ padding: '4px' }}>
                  <input style={{ ...S.inputSm, width: 54, textAlign: 'center' }}
                    type="number" min={0} step={15}
                    value={s.rest_sec}
                    onChange={e => updateSet(si, 'rest_sec', e.target.value)} />
                </td>
                <td style={{ padding: '4px' }}>
                  <input style={{ ...S.inputSm, width: 40, textAlign: 'center' }}
                    type="number" min={0} max={5}
                    value={s.rir}
                    onChange={e => updateSet(si, 'rir', e.target.value)} />
                </td>
                <td style={{ padding: '4px', textAlign: 'center' }}>
                  <button style={{ ...S.btnDanger, padding: '2px 7px' }}
                    onClick={() => removeSet(si)}>-</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ ...S.row, marginTop: 8, gap: 8 }}>
        <button style={{ ...S.btnGreen, padding: '4px 12px', fontSize: 11 }} onClick={addSet}>
          + 세트 추가
        </button>
        <input style={{ ...S.inputSm, flex: 1 }}
          placeholder="코칭 노트 (선택) — 그립 너비, 주의사항 등"
          value={ex.notes}
          onChange={e => onChange({ ...ex, notes: e.target.value })} />
      </div>
    </div>
  )
}

// ── DayCard — 요일 카드 ───────────────────────────────────────
function DayCard({ day, onChange, onRemove, dayIdx }) {
  const [collapsed, setCollapsed] = useState(false)

  function updateDay(field, val) {
    onChange({ ...day, [field]: val })
  }

  function addExercise() {
    const newEx = { ...makeEmptyExercise(), order: day.exercises.length + 1 }
    onChange({ ...day, exercises: [...day.exercises, newEx] })
  }

  function updateExercise(ei, updated) {
    onChange({ ...day, exercises: day.exercises.map((e, i) => i === ei ? updated : e) })
  }

  function removeExercise(ei) {
    onChange({ ...day, exercises: day.exercises.filter((_, i) => i !== ei) })
  }

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      marginBottom: 10, overflow: 'hidden',
    }}>
      {/* 요일 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        background: 'var(--surface2)', cursor: 'pointer',
      }} onClick={() => setCollapsed(v => !v)}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'rgba(52,211,153,0.2)', color: '#34d399',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, flexShrink: 0,
        }}>
          {dayIdx + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 1 }}>
            {day.label || `Day ${dayIdx + 1}`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {day.exercises.length}종목 · {day.estimated_min}분 예상
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{collapsed ? '▶' : '▼'}</span>
        <button style={{ ...S.btnDanger, padding: '3px 9px' }}
          onClick={e => { e.stopPropagation(); onRemove() }}>삭제</button>
      </div>

      {!collapsed && (
        <div style={{ padding: '14px' }}>
          {/* 요일 메타 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <label style={S.label}>요일 라벨</label>
              <select style={S.input}
                value={day.label}
                onChange={e => updateDay('label', e.target.value)}>
                {DAY_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                <option value={day.label}>{day.label}</option>
              </select>
            </div>
            <div>
              <label style={S.label}>예상 시간 (분)</label>
              <input type="number" min={10} max={180} step={5}
                style={S.input}
                value={day.estimated_min}
                onChange={e => updateDay('estimated_min', parseInt(e.target.value) || 60)} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>포커스 근육 (선택)</label>
            <input style={S.input} placeholder="예: 가슴·어깨·삼두"
              value={day.focus}
              onChange={e => updateDay('focus', e.target.value)} />
          </div>

          {/* 운동 목록 */}
          {day.exercises.map((ex, ei) => (
            <ExerciseRow key={ei} ex={ex} order={ei + 1}
              onChange={updated => updateExercise(ei, updated)}
              onRemove={() => removeExercise(ei)} />
          ))}

          <button style={S.btnGreen} onClick={addExercise}>
            + 종목 추가
          </button>

          <div style={S.divider} />
          <div>
            <label style={S.label}>요일 코칭 노트 (선택)</label>
            <textarea rows={2} style={{ ...S.input, resize: 'vertical' }}
              placeholder="예: 웜업 10분 필수 · 마지막 세트 drop set 권장"
              value={day.day_notes}
              onChange={e => updateDay('day_notes', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────
export default function RoutineTemplateBuilder({
  weeksData,
  onChange,
  durationWeeks,
  daysPerWeek,
  goal,
  level,
  equipment,
  onMetaChange,
}) {
  const [activeWeek, setActiveWeek] = useState(0)

  // 주차 추가
  function addWeek() {
    const newWeeks = [...weeksData, makeEmptyWeek(weeksData.length + 1)]
    onChange(newWeeks)
    onMetaChange({ durationWeeks: newWeeks.length })
    setActiveWeek(newWeeks.length - 1)
  }

  // 주차 삭제
  function removeWeek(wi) {
    if (weeksData.length <= 1) return
    const newWeeks = weeksData.filter((_, i) => i !== wi)
      .map((w, i) => ({ ...w, week: i + 1 }))
    onChange(newWeeks)
    onMetaChange({ durationWeeks: newWeeks.length })
    setActiveWeek(Math.min(wi, newWeeks.length - 1))
  }

  // 요일 추가
  function addDay(wi) {
    const week = weeksData[wi]
    const newDay = makeEmptyDay(week.days.length + 1, DAY_LABELS[week.days.length % DAY_LABELS.length])
    const newWeeks = weeksData.map((w, i) =>
      i === wi ? { ...w, days: [...w.days, newDay] } : w
    )
    onChange(newWeeks)
  }

  // 요일 수정
  function updateDay(wi, di, updated) {
    const newWeeks = weeksData.map((w, i) =>
      i === wi ? { ...w, days: w.days.map((d, j) => j === di ? updated : d) } : w
    )
    onChange(newWeeks)
  }

  // 요일 삭제
  function removeDay(wi, di) {
    const newWeeks = weeksData.map((w, i) =>
      i === wi ? { ...w, days: w.days.filter((_, j) => j !== di) } : w
    )
    onChange(newWeeks)
  }

  const currentWeek = weeksData[activeWeek]

  return (
    <div>
      {/* ── 메타 설정 ── */}
      <div style={{ ...S.card, marginBottom: 16, border: '1px solid rgba(52,211,153,0.2)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: '0.08em', marginBottom: 12 }}>
          ⚙️ 프로그램 설정
        </div>

        {/* 목표 */}
        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>목표</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ROUTINE_GOALS.map(g => (
              <button key={g.key}
                style={{
                  padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  border: goal === g.key ? `1.5px solid ${g.color}` : '1px solid var(--border)',
                  background: goal === g.key ? g.color + '20' : 'var(--surface2)',
                  color: goal === g.key ? g.color : 'var(--text-muted)',
                }}
                onClick={() => onMetaChange({ goal: g.key })}>
                {g.emoji} {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* 레벨 */}
        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>대상 레벨</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {ROUTINE_LEVELS.map(l => (
              <button key={l.key}
                style={{
                  flex: 1, padding: '8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                  border: level === l.key ? '1.5px solid #34d399' : '1px solid var(--border)',
                  background: level === l.key ? 'rgba(52,211,153,0.15)' : 'var(--surface2)',
                  color: level === l.key ? '#34d399' : 'var(--text-muted)',
                }}
                onClick={() => onMetaChange({ level: l.key })}>
                <div style={{ fontSize: 16 }}>{l.emoji}</div>
                <div>{l.label}</div>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 1 }}>{l.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 필요 장비 */}
        <div>
          <label style={S.label}>필요 장비</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {EQUIPMENT_OPTIONS.map(eq => {
              const selected = equipment.includes(eq)
              return (
                <button key={eq}
                  style={{
                    padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                    border: selected ? '1.5px solid #4fc3f7' : '1px solid var(--border)',
                    background: selected ? 'rgba(79,195,247,0.15)' : 'var(--surface2)',
                    color: selected ? '#4fc3f7' : 'var(--text-muted)',
                  }}
                  onClick={() => {
                    const next = selected
                      ? equipment.filter(e => e !== eq)
                      : [...equipment, eq]
                    onMetaChange({ equipment: next })
                  }}>
                  {eq}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 주차 탭 ── */}
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 8 }}>
        📅 주차별 운동 구성
      </div>

      {/* 주차 탭 바 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
        {weeksData.map((w, wi) => (
          <button key={wi}
            style={{
              padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
              border: activeWeek === wi ? '1.5px solid #34d399' : '1px solid var(--border)',
              background: activeWeek === wi ? 'rgba(52,211,153,0.15)' : 'var(--surface2)',
              color: activeWeek === wi ? '#34d399' : 'var(--text-muted)',
            }}
            onClick={() => setActiveWeek(wi)}>
            {w.label || `${wi + 1}주차`}
            <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>
              ({w.days?.length || 0}일)
            </span>
          </button>
        ))}
        <button style={{ ...S.btnGreen, flexShrink: 0, padding: '7px 14px' }} onClick={addWeek}>
          + 주차
        </button>
      </div>

      {/* 현재 주차 편집 */}
      {currentWeek && (
        <div>
          {/* 주차 라벨 편집 */}
          <div style={{ ...S.row, marginBottom: 12 }}>
            <input style={{ ...S.input, flex: 1, fontSize: 14, fontWeight: 700 }}
              placeholder={`${activeWeek + 1}주차 이름 (예: 기초 적응기)`}
              value={currentWeek.label}
              onChange={e => {
                const newWeeks = weeksData.map((w, i) =>
                  i === activeWeek ? { ...w, label: e.target.value } : w
                )
                onChange(newWeeks)
              }} />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
              {summarizeWeek(currentWeek)}
            </div>
            {weeksData.length > 1 && (
              <button style={{ ...S.btnDanger }} onClick={() => removeWeek(activeWeek)}>
                삭제
              </button>
            )}
          </div>

          {/* 요일 카드 */}
          {currentWeek.days.map((day, di) => (
            <DayCard key={di} day={day} dayIdx={di}
              onChange={updated => updateDay(activeWeek, di, updated)}
              onRemove={() => removeDay(activeWeek, di)} />
          ))}

          {currentWeek.days.length < 7 && (
            <button style={{ ...S.btnGreen, width: '100%', padding: '10px' }}
              onClick={() => addDay(activeWeek)}>
              + 요일 추가 ({currentWeek.days.length}/{daysPerWeek}일 목표)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
