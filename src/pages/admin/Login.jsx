import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function Login({ onLogin }) {
  const [name,    setName]    = useState('')
  const [phone,   setPhone]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  // 다지점: 로그인 후 센터 선택 단계
  const [step,    setStep]    = useState('login')   // 'login' | 'select_gym'
  const [trainer, setTrainer] = useState(null)
  const [gyms,    setGyms]    = useState([])

  async function handleLogin(e) {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) {
      setError('이름과 전화번호를 모두 입력해주세요')
      return
    }
    setLoading(true)
    setError('')

    try {
      const { data: trainers, error: err } = await supabase
        .from('trainers')
        .select('*, trainer_ranks(*)')
        .eq('name', name.trim())
        .eq('phone', phone.trim())

      if (err) throw err

      if (!trainers || trainers.length === 0) {
        setError('이름 또는 전화번호가 일치하지 않아요')
        return
      }

      const t = trainers[0]

      if (!t.gym_id) {
        setError('소속 센터가 없습니다. 센터에 등록된 계정으로 로그인해주세요')
        return
      }

      // 이 트레이너와 같은 gym_id를 공유하는 모든 gym 조회
      // (다지점: owner가 여러 gym을 가질 수 있는 경우 대비)
      // 일단 gym_id 기준으로 gyms 조회, 추후 owner_id 방식으로 확장 가능
      const { data: gymList, error: gymErr } = await supabase
        .from('gyms')
        .select('*')
        .eq('id', t.gym_id)

      if (gymErr || !gymList || gymList.length === 0) {
        setError('센터 정보를 불러올 수 없어요')
        return
      }

      setTrainer(t)

      if (gymList.length === 1) {
        // 단일 센터면 바로 진입
        onLogin(t, gymList[0])
      } else {
        // 복수 센터면 선택 화면
        setGyms(gymList)
        setStep('select_gym')
      }
    } catch (e) {
      setError('오류가 발생했어요: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSelectGym(gym) {
    onLogin(trainer, gym)
  }

  // ── 센터 선택 화면 ─────────────────────────────────────────────
  if (step === 'select_gym') {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">🏢</div>
          <div className="login-title">지점 선택</div>
          <div className="login-sub">관리할 센터를 선택해주세요</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
            {gyms.map(g => (
              <button
                key={g.id}
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'flex-start', padding: '14px 16px', fontSize: '13px', textAlign: 'left' }}
                onClick={() => handleSelectGym(g)}
              >
                <span style={{ marginRight: '10px', fontSize: '18px' }}>🏋️</span>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>{g.name}</div>
                  {g.address && <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{g.address}</div>}
                </div>
              </button>
            ))}
          </div>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '16px', fontSize: '12px' }}
            onClick={() => setStep('login')}
          >
            ← 다시 로그인
          </button>
        </div>
      </div>
    )
  }

  // ── 로그인 화면 ────────────────────────────────────────────────
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">🏢</div>
        <div className="login-title">CRM 포털</div>
        <div className="login-sub">센터 대표 전용 경영 관리 시스템</div>

        <form onSubmit={handleLogin}>
          {error && <div className="login-error">{error}</div>}

          <div className="login-field">
            <label className="login-label">이름</label>
            <input
              className="input"
              type="text"
              placeholder="트레이너 이름"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-label">전화번호</label>
            <input
              className="input"
              type="text"
              placeholder="010-0000-0000"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div style={{ marginTop: '24px', padding: '12px', background: 'rgba(200,241,53,0.06)', borderRadius: '8px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          💡 트레이너 포털과 동일한 이름·전화번호로 로그인합니다.<br />
          gym_id가 설정된 계정만 접속할 수 있어요.
        </div>
      </div>
    </div>
  )
}
