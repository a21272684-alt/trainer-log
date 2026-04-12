-- ============================================================
-- 005_kakao_phone_session_price.sql
-- 회원에 카카오톡 전화번호 + 세션 단가 컬럼 추가
-- ============================================================

alter table members add column if not exists kakao_phone text;
alter table members add column if not exists session_price integer default 0;
