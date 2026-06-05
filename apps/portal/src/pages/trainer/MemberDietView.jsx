// MemberDietView.jsx
// 트레이너용 회원 식단 조회 (읽기 전용). TrainerApp 회원상세 rtab 'diet'.
// 회원앱(MemberPortal)에서 회원이 기록한 diet_logs 를 트레이너가 열람.
// - 읽기 전용(입력/삭제/AI 없음) → 저유지보수.
// - admin feature gate 'diet_view' 로 무료/유료 제어 (TrainerApp canUse).
// - diet_logs RLS(062)에서 "담당 트레이너" SELECT 허용 → auth 로 조회.
//
// props: { memberId }

import { useState, useEffect } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'

const MEALS = [
  { key: 'breakfast', label: '아침', emoji: '🌅' },
  { key: 'lunch',     label: '점심', emoji: '☀️' },
  { key: 'dinner',    label: '저녁', emoji: '🌙' },
  { key: 'snack',     label: '간식', emoji: '🍪' },
]
const num = v => Number(v) || 0
const kcalOf = r => num(r.calories_per_g) * num(r.amount_g)
const gOf    = (r, k) => num(r[k]) * num(r.amount_g)

export default function MemberDietView({ memberId }) {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])

  useEffect(() => { if (memberId) load() /* eslint-disable-next-line */ }, [memberId])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('diet_logs').select('*')
        .eq('member_id', memberId)
        .order('record_date', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(120)
      if (error) throw error
      setLogs(data || [])
    } catch (e) { console.warn('[MemberDietView]', e.message); setLogs([]) }
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>식단 불러오는 중…</div>
  if (!logs.length) return (
    <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>🥗</div>
      <div style={{ fontSize: 13 }}>회원이 기록한 식단이 아직 없어요.</div>
    </div>
  )

  // 날짜별 그룹 (최신순)
  const byDate = {}
  for (const r of logs) { (byDate[r.record_date] ||= []).push(r) }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>최근 {dates.length}일 · 회원이 직접 기록한 식단 (읽기 전용)</div>
      {dates.map(date => {
        const rows = byDate[date]
        const dayKcal = rows.reduce((s, r) => s + kcalOf(r), 0)
        const dayP = rows.reduce((s, r) => s + gOf(r, 'protein_per_g'), 0)
        const dayC = rows.reduce((s, r) => s + gOf(r, 'carbs_per_g'), 0)
        const dayF = rows.reduce((s, r) => s + gOf(r, 'fat_per_g'), 0)
        return (
          <div key={date} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            {/* 날짜 헤더 + 일일 합계 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmtDate(date)}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>{Math.round(dayKcal).toLocaleString()} kcal</span>
            </div>
            {/* 끼니별 */}
            <div style={{ padding: '6px 14px 12px' }}>
              {MEALS.map(meal => {
                const items = rows.filter(r => r.meal_type === meal.key)
                if (!items.length) return null
                return (
                  <div key={meal.key} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5 }}>{meal.emoji} {meal.label}</div>
                    {items.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                        {r.photo_url && (
                          <img src={r.photo_url} alt="" crossOrigin="anonymous"
                            style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                            {r.food_name} <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{Math.round(num(r.amount_g))}g</span>
                            {r.ai_recognized && <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 4 }}>AI</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(kcalOf(r))} kcal</div>
                      </div>
                    ))}
                  </div>
                )
              })}
              {/* 매크로 요약 */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                <Macro label="단백질" g={dayP} color="#60a5fa" />
                <Macro label="탄수화물" g={dayC} color="#fcd34d" />
                <Macro label="지방" g={dayF} color="#f9a8d4" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Macro({ label, g, color }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '7px 4px' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color }}>{Math.round(g)}g</div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{label}</div>
    </div>
  )
}
function fmtDate(d) {
  try {
    const dt = new Date(d + 'T00:00:00')
    return dt.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
  } catch { return d }
}
