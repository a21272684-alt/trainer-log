-- 100 신규 트레이너 = 무료 플랜 기본값 (AI 수업일지 월 15회, 가입 시점 기준 매월 리셋)
-- 079 는 자율가입(trainer_create_signup_request)에서만 free_ai_quota=15 를 넣었음.
-- 관리자 사전 등록(admin_register_trainer)·옛 승인 경로(admin_approve_signup_request)로 만들어진
-- 트레이너는 free_ai_quota NULL + 크레딧 0 → AI 수업일지를 아예 못 쓰는 상태였음.
-- → 어느 경로로 만들어져도 새 트레이너에는 무료 횟수를 자동으로 채움. 기존 트레이너는 건드리지 않음.
-- 회원 5명 제한은 feature_gates.free.member_limit (등급 기준)로 이미 적용 중.

CREATE OR REPLACE FUNCTION _trainer_default_free_quota()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.free_ai_quota IS NULL THEN
    NEW.free_ai_quota        := 15;
    NEW.free_ai_used         := 0;
    NEW.free_ai_anchor       := COALESCE(NEW.free_ai_anchor, now());
    NEW.free_ai_period_start := COALESCE(NEW.free_ai_period_start, NEW.free_ai_anchor);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trainer_default_free_quota ON trainers;
CREATE TRIGGER trg_trainer_default_free_quota
  BEFORE INSERT ON trainers
  FOR EACH ROW EXECUTE FUNCTION _trainer_default_free_quota();
