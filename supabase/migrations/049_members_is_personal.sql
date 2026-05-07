-- 049_members_is_personal.sql
-- 트레이너 포털의 "개인 레슨 회원" 과 CRM 의 "센터 회원" 구분
--
-- 배경:
--   members.trainer_id 는 두 의미로 혼용되어 왔다.
--     · 트레이너 포털 (TrainerApp): "내가 직접 관리하는 개인 레슨 회원" → 회원 목록에 노출
--     · CRM (GymOwnerPortal): "이 트레이너가 담당인 센터 회원" → CRM 통계용
--   같은 컬럼을 공유하면 CRM 에서 등록한 센터 회원이 그 트레이너의
--   개인 회원으로도 자동 노출되는 버그가 발생.
--
-- 해결:
--   is_personal boolean 컬럼 추가.
--     true  → 개인 레슨 회원 (TrainerApp 의 회원 목록에 노출)
--     false → 센터 회원 (CRM 만 사용, TrainerApp 미노출)
--   기존 데이터는 모두 트레이너 포털에서 등록된 것으로 간주 → default true.
--   향후 CRM MembersTab 에서 INSERT 시 false 명시.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN members.is_personal IS
  'true  → 트레이너 포털에서 직접 등록한 개인 레슨 회원 (TrainerApp 노출). '
  'false → CRM 에서 등록한 센터 회원 (TrainerApp 미노출, CRM 만 사용).';

-- 인덱스: TrainerApp 의 회원 목록 쿼리 성능 (trainer_id + is_personal 복합)
CREATE INDEX IF NOT EXISTS idx_members_trainer_personal
  ON members (trainer_id, is_personal);
