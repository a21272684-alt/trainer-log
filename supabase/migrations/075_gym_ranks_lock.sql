-- 075_gym_ranks_lock.sql
-- 🔒 gym_ranks (센터 직급·기본급·인센티브율) 가 anon(공개키)에 노출되던 것 차단.
--   전수 스캔에서 유일하게 남아있던 유출 (base_salary 등 급여구조 노출).
--
-- 안전성:
--   배포된 포털(트레이너/회원 앱)은 gym_ranks 를 직접 조회하지 않음(grep 확인).
--   정산 계산은 SECURITY DEFINER RPC(정의자 권한, RLS 무관) 경유.
--   → anon 차단해도 배포 앱 영향 없음.
--   ※ CRM(gym owner 직급관리)은 로컬 개발 중 — 배포 시 authenticated 정책 추가 필요.

ALTER TABLE gym_ranks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_ranks'
      AND ('public' = ANY(roles) OR 'anon' = ANY(roles))
      AND ( (coalesce(qual, 'true') = 'true' AND coalesce(with_check, 'true') = 'true')
            OR qual ILIKE '%''anon''%' )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.gym_ranks;', r.policyname);
    RAISE NOTICE 'dropped open/anon policy: gym_ranks.%', r.policyname;
  END LOOP;
END $$;
