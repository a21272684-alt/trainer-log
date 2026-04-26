-- ══════════════════════════════════════════════════════════════
-- 029_credits.sql
-- 트레이너 크레딧 시스템
-- ══════════════════════════════════════════════════════════════

-- trainers 테이블에 credits 컬럼 추가
ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN trainers.credits IS 'AI 수업일지 생성에 사용되는 크레딧 잔액';

-- ── RPC: 크레딧 차감 (원자적) ──────────────────────────────
CREATE OR REPLACE FUNCTION use_ai_credit(p_trainer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_credits integer;
BEGIN
  SELECT credits INTO v_credits
    FROM trainers WHERE id = p_trainer_id FOR UPDATE;

  IF v_credits IS NULL OR v_credits <= 0 THEN
    RETURN jsonb_build_object('success', false, 'credits', 0);
  END IF;

  UPDATE trainers SET credits = credits - 1 WHERE id = p_trainer_id;

  RETURN jsonb_build_object('success', true, 'credits', v_credits - 1);
END;
$$;

-- ── RPC: 크레딧 충전 (어드민용) ────────────────────────────
CREATE OR REPLACE FUNCTION admin_add_credits(
  p_trainer_id uuid,
  p_amount     integer
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new integer;
BEGIN
  UPDATE trainers
     SET credits = credits + p_amount
   WHERE id = p_trainer_id
   RETURNING credits INTO v_new;
  RETURN v_new;
END;
$$;
