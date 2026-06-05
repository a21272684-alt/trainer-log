// MemberAttendanceView.jsx
// 회원이 자기 출결 내역 + 트레이너 출결 정책을 투명하게 확인 + 정책 동의.
// 감정 마찰 완화의 핵심: "트레이너가 깎았다" → "내가 동의한 정책대로 시스템이 기록".
// 설계: 063_attendance_policy.sql
//   - attendance(회원 본인 SELECT, 051 RLS) / attendance_policies(회원 열람 RLS)
//   - members.attendance_policy_agreed_at (회원 본인 update RLS, 050)
//
// props: { member, onAgreed }

import { useState, useEffect } from 'react'
import { supabase } from '@trainer-log/shared/lib/supabase'
import { useToast } from '@trainer-log/shared/components/common/Toast'

const LIME = '#10B981' // 회원앱 톤(그린)에 맞춤

export default function MemberAttendanceView({ member, onAgreed }) {
  const showToast = useToast()
  const [loading, setLoading] = useState(true)
  const [policy, setPolicy] = useState(null)
  const [records, setRecords] = useState([])
  const [agreedAt, setAgreedAt] = useState(member?.attendance_policy_agreed_at || null)
  const [agreeing, setAgreeing] = useState(false)

  useEffect(() => { if (member?.id) load() /* eslint-disable-next-line */ }, [member?.id])

  async function load() {
    setLoading(true)
    try {
      const [{ data: pol }, { data: recs }] = await Promise.all([
        member.trainer_id
          ? supabase.from('attendance_policies').select('*').eq('trainer_id', member.trainer_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('attendance').select('*').eq('member_id', member.id)
          .order('attended_date', { ascending: false }).limit(60),
      ])
      setPolicy(pol || null)
      setRecords(recs || [])
    } catch (e) { console.warn('[MemberAttendanceView]', e.message) }
    setLoading(false)
  }

  async function agree() {
    if (agreeing) return
    setAgreeing(true)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase.from('members').update({ attendance_policy_agreed_at: now }).eq('id', member.id)
      if (error) throw error
      setAgreedAt(now)
      onAgreed && onAgreed(now)
      showToast('✓ 정책을 확인했어요')
    } catch (e) { showToast('처리 실패: ' + e.message) }
    setAgreeing(false)
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>불러오는 중…</div>

  const policyText = policy?.policy_text
    || '담당 트레이너가 아직 출결 정책을 설정하지 않았어요.'
  const noshowCount = records.filter(r => r.status === 'noshow').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 정책 카드 */}
      <div style={{ background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46', marginBottom: 8 }}>📋 출결 정책</div>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: '#166534', whiteSpace: 'pre-wrap', margin: 0 }}>{policyText}</p>

        {policy && (
          agreedAt
            ? <div style={{ marginTop: 12, fontSize: 12, color: '#059669', fontWeight: 600 }}>
                ✓ {new Date(agreedAt).toLocaleDateString('ko-KR')} 에 확인함
              </div>
            : <button onClick={agree} disabled={agreeing}
                style={{ marginTop: 12, width: '100%', padding: 12, borderRadius: 10, border: 'none',
                  background: LIME, color: '#fff', fontSize: 14, fontWeight: 800, cursor: agreeing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: agreeing ? 0.6 : 1 }}>
                위 정책을 확인했어요
              </button>
        )}
      </div>

      {/* 출결 내역 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>내 출결 내역</div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 10 }}>
          최근 기록 · 트레이너와 동일한 내용을 봅니다{noshowCount > 0 ? ` · 노쇼 ${noshowCount}회` : ''}
        </div>
        {records.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '16px 0' }}>아직 출결 기록이 없어요.</div>
        ) : (
          records.map(r => {
            const st = r.status || 'attended'
            const meta = st === 'noshow' ? { label: '노쇼', c: '#dc2626', bg: '#fef2f2' }
              : st === 'cancelled' ? { label: '사전취소', c: '#64748b', bg: '#f1f5f9' }
              : { label: '출석', c: '#059669', bg: '#F0FDF4' }
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#fff', border: '1px solid #f0f0f0', borderRadius: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: '#111' }}>
                  {new Date(r.attended_date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {r.session_deducted && <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>세션 −1</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, color: meta.c, background: meta.bg, padding: '3px 9px', borderRadius: 6 }}>{meta.label}</span>
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
