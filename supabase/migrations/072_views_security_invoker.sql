-- 072_views_security_invoker.sql
-- 🔒 보안 CRITICAL: public 스키마의 모든 뷰를 SECURITY INVOKER 로 전환.
--
-- 문제(Supabase advisor "Security Definer View"):
--   Postgres 뷰는 기본이 SECURITY DEFINER → "뷰 소유자(관리자)" 권한으로 실행되어 RLS 를 우회함.
--   이 뷰들이 anon/authenticated 에 노출되어, 공개키(publishable, 앱 번들에 포함)만으로
--   gym_members / gym_trainers / v_settlement_detail(정산) / v_churn_risk_dashboard(실명 분석)
--   등 전체 데이터를 조회할 수 있었음(= 데이터 유출).
--
-- 해결:
--   security_invoker=on → 뷰가 "조회한 사용자" 권한으로 실행 → 기반 테이블의 RLS 가 적용됨.
--   anon 은 RLS 에 막혀 데이터를 못 봄. advisor 경고도 해소.
--
-- 안전성:
--   클라이언트(apps/)는 이 뷰들을 .from() 으로 직접 조회하지 않음(grep 확인 완료) → 앱 기능 영향 없음.
--   내부 SECURITY DEFINER RPC 는 정의자 권한으로 실행되므로 영향 없음.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on);', r.viewname);
    RAISE NOTICE 'security_invoker=on → %', r.viewname;
  END LOOP;
END $$;
