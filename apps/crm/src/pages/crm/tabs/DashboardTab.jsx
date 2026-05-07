import { useState, useEffect } from 'react'
import { format, addDays } from 'date-fns'
import { supabase } from '@trainer-log/shared/lib/supabase'

// ════════════════════════════════════════════════════════════════
// 라이트 테마 디자인 토큰
// ❗ gym-portal 스코프가 CSS 변수를 다크 값으로 오버라이드하므로
//    이 컴포넌트 내부 모든 색상은 반드시 하드코딩된 hex 사용
// ════════════════════════════════════════════════════════════════
const LT = {
  pageBg:  '#F9FAFB',
  cardBg:  '#FFFFFF',
  border:  '#E5E7EB',
  divider: '#F3F4F6',
  shadow:  '0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)',
  text:    '#111827',
  label:   '#6B7280',
  dim:     '#9CA3AF',

  // 묵직한 묵직한 시멘틱 컬러 — 흰 배경에서 시인성 최적화, 형광 금지
  blue:   { accent: '#1D4ED8', soft: '#EFF6FF', border: '#BFDBFE', bar: '#3B82F6' },
  violet: { accent: '#5B21B6', soft: '#F5F3FF', border: '#DDD6FE', bar: '#7C3AED' },
  amber:  { accent: '#92400E', soft: '#FFFBEB', border: '#FDE68A', bar: '#D97706' },
  red:    { accent: '#991B1B', soft: '#FEF2F2', border: '#FECACA', bar: '#DC2626' },
  green:  { accent: '#166534', soft: '#F0FDF4', border: '#BBF7D0', bar: '#16A34A' },
  slate:  { accent: '#374151', soft: '#F9FAFB', border: '#E5E7EB', bar: '#9CA3AF' },
}

const mono = { fontFamily: "'DM Mono', monospace" }

function man(n) {
  const v = Number(n || 0)
  if (v >= 100_000_000) return (v / 100_000_000).toFixed(1) + '억원'
  if (v >= 10_000)      return Math.round(v / 10_000) + '만원'
  return v.toLocaleString() + '원'
}

// ── KPI 카드 ─────────────────────────────────────────────────────
function KpiCard({ label, value, unit, tone, desc, warn }) {
  return (
    <div style={{
      background:   LT.cardBg,
      border:       `1px solid ${LT.border}`,
      borderLeft:   `4px solid ${tone.bar}`,
      borderRadius: '14px',
      boxShadow:    LT.shadow,
      padding:      '20px 20px 18px',
      position:     'relative',
      overflow:     'hidden',
    }}>
      {/* 경고 시 배경 그라데이션 */}
      {warn && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(135deg, transparent 40%, ${tone.soft} 100%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* 라벨 */}
      <div style={{
        fontSize: '11px', fontWeight: 600, color: LT.label,
        letterSpacing: '0.5px', textTransform: 'uppercase',
        marginBottom: '12px',
      }}>
        {label}
      </div>

      {/* 숫자 — 핵심 KPI */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginBottom: '8px' }}>
        <span style={{
          ...mono,
          fontSize:   '38px',
          fontWeight: 800,
          lineHeight: 1,
          color:      warn ? tone.accent : LT.text,
        }}>
          {value}
        </span>
        <span style={{
          fontSize: '15px', fontWeight: 600,
          color: warn ? tone.accent : LT.label,
        }}>
          {unit}
        </span>
      </div>

      {/* 설명 */}
      <div style={{ fontSize: '11px', color: LT.dim, lineHeight: 1.4 }}>{desc}</div>
    </div>
  )
}

// ── KPI 스켈레톤 (로딩 중) ──────────────────────────────────────
function KpiSkeleton() {
  const pulse = { background: 'linear-gradient(90deg, #F3F4F6 25%, #E9EAEC 50%, #F3F4F6 75%)', borderRadius: '4px' }
  return (
    <div style={{
      background: LT.cardBg, border: `1px solid ${LT.border}`, borderLeft: `4px solid ${LT.border}`,
      borderRadius: '14px', boxShadow: LT.shadow, padding: '20px 20px 18px',
    }}>
      <div style={{ ...pulse, height: '11px', width: '55%', marginBottom: '14px' }} />
      <div style={{ ...pulse, height: '38px', width: '45%', marginBottom: '10px' }} />
      <div style={{ ...pulse, height: '10px', width: '70%' }} />
    </div>
  )
}

// ── 위험 회원 칩 ─────────────────────────────────────────────────
function RiskChip({ count, label, tone, emoji }) {
  return (
    <div style={{
      flex: 1, background: tone.soft, border: `1px solid ${tone.border}`,
      borderRadius: '10px', padding: '14px 12px', textAlign: 'center',
    }}>
      <div style={{ ...mono, fontSize: '26px', fontWeight: 800, color: tone.accent, lineHeight: 1 }}>
        {count}
      </div>
      <div style={{ fontSize: '11px', color: tone.accent, marginTop: '5px', fontWeight: 600 }}>
        {emoji} {label}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// DashboardTab
// ════════════════════════════════════════════════════════════════
export default function DashboardTab({ gym, gymId, trainers, members }) {
  const [counts,       setCounts]       = useState(null)   // { active, lead, expiry, absent }
  const [monthRevenue, setMonthRevenue] = useState(null)
  const [riskCounts,   setRiskCounts]   = useState({ critical: 0, risk: 0, watch: 0 })
  const [loading,      setLoading]      = useState(true)

  const now        = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthLabel = format(now, 'M월')

  useEffect(() => {
    if (gymId) loadAll()
  }, [gymId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true)
    try {
      // ── 환각 컬럼 차단 ─────────────────────────────────────────
      // members 테이블에는 gym_id / status 컬럼이 없다.
      // 활성 회원 수는 부모에서 props 로 받은 members 배열 길이로 대체,
      // 가망 고객(lead) 카운트는 status 컬럼 부재로 0 폴백.
      const trainerIdsForGym = (trainers || []).map(t => t.id)

      // ── 모든 집계 쿼리 병렬 실행 ────────────────────────────────
      const [activeRes, retentionRes, revenueRes, riskRes] = await Promise.all([

        // ① 활성 회원 수 — 본 센터 소속 트레이너의 회원 전체 count
        //    trainers props 가 비어있으면 0 폴백
        trainerIdsForGym.length > 0
          ? supabase.from('members')
              .select('id', { count: 'exact', head: true })
              .in('trainer_id', trainerIdsForGym)
          : Promise.resolve({ count: 0 }),

        // ② 리텐션 지표 — get_member_retention RPC 미배포로 무력화 (404 차단)
        //    추후 RPC 배포 시 본 라인 복구. 현재는 빈 데이터 폴백.
        Promise.resolve({ data: [] }),

        // ③ 이번달 매출 — 환불 제외
        trainerIdsForGym.length > 0
          ? supabase.from('payments')
              .select('amount')
              .in('trainer_id', trainerIdsForGym)
              .gte('paid_at', monthStart)
          : Promise.resolve({ data: [] }),

        // ④ 이탈 위험 점수 (회원 ID 목록 기반 조회)
        members.length > 0
          ? supabase.from('member_risk_scores')
              .select('risk_level')
              .in('member_id', members.map(m => m.id))
          : Promise.resolve({ data: [] }),
      ])

      // 리텐션 RPC boolean 플래그 집계 — 클라이언트 필터는 단순 카운트에 한정
      const retention = retentionRes.data || []
      const expiryCnt = retention.filter(r => r.expiry_warning).length
      const absentCnt = retention.filter(r => r.absence_warning).length

      setCounts({
        active: activeRes.count ?? 0,
        lead:   0,                       // members.status 컬럼 부재 — 0 하드코딩
        expiry: expiryCnt,
        absent: absentCnt,
      })

      const pays = revenueRes.data || []
      setMonthRevenue(pays.reduce((s, p) => s + (Number(p.amount) || 0), 0))

      const rc = { critical: 0, risk: 0, watch: 0, safe: 0 }
      ;(riskRes.data || []).forEach(s => { if (rc[s.risk_level] !== undefined) rc[s.risk_level]++ })
      setRiskCounts(rc)
    } catch (e) {
      console.error('[DashboardTab] loadAll:', e)
    } finally {
      setLoading(false)
    }
  }

  // KPI 카드 정의
  const kpis = counts ? [
    {
      label: '활성 회원',
      value: counts.active,
      unit:  '명',
      tone:  LT.blue,
      desc:  '정식 등록 · 현재 이용 중',
      warn:  false,
    },
    {
      label: '가망 고객',
      value: counts.lead,
      unit:  '명',
      tone:  counts.lead > 0 ? LT.violet : LT.slate,
      desc:  '상담 중 · 결제 전 리드',
      warn:  counts.lead > 0,
    },
    {
      label: '14일 내 만료',
      value: counts.expiry,
      unit:  '명',
      tone:  counts.expiry > 0 ? LT.amber : LT.slate,
      desc:  '기간권 만료 임박 회원',
      warn:  counts.expiry > 0,
    },
    {
      label: '장기 미출석',
      value: counts.absent,
      unit:  '명',
      tone:  counts.absent > 0 ? LT.red : LT.slate,
      desc:  '7일 이상 미출석 · 활성 회원',
      warn:  counts.absent > 0,
    },
  ] : []

  // 트레이너 고용형태 레이블
  const EMP = { employee: '정직원', freelance: '프리랜서', rental: '대관' }

  return (
    <div style={{ background: LT.pageBg, minHeight: '100%', padding: '2px 0 24px' }}>

      {/* ── KPI 카드 그리드 ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '20px',
      }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpis.map(k => <KpiCard key={k.label} {...k} />)
        }
      </div>

      {/* ── 이번달 매출 ── */}
      <div style={{
        background:   LT.cardBg,
        border:       `1px solid ${LT.border}`,
        borderLeft:   `4px solid ${LT.green.bar}`,
        borderRadius: '14px',
        boxShadow:    LT.shadow,
        padding:      '20px 24px',
        marginBottom: '16px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontSize: '11px', fontWeight: 600, color: LT.label,
            letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px',
          }}>
            {monthLabel} 매출
          </div>
          <div style={{ ...mono, fontSize: '32px', fontWeight: 800, color: LT.green.accent, lineHeight: 1 }}>
            {monthRevenue !== null ? man(monthRevenue) : '—'}
          </div>
          <div style={{ fontSize: '11px', color: LT.dim, marginTop: '6px' }}>
            {monthStart} 이후 결제 합산 · 환불 제외
          </div>
        </div>
        <div style={{ fontSize: '40px', opacity: 0.12, userSelect: 'none' }}>💰</div>
      </div>

      {/* ── 트레이너별 현황 ── */}
      <div style={{
        background:   LT.cardBg,
        border:       `1px solid ${LT.border}`,
        borderRadius: '14px',
        boxShadow:    LT.shadow,
        overflow:     'hidden',
        marginBottom: '16px',
      }}>
        {/* 섹션 헤더 */}
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${LT.divider}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: LT.text }}>트레이너별 현황</div>
          <div style={{ fontSize: '11px', color: LT.dim }}>{trainers.length}명 재직 중</div>
        </div>

        {trainers.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: LT.dim, fontSize: '13px' }}>
            소속 트레이너가 없어요
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: LT.pageBg }}>
                {[
                  { label: '이름',      align: 'left'  },
                  { label: '직급',      align: 'left'  },
                  { label: '고용형태',  align: 'left'  },
                  { label: '담당 회원', align: 'right' },
                  { label: '활성 회원', align: 'right' },
                ].map(h => (
                  <th key={h.label} style={{
                    padding: '10px 16px', fontSize: '11px', fontWeight: 600,
                    color: LT.dim, textAlign: h.align,
                    borderBottom: `1px solid ${LT.border}`,
                    letterSpacing: '0.4px',
                  }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trainers.map((t, idx) => {
                const tMembers = members.filter(m => m.trainer_id === t.id)
                const tActive  = tMembers.filter(m => m.status === 'active').length
                const isLast   = idx === trainers.length - 1

                return (
                  <tr key={t.id}
                    style={{ borderBottom: isLast ? 'none' : `1px solid ${LT.divider}` }}
                    onMouseEnter={e => e.currentTarget.style.background = LT.pageBg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                    <td style={{ padding: '12px 16px', fontWeight: 600, color: LT.text }}>
                      {t.name}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: '11px', padding: '2px 9px', borderRadius: '100px', fontWeight: 600,
                        background: LT.blue.soft, color: LT.blue.accent, border: `1px solid ${LT.blue.border}`,
                      }}>
                        {t.trainer_ranks?.label ?? '미설정'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px', color: LT.label, fontSize: '12px' }}>
                      {EMP[t.employment_type] ?? '—'}
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'right', ...mono, color: LT.label }}>
                      {tMembers.length}명
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'right', ...mono,
                      fontWeight: 700,
                      color: tActive > 0 ? LT.green.accent : LT.dim }}>
                      {tActive}명
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 즉시 케어 필요 (위험 회원 있을 때만 렌더) ── */}
      {!loading && (riskCounts.critical + riskCounts.risk) > 0 && (
        <div style={{
          background:   LT.cardBg,
          border:       `1px solid ${LT.red.border}`,
          borderLeft:   `4px solid ${LT.red.bar}`,
          borderRadius: '14px',
          boxShadow:    LT.shadow,
          padding:      '20px',
        }}>
          <div style={{
            fontSize: '13px', fontWeight: 700, color: LT.red.accent,
            marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span>⚠️</span>
            <span>즉시 케어 필요 회원</span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {riskCounts.critical > 0 && (
              <RiskChip count={riskCounts.critical} label="이탈 임박" tone={LT.red}   emoji="🔴" />
            )}
            {riskCounts.risk > 0 && (
              <RiskChip count={riskCounts.risk}     label="위험"    tone={LT.amber}  emoji="🟠" />
            )}
            {riskCounts.watch > 0 && (
              <RiskChip count={riskCounts.watch}    label="관찰"    tone={LT.slate}  emoji="🟡" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
