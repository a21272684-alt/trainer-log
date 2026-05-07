-- ================================================================
-- 048: get_member_retention RPC
-- 회원 리텐션 지표 일괄 조회 (N+1 쿼리 금지 원칙 준수)
-- ================================================================
-- [설계 원칙]
--   - 회원 수 N에 관계없이 단 1회의 쿼리로 전체 계산
--   - 프론트엔드는 boolean 결과값만 수신 → attendance 전체 전송 금지
--   - LEFT JOIN + GROUP BY 로 집계: 인덱스 최대 활용
--
-- [인자]
--   p_gym_id : gyms.id (UUID)
--
-- [반환 컬럼]
--   member_id          : members.id
--   latest_end_date    : 가장 늦은 활성 기간권 만료일 (NULL = 기간권 없음)
--   last_attended_date : 가장 최근 완료 출석일 (NULL = 출석 기록 없음)
--   expiry_warning     : 14일 이내 만료 예정 (boolean)
--   absence_warning    : 7일 이상 미출석 + active 상태 (boolean)
-- ================================================================

CREATE OR REPLACE FUNCTION get_member_retention(p_gym_id UUID)
RETURNS TABLE (
  member_id          UUID,
  latest_end_date    DATE,
  last_attended_date DATE,
  expiry_warning     BOOLEAN,
  absence_warning    BOOLEAN
)
LANGUAGE sql
STABLE     -- 동일 트랜잭션 내 결과 캐싱 허용
AS $$
  SELECT
    m.id                                              AS member_id,

    -- 가장 늦은 활성 기간권 만료일
    MAX(p.end_date)                                   AS latest_end_date,

    -- 가장 최근 완료된 출석일
    MAX(a.attended_date)                              AS last_attended_date,

    -- 만료 임박 경고: 활성 기간권 중 오늘~14일 이내 만료 예정
    COALESCE(
      BOOL_OR(
        p.end_date IS NOT NULL
        AND p.end_date BETWEEN CURRENT_DATE
                           AND (CURRENT_DATE + INTERVAL '14 days')
      ),
      false
    )                                                 AS expiry_warning,

    -- 장기 미출석 경고: active 회원 + 출석 기록 있음 + 마지막 출석이 7일 이상 전
    (
      m.status = 'active'
      AND MAX(a.attended_date) IS NOT NULL
      AND MAX(a.attended_date) < CURRENT_DATE - INTERVAL '7 days'
    )                                                 AS absence_warning

  FROM members m

  -- 활성 기간권 (end_date 있는 것만)
  LEFT JOIN payments p
    ON  p.member_id  = m.id
    AND p.status     = 'active'
    AND p.end_date   IS NOT NULL

  -- 완료된 출석 기록
  LEFT JOIN attendance a
    ON  a.member_id  = m.id
    AND a.status     = 'completed'

  WHERE m.gym_id = p_gym_id

  GROUP BY m.id, m.status
$$;

-- 인증된 사용자에게 실행 권한 부여
GRANT EXECUTE ON FUNCTION get_member_retention(UUID)
  TO authenticated, anon;

COMMENT ON FUNCTION get_member_retention IS
  '회원 리텐션 지표 일괄 계산. 단일 쿼리로 N명의 만료임박/장기미출석 여부 반환.';

-- ── 인덱스 보강 (RPC 쿼리 성능) ─────────────────────────────
-- payments: 활성 기간권 조회
CREATE INDEX IF NOT EXISTS idx_payments_member_active_enddate
  ON payments (member_id, end_date)
  WHERE status = 'active' AND end_date IS NOT NULL;

-- attendance: 최근 출석일 조회
CREATE INDEX IF NOT EXISTS idx_attendance_member_completed
  ON attendance (member_id, attended_date)
  WHERE status = 'completed';
