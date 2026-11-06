import { useState } from 'react'
import AdminIcon from '../components/AdminIcon'
import { Badge, Chip, SearchInput, EmptyState, Avatar } from '../components/ui'
import { textMatch } from '../lib/adminRpc'

// 가입 승인 — 대기 요청은 카드로 크게, 처리 끝난 요청은 아래 목록으로.
// 승인·거부·기록 삭제 동작은 AdminPortal 의 기존 함수(admin_*_signup_request RPC)를 그대로 받음.

const fmtDT = (v) => v ? new Date(v).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const ago = (v) => {
  if (!v) return ''
  const h = Math.floor((Date.now() - new Date(v).getTime()) / 3600000)
  if (h < 1) return '방금'
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export default function SignupsPage({ requests, busyId, onApprove, onReject, onDelete }) {
  const [filter, setFilter] = useState('done')
  const [q, setQ] = useState('')

  const pending = requests.filter(r => r.status === 'pending')
  const approved = requests.filter(r => r.status === 'approved')
  const rejected = requests.filter(r => r.status === 'rejected')
  const doneList = (filter === 'approved' ? approved : filter === 'rejected' ? rejected : [...approved, ...rejected])
    .filter(r => !q || textMatch(r.name, q) || textMatch(r.email, q))
    .sort((a, b) => String(b.reviewed_at || b.requested_at).localeCompare(String(a.reviewed_at || a.requested_at)))

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <div>
          <p className="adm-page-crumb">사람</p>
          <h1 className="adm-page-title">가입 승인 <span>대기 {pending.length}건</span></h1>
        </div>
      </header>

      <p className="adm-foot-note">트레이너가 소셜 로그인 후 가입 요청을 보내면 여기 쌓여요. 승인하면 무료 플랜으로 등록되고, 거부하면 사유가 본인에게 보이며 같은 이메일로 다시 요청할 수 없어요.</p>

      {pending.length === 0
        ? <section className="adm-card"><EmptyState title="기다리는 가입 요청이 없어요" desc="새 요청이 오면 왼쪽 메뉴에 빨간 숫자로 표시돼요" /></section>
        : (
          <div className="adm-signup-grid">
            {pending.map(r => {
              const busy = busyId === r.id
              return (
                <article key={r.id} className="adm-signup-card">
                  <div className="adm-cell-name">
                    <Avatar name={r.name} strong />
                    <span style={{ minWidth: 0 }}>
                      <span className="adm-ellipsis" style={{ display: 'block' }}>{r.name}</span>
                      <span className="adm-cell-sub adm-ellipsis" style={{ display: 'block' }}>{r.email}</span>
                    </span>
                  </div>
                  <div className="adm-signup-meta">
                    <AdminIcon name="clock" size={14} /> {fmtDT(r.requested_at)} 요청 · {ago(r.requested_at)}
                  </div>
                  <div className="adm-signup-actions">
                    <button type="button" className="adm-btn adm-btn--danger-ghost" disabled={busy} onClick={() => onReject(r)}>거부</button>
                    <button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={() => onApprove(r)}>
                      <AdminIcon name="check" size={16} strokeWidth={2.4} />{busy ? '처리 중…' : '승인'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}

      <div className="adm-toolbar">
        <div className="adm-chips" role="group" aria-label="처리한 요청">
          <Chip active={filter === 'done'} onClick={() => setFilter('done')}>처리 완료 {approved.length + rejected.length}</Chip>
          <Chip active={filter === 'approved'} onClick={() => setFilter('approved')}>승인 {approved.length}</Chip>
          <Chip active={filter === 'rejected'} onClick={() => setFilter('rejected')}>거부 {rejected.length}</Chip>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="이름 · 이메일 · 초성" width={240} />
      </div>

      <div className="adm-table">
        <div className="adm-tr adm-th adm-cols-signups">
          <div>이름</div><div>상태</div><div>요청일</div><div>처리일 · 사유</div><div />
        </div>
        {doneList.length === 0 && <EmptyState title={q ? `'${q}' 검색 결과가 없어요` : '처리한 요청이 없어요'} />}
        {doneList.map(r => (
          <div key={r.id} className="adm-tr adm-cols-signups">
            <span className="adm-cell-name">
              <Avatar name={r.name} />
              <span style={{ minWidth: 0 }}>
                <span className="adm-ellipsis" style={{ display: 'block' }}>{r.name}</span>
                <span className="adm-cell-sub adm-ellipsis" style={{ display: 'block' }}>{r.email}</span>
              </span>
            </span>
            <span>{r.status === 'approved' ? <Badge tone="lime">승인</Badge> : <Badge tone="red">거부</Badge>}</span>
            <span className="adm-num adm-num--soft">{fmtDT(r.requested_at)}</span>
            <span style={{ minWidth: 0 }}>
              <span className="adm-num adm-num--soft">{fmtDT(r.reviewed_at) || '–'}</span>
              {r.rejection_reason && <span className="adm-cell-sub adm-ellipsis" style={{ display: 'block' }}>“{r.rejection_reason}”</span>}
            </span>
            <span className="adm-row-actions">
              {r.status === 'rejected' && (
                <button type="button" className="adm-btn adm-btn--sm" disabled={busyId === r.id} onClick={() => onDelete(r)} title="삭제하면 같은 이메일로 다시 가입 요청할 수 있어요">재요청 허용</button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
