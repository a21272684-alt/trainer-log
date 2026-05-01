import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useToast } from './Toast'

const mono = { fontFamily: "'DM Mono', monospace" }

const EMPTY_FORM = { label: '', base_salary: '', default_incentive_rate: '', sort_order: '' }

export default function GymRankManager({ gymId, onChanged }) {
  const showToast = useToast()
  const [ranks,    setRanks]    = useState([])
  const [editing,  setEditing]  = useState(null)   // id or 'new'
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [noTable,  setNoTable]  = useState(false)

  useEffect(() => { if (gymId) load() }, [gymId])

  async function load() {
    const { data, error } = await supabase
      .from('gym_ranks').select('*')
      .eq('gym_id', gymId).order('sort_order').order('created_at')

    // 테이블 미존재 감지
    if (error) {
      if (
        error.code === '42P01' ||                       // PostgreSQL: undefined table
        error.message?.includes('gym_ranks') ||
        error.message?.includes('does not exist')
      ) {
        setNoTable(true)
      } else {
        showToast('직급 목록 로드 오류: ' + error.message)
      }
      setRanks([])
      return
    }

    setNoTable(false)
    setRanks(data || [])
  }

  function startNew() {
    setForm({ ...EMPTY_FORM, sort_order: String(ranks.length + 1) })
    setEditing('new')
  }

  function startEdit(r) {
    setForm({
      label:                  r.label,
      base_salary:            String(r.base_salary),
      default_incentive_rate: String(Math.round(r.default_incentive_rate * 100)),
      sort_order:             String(r.sort_order),
    })
    setEditing(r.id)
  }

  function cancel() { setEditing(null); setForm(EMPTY_FORM) }

  async function handleSave() {
    if (!form.label.trim()) { showToast('직급 명칭을 입력하세요'); return }
    setSaving(true)
    const payload = {
      gym_id:                 gymId,
      label:                  form.label.trim(),
      base_salary:            Number(form.base_salary) || 0,
      default_incentive_rate: (Number(form.default_incentive_rate) || 10) / 100,
      sort_order:             Number(form.sort_order) || 0,
    }

    let error
    if (editing === 'new') {
      ;({ error } = await supabase.from('gym_ranks').insert(payload))
    } else {
      ;({ error } = await supabase.from('gym_ranks').update(payload).eq('id', editing))
    }
    setSaving(false)

    if (error) {
      // 중복 이름 → 친절한 메시지
      if (error.code === '23505' || error.message?.includes('unique')) {
        showToast('⚠️ 이미 같은 이름의 직급이 있어요')
      } else if (error.code === '42P01' || error.message?.includes('does not exist')) {
        setNoTable(true)
      } else {
        showToast('오류: ' + error.message)
      }
      return
    }

    showToast(editing === 'new' ? '✓ 직급 추가됨' : '✓ 직급 수정됨')
    cancel()
    await load()
    onChanged?.()
  }

  async function handleDelete(id) {
    if (!confirm('이 직급을 삭제할까요? 해당 직급을 사용 중인 트레이너는 직급이 해제됩니다.')) return
    setDeleting(id)
    const { error } = await supabase.from('gym_ranks').delete().eq('id', id)
    setDeleting(null)
    if (error) { showToast('삭제 오류: ' + error.message); return }
    showToast('✓ 직급 삭제됨')
    await load()
    onChanged?.()
  }

  // ── 테이블 미존재 안내 ────────────────────────────────────────
  if (noTable) {
    return (
      <div className="card">
        <div className="card-title" style={{ marginBottom: '14px' }}>직급 관리</div>
        <div style={{
          background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.25)',
          borderRadius: '10px', padding: '16px',
        }}>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '13px' }}>
            gym_ranks 테이블이 없어요
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '14px' }}>
            Supabase 대시보드 → SQL Editor에서 아래 SQL을 실행한 뒤<br />
            [다시 확인] 버튼을 눌러주세요.
          </div>
          <pre style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '12px', fontSize: '11px',
            color: 'var(--text-muted)', overflowX: 'auto', lineHeight: 1.65,
            whiteSpace: 'pre-wrap', marginBottom: '12px',
          }}>
{`CREATE TABLE IF NOT EXISTS gym_ranks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                 UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  label                  TEXT NOT NULL,
  base_salary            INTEGER NOT NULL DEFAULT 0,
  default_incentive_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (gym_id, label)
);
ALTER TABLE gym_ranks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gym_ranks_all" ON gym_ranks USING (true) WITH CHECK (true);

-- trainers 에 직급 컬럼 추가
ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS gym_rank_id UUID REFERENCES gym_ranks(id) ON DELETE SET NULL;`}
          </pre>
          <button className="btn btn-primary" style={{ fontSize: '11px' }} onClick={load}>
            🔄 다시 확인
          </button>
        </div>
      </div>
    )
  }

  // ── 정상 UI ─────────────────────────────────────────────────
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div className="card-title" style={{ marginBottom: 0 }}>직급 관리</div>
        {editing === null && (
          <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: '11px' }} onClick={startNew}>
            + 직급 추가
          </button>
        )}
      </div>

      {ranks.length === 0 && editing !== 'new' && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: '12px' }}>
          이 센터에 등록된 직급이 없어요.<br />직급을 추가하면 트레이너에게 배정할 수 있어요.
        </div>
      )}

      {/* 직급 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {ranks.map(r => (
          <div key={r.id}>
            {editing === r.id ? (
              <RankForm form={form} setForm={setForm} onSave={handleSave} onCancel={cancel} saving={saving} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface2)', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', ...mono, minWidth: '20px' }}>#{r.sort_order}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{r.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                    기본급 <span style={{ ...mono, color: 'var(--accent)' }}>{Number(r.base_salary).toLocaleString()}원</span>
                    {' · '}
                    인센티브 <span style={{ ...mono, color: 'var(--blue)' }}>{Math.round(r.default_incentive_rate * 100)}%</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '10px' }}
                    onClick={() => startEdit(r)}>편집</button>
                  <button className="btn btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '10px', color: 'var(--red)', borderColor: 'rgba(248,113,113,0.3)' }}
                    onClick={() => handleDelete(r.id)} disabled={deleting === r.id}>삭제</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {editing === 'new' && (
          <RankForm form={form} setForm={setForm} onSave={handleSave} onCancel={cancel} saving={saving} isNew />
        )}
      </div>
    </div>
  )
}

function RankForm({ form, setForm, onSave, onCancel, saving, isNew }) {
  const f = (k) => ({ value: form[k], onChange: e => setForm(v => ({ ...v, [k]: e.target.value })) })
  return (
    <div style={{ background: 'rgba(200,241,53,0.05)', border: '1px solid rgba(200,241,53,0.2)', borderRadius: '10px', padding: '12px' }}>
      <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, marginBottom: '10px' }}>
        {isNew ? '+ 새 직급' : '직급 편집'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>직급 명칭 *</div>
          <input className="input" placeholder="예: 팀장, 수석, 대리" {...f('label')} />
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>기본급 (원)</div>
          <input className="input" type="number" placeholder="2000000" {...f('base_salary')} />
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>인센티브율 (%)</div>
          <input className="input" type="number" min={0} max={100} placeholder="10" {...f('default_incentive_rate')} />
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>순서</div>
          <input className="input" type="number" style={{ width: '60px' }} {...f('sort_order')} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>취소</button>
        <button className="btn btn-primary"   style={{ flex: 1, justifyContent: 'center' }} onClick={onSave} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}
