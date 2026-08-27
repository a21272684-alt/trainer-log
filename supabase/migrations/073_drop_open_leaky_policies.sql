-- 073_drop_open_leaky_policies.sql
-- 🔒 CRITICAL: members/trainers/payments/logs/attendance/gyms 에 남아있던
--   "누구나(public) USING(true)" 허술한 open 정책 제거.
--
-- 배경:
--   050/051 은 strict 정책을 추가했지만 "특정 이름" 정책만 drop 해서,
--   더 오래된 *_open / *_all (public, using true) 정책이 잔존 → permissive OR 로 합쳐져
--   anon(publishable) 키만으로 전체 회원/트레이너/결제/일지/출석 노출됨.
--   (062 diet_logs 처럼 "이름 무관 전체 제거"를 안 했던 게 원인)
--
-- 안전성:
--   각 테이블에 auth 기반 strict 정책이 5~14개씩 이미 존재(진단 확인) → open 정책만
--   제거해도 authenticated 사용자(트레이너/회원) 접근은 유지, anon 만 차단됨.
--   RLS 는 모든 대상 테이블에서 이미 활성(rls_on=true).
--
-- 필터: public/anon 역할 + qual/with_check 가 사실상 true(무조건 허용)인 정책만 제거.
--        auth.uid()/app_is_*() 기반 정책은 qual 이 true 가 아니므로 유지됨.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('trainers','members','payments','logs','attendance','gyms')
      AND ('public' = ANY(roles) OR 'anon' = ANY(roles))
      AND coalesce(qual, 'true') = 'true'
      AND coalesce(with_check, 'true') = 'true'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.policyname, r.tablename);
    RAISE NOTICE 'dropped OPEN policy: %.%', r.tablename, r.policyname;
  END LOOP;
END $$;

-- 2차: "auth.role() = 'anon'" 처럼 anon 을 명시적으로 통과시키는 정책 제거.
--   (qual 이 복합식 `A OR (auth.role()='anon')` 이라 위 true 필터로 안 잡힘)
--   예: trainers.trainer_select, members.member_select
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('trainers','members','payments','logs','attendance','gyms')
      AND ('public' = ANY(roles) OR 'anon' = ANY(roles))
      AND qual ILIKE '%''anon''%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.policyname, r.tablename);
    RAISE NOTICE 'dropped anon-granting policy: %.%', r.tablename, r.policyname;
  END LOOP;
END $$;
