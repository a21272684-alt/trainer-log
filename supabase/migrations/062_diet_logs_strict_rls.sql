-- 062_diet_logs_strict_rls.sql
-- diet_logs RLS 강화 (B) — 050 에서 예고된 052 청소의 일부.
--
-- 배경:
--   028 에서 diet_logs 는 allow_all (using true) → anon key 로 전 회원 식단
--   (식습관·사진 URL) 조회 가능한 노출 상태. 트레이너 식단 조회 뷰(A)를 켜는 김에
--   strict RLS 로 잠근다.
--
-- 정책:
--   SELECT : 회원 본인(auth_id) OR 담당 트레이너(members.trainer_id 의 trainer)
--   INSERT/UPDATE/DELETE : 회원 본인만 (기록 주체)
--   members/trainers.auth_id = uuid (050 확인) → auth.uid() 직접 비교.
--
-- 영향:
--   - 배포된 회원앱(MemberPortal): 본인 식단 입출력 → SELECT/INSERT/DELETE 본인 정책으로 정상.
--   - 트레이너앱 식단 조회(A): 담당 트레이너 SELECT 정책으로 가능.
--   ⚠️ 회원앱 영향이 있으므로 dev 검증 후 적용.
--
-- ※ 사진(diet-photos)은 public 버킷 + photo_url 직접 접근이라 본 마이그 범위 밖.
--   구조화 식단 데이터(음식/영양/날짜)의 노출 차단이 핵심. 사진 비공개 전환은
--   signed URL 도입이 필요해 별도 검토.
--
-- 멱등: 기존 정책 이름 무관 전부 제거 후 재생성.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diet_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON diet_logs', r.policyname);
  END LOOP;
END $$;

ALTER TABLE diet_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: 회원 본인 OR 담당 트레이너
CREATE POLICY "diet_logs_select" ON diet_logs
  FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
    OR member_id IN (
      SELECT m.id FROM members m
      WHERE m.trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid())
    )
  );

-- INSERT: 회원 본인만
CREATE POLICY "diet_logs_insert" ON diet_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

-- UPDATE: 회원 본인만
CREATE POLICY "diet_logs_update" ON diet_logs
  FOR UPDATE TO authenticated
  USING      (member_id IN (SELECT id FROM members WHERE auth_id = auth.uid()))
  WITH CHECK (member_id IN (SELECT id FROM members WHERE auth_id = auth.uid()));

-- DELETE: 회원 본인만
CREATE POLICY "diet_logs_delete" ON diet_logs
  FOR DELETE TO authenticated
  USING (member_id IN (SELECT id FROM members WHERE auth_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_diet_logs_member ON diet_logs (member_id, record_date DESC);

-- 검증 (Role=anon): SELECT * FROM diet_logs LIMIT 1; → 0행 기대
