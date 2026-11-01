-- 095_admin_token_hash.sql
-- 관리자 RPC 공통 가드(_admin_assert)를 "토큰 원문 비교" → "sha256 해시 비교"로 변경 + 토큰 교체.
--
-- 배경 (2026-11-02 보안 점검):
--   공개 저장소의 옛 SQL 파일(fix_rls_top3.sql)에 관리자 토큰 원문이 남아 있었음.
--   DB 함수 본문에 원문을 두면 저장소·대시보드 어디서든 원문이 다시 새어 나갈 수 있어
--   093(ops_snapshot)과 같은 방식으로 해시만 저장한다. 원문은 로컬 .env(VITE_ADMIN_DB_TOKEN)에만.
--
-- ⚠️ 적용 방법: '<<ADMIN_TOKEN_SHA256>>' 를 새 토큰의 sha256 hex(소문자 64자)로 바꾼 사본을
--   SQL Editor 에 붙여넣는다. 저장소에는 자리표시만 둔다.
--
-- 영향: 관리자 앱(로컬 전용)만 이 토큰을 씀. 트레이너·회원·CRM 앱과 AI 운영실(_ops_assert)은 무관.

CREATE OR REPLACE FUNCTION _admin_assert(p_admin_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_admin_token IS NULL
     OR encode(sha256(convert_to(p_admin_token, 'UTF8')), 'hex') <> '<<ADMIN_TOKEN_SHA256>>' THEN
    RAISE EXCEPTION 'admin: unauthorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION _admin_assert(text) FROM PUBLIC;

COMMENT ON FUNCTION _admin_assert(text) IS
  '관리자 RPC 공통 가드. 토큰 원문 대신 sha256 해시 비교(095). 회전 시 본문 해시 교체 + 로컬 .env 갱신.';
