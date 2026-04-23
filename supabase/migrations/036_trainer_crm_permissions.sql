-- ================================================================
-- 036_trainer_crm_permissions.sql
-- trainers 테이블에 CRM 권한 설정 컬럼 추가
--
-- 구조:
--   crm_permissions JSONB
--   {
--     crm_access:       boolean,  -- CRM 포털 접근
--     view_all_members: boolean,  -- 전체 회원 열람
--     manage_products:  boolean,  -- 상품 관리
--     view_settlement:  boolean,  -- 정산 열람
--   }
-- ================================================================

ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS crm_permissions JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN trainers.crm_permissions IS
  'CRM 포털 기능별 권한 설정 (JSONB).
   crm_access: 포털 로그인 허용
   view_all_members: 모든 트레이너 회원 열람
   manage_products: 상품 등록·수정·삭제
   view_settlement: 정산 내역 조회';
