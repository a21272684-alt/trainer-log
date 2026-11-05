-- 097_admin_list_subscriptions.sql
-- 관리자 페이지 '구독 관리' 목록이 항상 비어 보이던 문제 (2026-11-05).
--
-- 원인: AdminPortal 은 앱 공개 키(anon)만 쓰는데, 구독 목록만 subscriptions 를 직접 SELECT 하고 있었음.
--   subscriptions 는 RLS 로 anon 읽기가 막혀 있어 0행 → 추가(077 RPC)는 저장되지만 목록엔 안 보임.
-- 해결: 다른 admin_list_* (052) 와 같은 방식 — _admin_assert 토큰 가드 SECURITY DEFINER RPC 로 조회.

CREATE OR REPLACE FUNCTION admin_list_subscriptions(p_admin_token text, p_limit integer DEFAULT 500)
RETURNS SETOF subscriptions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _admin_assert(p_admin_token);
  RETURN QUERY
    SELECT * FROM subscriptions
    ORDER BY paid_at DESC NULLS LAST
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
END;
$$;

REVOKE ALL ON FUNCTION admin_list_subscriptions(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_subscriptions(text, integer) TO anon, authenticated;
