-- 091_crm_benefits.sql
-- CRM 쿠폰·마일리지.
--
-- 규칙 (사용자 결정 2026-10-15):
--   - 적립: 상품별 적립률(gym_products.mileage_rate, %). 비면 센터 기본 적립률
--   - 사용 규칙·유효기간: 대표 또는 manage_benefits 권한자가 설정 (gyms.benefit_settings)
--   - 쿠폰: 금액/비율(최대 할인), 최소 결제 금액, 적용 상품(전체/종류/특정 상품), 유효기간(발급일+N일 또는 특정일)
--   - 쿠폰 만들기·발급, 규칙 변경, 마일리지 직접 조정 = 권한자만. 결제 시 적용 = 직원 누구나
--   - 환불 시 되돌리기: 그 결제 적립분 회수, 그 결제에 쓴 마일리지·쿠폰 반환 (트리거)
--   - 적립 = 실제 결제 금액 × 적립률. 차감 = 소멸 임박 순(FIFO). 쿠폰은 결제당 1장
--   - 자동 발송 없음 (오토메이션은 특허 확인 전 보류)

ALTER TABLE gyms ADD COLUMN IF NOT EXISTS benefit_settings jsonb NOT NULL DEFAULT
  '{"enabled": true, "point_value": 1, "default_rate": 1, "min_use": 0, "max_use_pct": 100, "expire_months": 12}'::jsonb;
ALTER TABLE gym_products ADD COLUMN IF NOT EXISTS mileage_rate numeric(5,2);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS list_amount      integer;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS coupon_discount  integer NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS member_coupon_id uuid;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS mileage_used     integer NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS mileage_earned   integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS coupons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  discount_type text NOT NULL CHECK (discount_type IN ('amount', 'percent')),
  value         integer NOT NULL CHECK (value > 0),
  max_discount  integer,
  min_amount    integer NOT NULL DEFAULT 0,
  product_scope text NOT NULL DEFAULT 'all' CHECK (product_scope IN ('all', 'category', 'products')),
  categories    text[] NOT NULL DEFAULT '{}',
  product_ids   uuid[] NOT NULL DEFAULT '{}',
  valid_days    integer,
  valid_until   date,
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES trainers(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percent' OR value <= 100),
  CHECK (valid_days IS NOT NULL OR valid_until IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS member_coupons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  coupon_id       uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  member_id       uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      date NOT NULL,
  used_at         timestamptz,
  used_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  revoked_at      timestamptz,
  issued_by       uuid REFERENCES trainers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS member_coupons_member_idx ON member_coupons(member_id);

CREATE TABLE IF NOT EXISTS mileage_lots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount      integer NOT NULL CHECK (amount > 0),
  remaining   integer NOT NULL CHECK (remaining >= 0),
  expires_at  date,
  source      text NOT NULL CHECK (source IN ('earn', 'adjust', 'refund_restore')),
  payment_id  uuid REFERENCES payments(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mileage_lots_member_idx ON mileage_lots(member_id);

CREATE TABLE IF NOT EXISTS mileage_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('earn', 'use', 'refund_reclaim', 'refund_restore', 'adjust', 'coupon_issue')),
  delta       integer NOT NULL DEFAULT 0,
  payment_id  uuid REFERENCES payments(id) ON DELETE SET NULL,
  memo        text,
  created_by  uuid REFERENCES trainers(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mileage_ledger_gym_idx    ON mileage_ledger(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mileage_ledger_member_idx ON mileage_ledger(member_id, created_at DESC);

ALTER TABLE coupons        ENABLE ROW LEVEL SECURITY;   -- 직접 접근 없음, RPC 로만
ALTER TABLE member_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE mileage_lots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mileage_ledger ENABLE ROW LEVEL SECURITY;

-- ── 헬퍼 ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_can_manage_benefits(p_gym_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM trainers WHERE gym_id = p_gym_id AND auth_id = auth.uid()
                   AND (role = 'owner' OR COALESCE((crm_permissions->>'manage_benefits')::boolean, false)))
$$;

CREATE OR REPLACE FUNCTION crm_assert_benefit_admin(p_gym_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid;
BEGIN
  v_me := crm_assert_gym_staff(p_gym_id);
  IF NOT crm_can_manage_benefits(p_gym_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_me;
END;
$$;
REVOKE ALL ON FUNCTION crm_assert_benefit_admin(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION crm_mileage_balance(p_member_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(remaining), 0)::int FROM mileage_lots
   WHERE member_id = p_member_id AND remaining > 0 AND (expires_at IS NULL OR expires_at >= crm_today_kst())
$$;
REVOKE ALL ON FUNCTION crm_mileage_balance(uuid) FROM PUBLIC, anon, authenticated;

-- 소멸 임박 순으로 차감. 실제 차감한 양 반환
CREATE OR REPLACE FUNCTION crm_mileage_consume(p_member_id uuid, p_amount integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_left integer := p_amount; v_lot record; v_take integer;
BEGIN
  FOR v_lot IN
    SELECT id, remaining FROM mileage_lots
     WHERE member_id = p_member_id AND remaining > 0 AND (expires_at IS NULL OR expires_at >= crm_today_kst())
     ORDER BY expires_at NULLS LAST, created_at
     FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, v_lot.remaining);
    UPDATE mileage_lots SET remaining = remaining - v_take WHERE id = v_lot.id;
    v_left := v_left - v_take;
  END LOOP;
  RETURN p_amount - v_left;
END;
$$;
REVOKE ALL ON FUNCTION crm_mileage_consume(uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION crm_mileage_expiry(p_gym_id uuid) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN COALESCE((benefit_settings->>'expire_months')::int, 0) > 0
              THEN (crm_today_kst() + make_interval(months => (benefit_settings->>'expire_months')::int))::date
              ELSE NULL END
    FROM gyms WHERE id = p_gym_id
$$;
REVOKE ALL ON FUNCTION crm_mileage_expiry(uuid) FROM PUBLIC, anon, authenticated;

-- 쿠폰 할인액 (적용 불가면 NULL)
CREATE OR REPLACE FUNCTION crm_coupon_discount(p_coupon coupons, p_product gym_products, p_list integer) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_list < p_coupon.min_amount THEN RETURN NULL; END IF;
  IF p_coupon.product_scope = 'category' AND NOT (p_product.category = ANY(p_coupon.categories)) THEN RETURN NULL; END IF;
  IF p_coupon.product_scope = 'products' AND NOT (p_product.id = ANY(p_coupon.product_ids)) THEN RETURN NULL; END IF;
  IF p_coupon.discount_type = 'amount' THEN RETURN LEAST(p_coupon.value, p_list); END IF;
  RETURN LEAST(p_list, COALESCE(p_coupon.max_discount, p_list), floor(p_list * p_coupon.value / 100.0)::int);
END;
$$;

-- ── 설정 ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_benefit_settings(p_gym_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  RETURN jsonb_build_object(
    'settings', (SELECT benefit_settings FROM gyms WHERE id = p_gym_id),
    'can_manage', crm_can_manage_benefits(p_gym_id),
    'products', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'category', category, 'mileage_rate', mileage_rate) ORDER BY category, name)
                            FROM gym_products WHERE gym_id = p_gym_id AND is_active), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION crm_benefit_settings_save(p_gym_id uuid, p_settings jsonb, p_rates jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r jsonb;
BEGIN
  PERFORM crm_assert_benefit_admin(p_gym_id);
  IF (p_settings->>'point_value')::numeric <= 0 OR (p_settings->>'default_rate')::numeric < 0
     OR (p_settings->>'max_use_pct')::numeric NOT BETWEEN 0 AND 100 OR (p_settings->>'min_use')::numeric < 0
     OR (p_settings->>'expire_months')::numeric < 0 THEN
    RAISE EXCEPTION 'INVALID_SETTINGS';
  END IF;
  UPDATE gyms SET benefit_settings = jsonb_build_object(
    'enabled',       COALESCE((p_settings->>'enabled')::boolean, true),
    'point_value',   (p_settings->>'point_value')::numeric,
    'default_rate',  (p_settings->>'default_rate')::numeric,
    'min_use',       (p_settings->>'min_use')::int,
    'max_use_pct',   (p_settings->>'max_use_pct')::numeric,
    'expire_months', (p_settings->>'expire_months')::int)
  WHERE id = p_gym_id;
  IF p_rates IS NOT NULL THEN
    FOR v_r IN SELECT * FROM jsonb_array_elements(p_rates) LOOP
      UPDATE gym_products SET mileage_rate = NULLIF(v_r->>'rate', '')::numeric
       WHERE id = (v_r->>'id')::uuid AND gym_id = p_gym_id;
    END LOOP;
  END IF;
END;
$$;

-- ── 쿠폰 종류 ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_coupon_list(p_gym_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM crm_assert_gym_staff(p_gym_id);
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'issued', (SELECT COUNT(*) FROM member_coupons mc WHERE mc.coupon_id = c.id AND mc.revoked_at IS NULL),
      'used',   (SELECT COUNT(*) FROM member_coupons mc WHERE mc.coupon_id = c.id AND mc.used_at IS NOT NULL)
    ) ORDER BY c.active DESC, c.created_at DESC)
    FROM coupons c WHERE c.gym_id = p_gym_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION crm_coupon_save(p_gym_id uuid, p_id uuid, p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid; v_id uuid;
BEGIN
  v_me := crm_assert_benefit_admin(p_gym_id);
  IF p_id IS NULL THEN
    INSERT INTO coupons (gym_id, name, discount_type, value, max_discount, min_amount, product_scope, categories, product_ids, valid_days, valid_until, active, created_by)
    VALUES (p_gym_id, p->>'name', p->>'discount_type', (p->>'value')::int, NULLIF(p->>'max_discount', '')::int,
            COALESCE(NULLIF(p->>'min_amount', '')::int, 0), COALESCE(p->>'product_scope', 'all'),
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(p->'categories')), '{}'),
            COALESCE(ARRAY(SELECT (jsonb_array_elements_text(p->'product_ids'))::uuid), '{}'),
            NULLIF(p->>'valid_days', '')::int, NULLIF(p->>'valid_until', '')::date, true, v_me)
    RETURNING id INTO v_id;
  ELSE
    UPDATE coupons SET name = p->>'name', discount_type = p->>'discount_type', value = (p->>'value')::int,
           max_discount = NULLIF(p->>'max_discount', '')::int, min_amount = COALESCE(NULLIF(p->>'min_amount', '')::int, 0),
           product_scope = COALESCE(p->>'product_scope', 'all'),
           categories = COALESCE(ARRAY(SELECT jsonb_array_elements_text(p->'categories')), '{}'),
           product_ids = COALESCE(ARRAY(SELECT (jsonb_array_elements_text(p->'product_ids'))::uuid), '{}'),
           valid_days = NULLIF(p->>'valid_days', '')::int, valid_until = NULLIF(p->>'valid_until', '')::date,
           active = COALESCE((p->>'active')::boolean, active)
     WHERE id = p_id AND gym_id = p_gym_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

-- ── 쿠폰 발급 (회원 여러 명) ────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_issue_coupon(p_coupon_id uuid, p_member_ids uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c coupons%ROWTYPE; v_me uuid; v_exp date; v_n integer := 0; v_mid uuid;
BEGIN
  SELECT * INTO v_c FROM coupons WHERE id = p_coupon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_me := crm_assert_benefit_admin(v_c.gym_id);
  IF NOT v_c.active THEN RAISE EXCEPTION 'INACTIVE'; END IF;
  v_exp := COALESCE(v_c.valid_until, crm_today_kst() + v_c.valid_days - 1);
  IF v_exp < crm_today_kst() THEN RAISE EXCEPTION 'EXPIRED'; END IF;
  FOREACH v_mid IN ARRAY p_member_ids LOOP
    IF crm_assert_member_gym(v_mid) = v_c.gym_id THEN
      INSERT INTO member_coupons (gym_id, coupon_id, member_id, expires_at, issued_by) VALUES (v_c.gym_id, v_c.id, v_mid, v_exp, v_me);
      INSERT INTO mileage_ledger (gym_id, member_id, kind, delta, memo, created_by) VALUES (v_c.gym_id, v_mid, 'coupon_issue', 0, v_c.name, v_me);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ── 회원 혜택 (결제 창·회원 상세) ────────────────────────────────
CREATE OR REPLACE FUNCTION crm_member_benefits(p_member_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gym uuid; v_today date := crm_today_kst();
BEGIN
  v_gym := crm_assert_member_gym(p_member_id);
  RETURN jsonb_build_object(
    'settings', (SELECT benefit_settings FROM gyms WHERE id = v_gym),
    'can_manage', crm_can_manage_benefits(v_gym),
    'balance', crm_mileage_balance(p_member_id),
    'expiring_30', COALESCE((SELECT SUM(remaining) FROM mileage_lots WHERE member_id = p_member_id AND remaining > 0
                               AND expires_at BETWEEN v_today AND v_today + 30), 0),
    'coupons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', mc.id, 'expires_at', mc.expires_at, 'coupon', to_jsonb(c)) ORDER BY mc.expires_at)
        FROM member_coupons mc JOIN coupons c ON c.id = mc.coupon_id
       WHERE mc.member_id = p_member_id AND mc.used_at IS NULL AND mc.revoked_at IS NULL AND mc.expires_at >= v_today
    ), '[]'::jsonb),
    'ledger', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('at', l.created_at, 'kind', l.kind, 'delta', l.delta, 'memo', l.memo, 'by', t.name) ORDER BY l.created_at DESC)
        FROM (SELECT * FROM mileage_ledger WHERE member_id = p_member_id ORDER BY created_at DESC LIMIT 50) l
        LEFT JOIN trainers t ON t.id = l.created_by
    ), '[]'::jsonb)
  );
END;
$$;

-- ── 마일리지 직접 조정 ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_mileage_adjust(p_member_id uuid, p_delta integer, p_memo text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gym uuid; v_me uuid; v_done integer;
BEGIN
  v_gym := crm_assert_member_gym(p_member_id);
  v_me := crm_assert_benefit_admin(v_gym);
  IF p_delta = 0 OR p_delta IS NULL THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  PERFORM 1 FROM members WHERE id = p_member_id FOR UPDATE;
  IF p_delta > 0 THEN
    INSERT INTO mileage_lots (gym_id, member_id, amount, remaining, expires_at, source)
    VALUES (v_gym, p_member_id, p_delta, p_delta, crm_mileage_expiry(v_gym), 'adjust');
    v_done := p_delta;
  ELSE
    IF crm_mileage_balance(p_member_id) < -p_delta THEN RAISE EXCEPTION 'INSUFFICIENT'; END IF;
    v_done := -crm_mileage_consume(p_member_id, -p_delta);
  END IF;
  INSERT INTO mileage_ledger (gym_id, member_id, kind, delta, memo, created_by) VALUES (v_gym, p_member_id, 'adjust', v_done, NULLIF(btrim(p_memo), ''), v_me);
  RETURN crm_mileage_balance(p_member_id);
END;
$$;

-- ── 결제 (쿠폰·마일리지 적용) ───────────────────────────────────
-- 화면 계산을 믿지 않고 여기서 검증·계산·기록을 한 번에.
CREATE OR REPLACE FUNCTION crm_pay_with_benefits(
  p_member_id uuid, p_product_id uuid, p_list_amount integer, p_method text,
  p_member_coupon_id uuid, p_mileage_use integer, p_memo text, p_processed_by uuid,
  p_start date, p_end date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gym uuid; v_me uuid; v_m members%ROWTYPE; v_p gym_products%ROWTYPE; v_s jsonb;
  v_mc member_coupons%ROWTYPE; v_c coupons%ROWTYPE;
  v_coupon_disc integer := 0; v_use integer := COALESCE(p_mileage_use, 0); v_pv numeric;
  v_after_coupon integer; v_max_use integer; v_final integer; v_rate numeric; v_earn integer; v_pay_id uuid;
BEGIN
  v_gym := crm_assert_member_gym(p_member_id);
  v_me := crm_assert_gym_staff(v_gym);
  SELECT * INTO v_m FROM members WHERE id = p_member_id FOR UPDATE;
  SELECT * INTO v_p FROM gym_products WHERE id = p_product_id AND gym_id = v_gym;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF p_list_amount IS NULL OR p_list_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  SELECT benefit_settings INTO v_s FROM gyms WHERE id = v_gym;
  v_pv := COALESCE((v_s->>'point_value')::numeric, 1);

  -- 쿠폰
  IF p_member_coupon_id IS NOT NULL THEN
    SELECT * INTO v_mc FROM member_coupons WHERE id = p_member_coupon_id AND member_id = p_member_id FOR UPDATE;
    IF NOT FOUND OR v_mc.used_at IS NOT NULL OR v_mc.revoked_at IS NOT NULL OR v_mc.expires_at < crm_today_kst() THEN
      RAISE EXCEPTION 'COUPON_UNAVAILABLE';
    END IF;
    SELECT * INTO v_c FROM coupons WHERE id = v_mc.coupon_id;
    v_coupon_disc := crm_coupon_discount(v_c, v_p, p_list_amount);
    IF v_coupon_disc IS NULL THEN RAISE EXCEPTION 'COUPON_NOT_APPLICABLE'; END IF;
  END IF;
  v_after_coupon := p_list_amount - v_coupon_disc;

  -- 마일리지
  IF v_use > 0 THEN
    IF NOT COALESCE((v_s->>'enabled')::boolean, true) THEN RAISE EXCEPTION 'MILEAGE_DISABLED'; END IF;
    IF v_use < COALESCE((v_s->>'min_use')::int, 0) THEN RAISE EXCEPTION 'MILEAGE_BELOW_MIN'; END IF;
    v_max_use := floor(v_after_coupon * COALESCE((v_s->>'max_use_pct')::numeric, 100) / 100.0 / v_pv)::int;
    IF v_use > v_max_use THEN RAISE EXCEPTION 'MILEAGE_OVER_MAX'; END IF;
    IF v_use > crm_mileage_balance(p_member_id) THEN RAISE EXCEPTION 'MILEAGE_INSUFFICIENT'; END IF;
  END IF;
  v_final := v_after_coupon - floor(v_use * v_pv)::int;
  IF v_final <= 0 THEN RAISE EXCEPTION 'ZERO_AMOUNT'; END IF;

  v_rate := CASE WHEN COALESCE((v_s->>'enabled')::boolean, true)
                 THEN COALESCE(v_p.mileage_rate, (v_s->>'default_rate')::numeric, 0) ELSE 0 END;
  v_earn := floor(v_final * v_rate / 100.0 / v_pv)::int;

  INSERT INTO payments (member_id, trainer_id, gym_product_id, product_name, session_count, amount, payment_method,
                        memo, processed_by, paid_at, start_date, end_date,
                        list_amount, coupon_discount, member_coupon_id, mileage_used, mileage_earned)
  VALUES (p_member_id, v_m.trainer_id, v_p.id, v_p.name, COALESCE(v_p.session_limit, 0), v_final, p_method,
          NULLIF(btrim(COALESCE(p_memo, '')), ''), p_processed_by, now(), p_start, p_end,
          p_list_amount, v_coupon_disc, p_member_coupon_id, v_use, v_earn)
  RETURNING id INTO v_pay_id;

  IF p_member_coupon_id IS NOT NULL THEN
    UPDATE member_coupons SET used_at = now(), used_payment_id = v_pay_id WHERE id = p_member_coupon_id;
  END IF;
  IF v_use > 0 THEN
    PERFORM crm_mileage_consume(p_member_id, v_use);
    INSERT INTO mileage_ledger (gym_id, member_id, kind, delta, payment_id, memo, created_by)
    VALUES (v_gym, p_member_id, 'use', -v_use, v_pay_id, v_p.name, v_me);
  END IF;
  IF v_earn > 0 THEN
    INSERT INTO mileage_lots (gym_id, member_id, amount, remaining, expires_at, source, payment_id)
    VALUES (v_gym, p_member_id, v_earn, v_earn, crm_mileage_expiry(v_gym), 'earn', v_pay_id);
    INSERT INTO mileage_ledger (gym_id, member_id, kind, delta, payment_id, memo, created_by)
    VALUES (v_gym, p_member_id, 'earn', v_earn, v_pay_id, v_p.name || ' (' || trim_scale(v_rate) || '%)', v_me);
  END IF;

  RETURN jsonb_build_object('payment_id', v_pay_id, 'amount', v_final, 'coupon_discount', v_coupon_disc,
                            'mileage_used', v_use, 'mileage_earned', v_earn);
END;
$$;

-- ── 환불 시 되돌리기 (payments.status → refunded) ─────────────────
CREATE OR REPLACE FUNCTION crm_benefits_on_refund() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gym uuid; v_reclaim integer := 0; v_lot mileage_lots%ROWTYPE; v_take integer;
BEGIN
  SELECT t.gym_id INTO v_gym FROM members m JOIN trainers t ON t.id = m.trainer_id WHERE m.id = NEW.member_id;
  IF v_gym IS NULL THEN RETURN NEW; END IF;

  -- 쿠폰 반환
  UPDATE member_coupons SET used_at = NULL, used_payment_id = NULL WHERE used_payment_id = NEW.id;

  -- 사용한 마일리지 반환
  IF COALESCE(NEW.mileage_used, 0) > 0 THEN
    INSERT INTO mileage_lots (gym_id, member_id, amount, remaining, expires_at, source, payment_id)
    VALUES (v_gym, NEW.member_id, NEW.mileage_used, NEW.mileage_used, crm_mileage_expiry(v_gym), 'refund_restore', NEW.id);
    INSERT INTO mileage_ledger (gym_id, member_id, kind, delta, payment_id, memo)
    VALUES (v_gym, NEW.member_id, 'refund_restore', NEW.mileage_used, NEW.id, COALESCE(NEW.product_name, '결제'));
  END IF;

  -- 적립분 회수: 그 결제 적립 묶음에서 먼저, 모자라면 다른 묶음에서 (잔액 한도까지)
  IF COALESCE(NEW.mileage_earned, 0) > 0 THEN
    SELECT * INTO v_lot FROM mileage_lots WHERE payment_id = NEW.id AND source = 'earn' FOR UPDATE;
    IF FOUND THEN
      v_take := LEAST(v_lot.remaining, NEW.mileage_earned);
      UPDATE mileage_lots SET remaining = remaining - v_take WHERE id = v_lot.id;
      v_reclaim := v_take;
    END IF;
    IF v_reclaim < NEW.mileage_earned THEN
      v_reclaim := v_reclaim + crm_mileage_consume(NEW.member_id, NEW.mileage_earned - v_reclaim);
    END IF;
    INSERT INTO mileage_ledger (gym_id, member_id, kind, delta, payment_id, memo)
    VALUES (v_gym, NEW.member_id, 'refund_reclaim', -v_reclaim, NEW.id,
            COALESCE(NEW.product_name, '결제') || CASE WHEN v_reclaim < NEW.mileage_earned
                                     THEN ' (이미 사용돼 ' || (NEW.mileage_earned - v_reclaim) || 'P 회수 못 함)' ELSE '' END);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_benefits_refund ON payments;
CREATE TRIGGER payments_benefits_refund
  AFTER UPDATE OF status ON payments
  FOR EACH ROW
  WHEN (NEW.status = 'refunded' AND COALESCE(OLD.status, 'active') <> 'refunded')
  EXECUTE FUNCTION crm_benefits_on_refund();

-- ── 내역 (권한자) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_benefit_ledger(p_gym_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM crm_assert_benefit_admin(p_gym_id);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('at', l.created_at, 'kind', l.kind, 'delta', l.delta, 'memo', l.memo,
                                        'member', m.name, 'by', t.name) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM mileage_ledger WHERE gym_id = p_gym_id ORDER BY created_at DESC LIMIT 300) l
      JOIN members m ON m.id = l.member_id
      LEFT JOIN trainers t ON t.id = l.created_by
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION crm_can_manage_benefits(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_benefit_settings(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_benefit_settings_save(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_coupon_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_coupon_save(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_issue_coupon(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_member_benefits(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_mileage_adjust(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_pay_with_benefits(uuid, uuid, integer, text, uuid, integer, text, uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION crm_benefit_ledger(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm_can_manage_benefits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_benefit_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_benefit_settings_save(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_coupon_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_coupon_save(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_issue_coupon(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_member_benefits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_mileage_adjust(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_pay_with_benefits(uuid, uuid, integer, text, uuid, integer, text, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION crm_benefit_ledger(uuid) TO authenticated;
