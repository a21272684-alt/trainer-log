-- ============================================================================
-- fix_rls_all_tables.sql
--
-- Step 3 RLS 전수 잠금 — Tier A~D (30+ 테이블) 보안 정책 전면 재구축.
-- 사전 처리: fix_rls_top3.sql 로 app_settings / market_item_contents / Storage 6버킷 처리 완료된 상태에서 실행.
--
-- 실행 위치: Supabase Dashboard → SQL Editor (한 번 실행)
-- 실행 전제:
--   - trainers.auth_id (text)         ← Supabase auth.uid() 와 매칭
--   - members.auth_id  (text)
--   - community_users.auth_id (text)
--   - gyms.owner_id → community_users.id
--   - members.trainer_id → trainers.id
--   - logs.trainer_id / member_id, payments.trainer_id / member_id ...
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 0. 정책 헬퍼 함수 (SECURITY DEFINER, STABLE)
-- ════════════════════════════════════════════════════════════════════════════
-- 각 정책에서 EXISTS 서브쿼리를 반복하지 않도록 헬퍼 함수로 통일.

CREATE OR REPLACE FUNCTION app_is_trainer_of(p_trainer_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trainers
     WHERE id = p_trainer_id
       AND auth_id::text = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION app_is_member(p_member_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM members
     WHERE id = p_member_id
       AND auth_id::text = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION app_is_community_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_users
     WHERE id = p_user_id
       AND auth_id::text = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION app_is_gym_owner(p_gym_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM gyms g
      JOIN community_users cu ON cu.id = g.owner_id
     WHERE g.id = p_gym_id
       AND cu.auth_id::text = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION app_is_trainer_in_gym(p_gym_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trainers
     WHERE gym_id = p_gym_id
       AND auth_id::text = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION app_member_belongs_to_my_trainer(p_member_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM members m
      JOIN trainers t ON t.id = m.trainer_id
     WHERE m.id = p_member_id
       AND t.auth_id::text = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION app_is_authenticated()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT auth.role() = 'authenticated';
$$;

CREATE OR REPLACE FUNCTION app_is_service_role()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT auth.role() = 'service_role';
$$;

REVOKE ALL ON FUNCTION app_is_trainer_of(uuid)                FROM PUBLIC;
REVOKE ALL ON FUNCTION app_is_member(uuid)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION app_is_community_user(uuid)            FROM PUBLIC;
REVOKE ALL ON FUNCTION app_is_gym_owner(uuid)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION app_is_trainer_in_gym(uuid)            FROM PUBLIC;
REVOKE ALL ON FUNCTION app_member_belongs_to_my_trainer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_is_authenticated()                 FROM PUBLIC;
REVOKE ALL ON FUNCTION app_is_service_role()                  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_is_trainer_of(uuid)                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_is_member(uuid)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_is_community_user(uuid)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_is_gym_owner(uuid)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_is_trainer_in_gym(uuid)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_member_belongs_to_my_trainer(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_is_authenticated()                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_is_service_role()                  TO anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. trainers — 본인 SELECT/UPDATE, INSERT 는 회원가입 흐름 허용
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainers_read"     ON trainers;
DROP POLICY IF EXISTS "trainers_insert"   ON trainers;
DROP POLICY IF EXISTS "trainers_update"   ON trainers;
DROP POLICY IF EXISTS "trainers_select_self_or_same_gym" ON trainers;
DROP POLICY IF EXISTS "trainers_insert_self"             ON trainers;
DROP POLICY IF EXISTS "trainers_update_self"             ON trainers;
DROP POLICY IF EXISTS "trainers_delete_self"             ON trainers;

CREATE POLICY "trainers_select_self_or_same_gym"
  ON trainers
  FOR SELECT
  USING (
    auth_id::text = auth.uid()::text
    OR (gym_id IS NOT NULL AND app_is_trainer_in_gym(gym_id))
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  );

CREATE POLICY "trainers_insert_self"
  ON trainers
  FOR INSERT
  WITH CHECK (
    auth_id::text = auth.uid()::text
    OR app_is_service_role()
  );

CREATE POLICY "trainers_update_self"
  ON trainers
  FOR UPDATE
  USING (auth_id::text = auth.uid()::text OR app_is_service_role())
  WITH CHECK (auth_id::text = auth.uid()::text OR app_is_service_role());

CREATE POLICY "trainers_delete_self"
  ON trainers
  FOR DELETE
  USING (auth_id::text = auth.uid()::text OR app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 2. members — 본인 또는 담당 트레이너만
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read"    ON members;
DROP POLICY IF EXISTS "members_insert"  ON members;
DROP POLICY IF EXISTS "members_update"  ON members;
DROP POLICY IF EXISTS "members_update2" ON members;
DROP POLICY IF EXISTS "members_select_self_or_trainer" ON members;
DROP POLICY IF EXISTS "members_insert_trainer"         ON members;
DROP POLICY IF EXISTS "members_update_self_or_trainer" ON members;
DROP POLICY IF EXISTS "members_delete_trainer"         ON members;

CREATE POLICY "members_select_self_or_trainer"
  ON members
  FOR SELECT
  USING (
    auth_id::text = auth.uid()::text
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "members_insert_trainer"
  ON members
  FOR INSERT
  WITH CHECK (
    app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "members_update_self_or_trainer"
  ON members
  FOR UPDATE
  USING (
    auth_id::text = auth.uid()::text
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  )
  WITH CHECK (
    auth_id::text = auth.uid()::text
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "members_delete_trainer"
  ON members
  FOR DELETE
  USING (
    app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 3. logs — 회원 본인(SELECT) + 담당 트레이너(전권)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logs_read"         ON logs;
DROP POLICY IF EXISTS "logs_public_read"  ON logs;
DROP POLICY IF EXISTS "logs_insert"       ON logs;
DROP POLICY IF EXISTS "logs_update"       ON logs;
DROP POLICY IF EXISTS "logs_select_owner_or_trainer" ON logs;
DROP POLICY IF EXISTS "logs_insert_trainer"          ON logs;
DROP POLICY IF EXISTS "logs_update_trainer_or_member" ON logs;
DROP POLICY IF EXISTS "logs_delete_trainer"          ON logs;

CREATE POLICY "logs_select_owner_or_trainer"
  ON logs
  FOR SELECT
  USING (
    app_is_trainer_of(trainer_id)
    OR app_is_member(member_id)
    OR app_is_service_role()
  );

CREATE POLICY "logs_insert_trainer"
  ON logs
  FOR INSERT
  WITH CHECK (
    app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "logs_update_trainer_or_member"
  ON logs
  FOR UPDATE
  USING (
    app_is_trainer_of(trainer_id)
    OR app_is_member(member_id)   -- 회원이 read_at / session_rating 갱신
    OR app_is_service_role()
  )
  WITH CHECK (
    app_is_trainer_of(trainer_id)
    OR app_is_member(member_id)
    OR app_is_service_role()
  );

CREATE POLICY "logs_delete_trainer"
  ON logs
  FOR DELETE
  USING (
    app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 4. health_records — 회원 본인 + 담당 트레이너
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_read"    ON health_records;
DROP POLICY IF EXISTS "health_insert"  ON health_records;
DROP POLICY IF EXISTS "health_update"  ON health_records;
DROP POLICY IF EXISTS "health_select_owner_or_trainer" ON health_records;
DROP POLICY IF EXISTS "health_write_owner_or_trainer"  ON health_records;
DROP POLICY IF EXISTS "health_delete_owner_or_trainer" ON health_records;

CREATE POLICY "health_select_owner_or_trainer"
  ON health_records
  FOR SELECT
  USING (
    app_is_member(member_id)
    OR app_member_belongs_to_my_trainer(member_id)
    OR app_is_service_role()
  );

CREATE POLICY "health_write_owner_or_trainer"
  ON health_records
  FOR INSERT
  WITH CHECK (
    app_is_member(member_id)
    OR app_member_belongs_to_my_trainer(member_id)
    OR app_is_service_role()
  );

CREATE POLICY "health_update_owner_or_trainer"
  ON health_records
  FOR UPDATE
  USING (
    app_is_member(member_id)
    OR app_member_belongs_to_my_trainer(member_id)
    OR app_is_service_role()
  )
  WITH CHECK (
    app_is_member(member_id)
    OR app_member_belongs_to_my_trainer(member_id)
    OR app_is_service_role()
  );

CREATE POLICY "health_delete_owner_or_trainer"
  ON health_records
  FOR DELETE
  USING (
    app_is_member(member_id)
    OR app_member_belongs_to_my_trainer(member_id)
    OR app_is_service_role()
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 5. workout_sessions / workout_routines — 회원 본인 + 담당 트레이너
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_workout_sessions" ON workout_sessions;
DROP POLICY IF EXISTS "ws_select_owner_or_trainer" ON workout_sessions;
DROP POLICY IF EXISTS "ws_insert_owner_or_trainer" ON workout_sessions;
DROP POLICY IF EXISTS "ws_update_owner_or_trainer" ON workout_sessions;
DROP POLICY IF EXISTS "ws_delete_owner_or_trainer" ON workout_sessions;

CREATE POLICY "ws_select_owner_or_trainer"
  ON workout_sessions
  FOR SELECT
  USING (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "ws_insert_owner_or_trainer"
  ON workout_sessions
  FOR INSERT
  WITH CHECK (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "ws_update_owner_or_trainer"
  ON workout_sessions
  FOR UPDATE
  USING (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  )
  WITH CHECK (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "ws_delete_owner_or_trainer"
  ON workout_sessions
  FOR DELETE
  USING (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

ALTER TABLE workout_routines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_workout_routines" ON workout_routines;
DROP POLICY IF EXISTS "wr_select_owner_or_trainer" ON workout_routines;
DROP POLICY IF EXISTS "wr_write_owner_or_trainer"  ON workout_routines;
DROP POLICY IF EXISTS "wr_update_owner_or_trainer" ON workout_routines;
DROP POLICY IF EXISTS "wr_delete_owner_or_trainer" ON workout_routines;

CREATE POLICY "wr_select_owner_or_trainer"
  ON workout_routines
  FOR SELECT
  USING (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "wr_write_owner_or_trainer"
  ON workout_routines
  FOR INSERT
  WITH CHECK (
    app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "wr_update_owner_or_trainer"
  ON workout_routines
  FOR UPDATE
  USING (
    app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  )
  WITH CHECK (
    app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "wr_delete_owner_or_trainer"
  ON workout_routines
  FOR DELETE
  USING (
    app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 6. attendance — 트레이너 전권 + 회원 SELECT
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_read"   ON attendance;
DROP POLICY IF EXISTS "attendance_insert" ON attendance;
DROP POLICY IF EXISTS "attendance_delete" ON attendance;
DROP POLICY IF EXISTS "att_select_owner_or_trainer" ON attendance;
DROP POLICY IF EXISTS "att_insert_trainer"          ON attendance;
DROP POLICY IF EXISTS "att_delete_trainer"          ON attendance;

CREATE POLICY "att_select_owner_or_trainer"
  ON attendance
  FOR SELECT
  USING (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "att_insert_trainer"
  ON attendance
  FOR INSERT
  WITH CHECK (
    app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "att_delete_trainer"
  ON attendance
  FOR DELETE
  USING (
    app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 7. products / payments / subscriptions — 트레이너 전권
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_read"   ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_delete" ON products;
DROP POLICY IF EXISTS "prod_select_trainer" ON products;
DROP POLICY IF EXISTS "prod_write_trainer"  ON products;
DROP POLICY IF EXISTS "prod_update_trainer" ON products;
DROP POLICY IF EXISTS "prod_delete_trainer" ON products;

CREATE POLICY "prod_select_trainer"
  ON products FOR SELECT
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "prod_write_trainer"
  ON products FOR INSERT
  WITH CHECK (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "prod_update_trainer"
  ON products FOR UPDATE
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role())
  WITH CHECK (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "prod_delete_trainer"
  ON products FOR DELETE
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role());

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_read"   ON payments;
DROP POLICY IF EXISTS "payments_insert" ON payments;
DROP POLICY IF EXISTS "payments_delete" ON payments;
DROP POLICY IF EXISTS "pay_select_trainer_or_member" ON payments;
DROP POLICY IF EXISTS "pay_insert_trainer"           ON payments;
DROP POLICY IF EXISTS "pay_update_trainer"           ON payments;
DROP POLICY IF EXISTS "pay_delete_trainer"           ON payments;

CREATE POLICY "pay_select_trainer_or_member"
  ON payments FOR SELECT
  USING (
    app_is_trainer_of(trainer_id)
    OR app_is_member(member_id)
    OR app_is_service_role()
  );

CREATE POLICY "pay_insert_trainer"
  ON payments FOR INSERT
  WITH CHECK (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "pay_update_trainer"
  ON payments FOR UPDATE
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role())
  WITH CHECK (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "pay_delete_trainer"
  ON payments FOR DELETE
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role());

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subs_read"   ON subscriptions;
DROP POLICY IF EXISTS "subs_insert" ON subscriptions;
DROP POLICY IF EXISTS "sub_select_trainer" ON subscriptions;
DROP POLICY IF EXISTS "sub_write_trainer"  ON subscriptions;
DROP POLICY IF EXISTS "sub_update_trainer" ON subscriptions;
DROP POLICY IF EXISTS "sub_delete_trainer" ON subscriptions;

CREATE POLICY "sub_select_trainer"
  ON subscriptions FOR SELECT
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "sub_write_trainer"
  ON subscriptions FOR INSERT
  WITH CHECK (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "sub_update_trainer"
  ON subscriptions FOR UPDATE
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role())
  WITH CHECK (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "sub_delete_trainer"
  ON subscriptions FOR DELETE
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 8. member_holds — 트레이너 전권
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE member_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainer_holds"           ON member_holds;
DROP POLICY IF EXISTS "allow_all_member_holds"  ON member_holds;
DROP POLICY IF EXISTS "holds_select_owner_or_trainer" ON member_holds;
DROP POLICY IF EXISTS "holds_write_trainer"           ON member_holds;
DROP POLICY IF EXISTS "holds_update_trainer"          ON member_holds;
DROP POLICY IF EXISTS "holds_delete_trainer"          ON member_holds;

CREATE POLICY "holds_select_owner_or_trainer"
  ON member_holds FOR SELECT
  USING (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "holds_write_trainer"
  ON member_holds FOR INSERT
  WITH CHECK (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "holds_update_trainer"
  ON member_holds FOR UPDATE
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role())
  WITH CHECK (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "holds_delete_trainer"
  ON member_holds FOR DELETE
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 9. settlements / settlement_items / settlement_snapshots — 본인 트레이너 + gym 대표
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlements_read"  ON settlements;
DROP POLICY IF EXISTS "settlements_write" ON settlements;
DROP POLICY IF EXISTS "set_select_self_or_owner" ON settlements;
DROP POLICY IF EXISTS "set_write_self_or_owner"  ON settlements;
DROP POLICY IF EXISTS "set_update_self_or_owner" ON settlements;
DROP POLICY IF EXISTS "set_delete_self_or_owner" ON settlements;

CREATE POLICY "set_select_self_or_owner"
  ON settlements FOR SELECT
  USING (
    app_is_trainer_of(trainer_id)
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  );

CREATE POLICY "set_write_self_or_owner"
  ON settlements FOR INSERT
  WITH CHECK (
    app_is_trainer_of(trainer_id)
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  );

CREATE POLICY "set_update_self_or_owner"
  ON settlements FOR UPDATE
  USING (
    app_is_trainer_of(trainer_id)
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  )
  WITH CHECK (
    app_is_trainer_of(trainer_id)
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  );

CREATE POLICY "set_delete_self_or_owner"
  ON settlements FOR DELETE
  USING (
    app_is_trainer_of(trainer_id)
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  );

ALTER TABLE settlement_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sitems_read"  ON settlement_items;
DROP POLICY IF EXISTS "sitems_write" ON settlement_items;
DROP POLICY IF EXISTS "sitems_select_via_settlement" ON settlement_items;
DROP POLICY IF EXISTS "sitems_write_via_settlement"  ON settlement_items;
DROP POLICY IF EXISTS "sitems_update_via_settlement" ON settlement_items;
DROP POLICY IF EXISTS "sitems_delete_via_settlement" ON settlement_items;

CREATE POLICY "sitems_select_via_settlement"
  ON settlement_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM settlements s
      WHERE s.id = settlement_items.settlement_id
        AND (
          app_is_trainer_of(s.trainer_id)
          OR (s.gym_id IS NOT NULL AND app_is_gym_owner(s.gym_id))
        )
    )
    OR app_is_service_role()
  );

CREATE POLICY "sitems_write_via_settlement"
  ON settlement_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM settlements s
      WHERE s.id = settlement_items.settlement_id
        AND (
          app_is_trainer_of(s.trainer_id)
          OR (s.gym_id IS NOT NULL AND app_is_gym_owner(s.gym_id))
        )
    )
    OR app_is_service_role()
  );

CREATE POLICY "sitems_update_via_settlement"
  ON settlement_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM settlements s
      WHERE s.id = settlement_items.settlement_id
        AND (
          app_is_trainer_of(s.trainer_id)
          OR (s.gym_id IS NOT NULL AND app_is_gym_owner(s.gym_id))
        )
    )
    OR app_is_service_role()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM settlements s
      WHERE s.id = settlement_items.settlement_id
        AND (
          app_is_trainer_of(s.trainer_id)
          OR (s.gym_id IS NOT NULL AND app_is_gym_owner(s.gym_id))
        )
    )
    OR app_is_service_role()
  );

CREATE POLICY "sitems_delete_via_settlement"
  ON settlement_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM settlements s
      WHERE s.id = settlement_items.settlement_id
        AND (
          app_is_trainer_of(s.trainer_id)
          OR (s.gym_id IS NOT NULL AND app_is_gym_owner(s.gym_id))
        )
    )
    OR app_is_service_role()
  );

ALTER TABLE settlement_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snaps_read"        ON settlement_snapshots;
DROP POLICY IF EXISTS "snaps_insert"      ON settlement_snapshots;
DROP POLICY IF EXISTS "snaps_update_link" ON settlement_snapshots;
DROP POLICY IF EXISTS "snap_select_self_or_owner" ON settlement_snapshots;
DROP POLICY IF EXISTS "snap_insert_self_or_owner" ON settlement_snapshots;
DROP POLICY IF EXISTS "snap_update_self_or_owner" ON settlement_snapshots;
DROP POLICY IF EXISTS "snap_delete_self_or_owner" ON settlement_snapshots;

CREATE POLICY "snap_select_self_or_owner"
  ON settlement_snapshots FOR SELECT
  USING (
    app_is_trainer_of(trainer_id)
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  );

CREATE POLICY "snap_insert_self_or_owner"
  ON settlement_snapshots FOR INSERT
  WITH CHECK (
    app_is_trainer_of(trainer_id)
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  );

CREATE POLICY "snap_update_self_or_owner"
  ON settlement_snapshots FOR UPDATE
  USING (
    app_is_trainer_of(trainer_id)
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  )
  WITH CHECK (
    app_is_trainer_of(trainer_id)
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  );

CREATE POLICY "snap_delete_self_or_owner"
  ON settlement_snapshots FOR DELETE
  USING (
    app_is_trainer_of(trainer_id)
    OR (gym_id IS NOT NULL AND app_is_gym_owner(gym_id))
    OR app_is_service_role()
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 10. gyms — read public, write owner only
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gyms_read"  ON gyms;
DROP POLICY IF EXISTS "gyms_write" ON gyms;
DROP POLICY IF EXISTS "gyms_select_public" ON gyms;
DROP POLICY IF EXISTS "gyms_insert_owner"  ON gyms;
DROP POLICY IF EXISTS "gyms_update_owner"  ON gyms;
DROP POLICY IF EXISTS "gyms_delete_owner"  ON gyms;

CREATE POLICY "gyms_select_public"
  ON gyms FOR SELECT
  USING (true);

CREATE POLICY "gyms_insert_owner"
  ON gyms FOR INSERT
  WITH CHECK (
    -- 신규 센터 개설 시 owner 본인이거나 service_role
    (owner_id IS NOT NULL AND app_is_community_user(owner_id))
    OR app_is_service_role()
  );

CREATE POLICY "gyms_update_owner"
  ON gyms FOR UPDATE
  USING (
    (owner_id IS NOT NULL AND app_is_community_user(owner_id))
    OR app_is_service_role()
  )
  WITH CHECK (
    (owner_id IS NOT NULL AND app_is_community_user(owner_id))
    OR app_is_service_role()
  );

CREATE POLICY "gyms_delete_owner"
  ON gyms FOR DELETE
  USING (
    (owner_id IS NOT NULL AND app_is_community_user(owner_id))
    OR app_is_service_role()
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 11. gym_products / trainer_ranks / gym_ranks — 같은 센터만
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE gym_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gym_products_select" ON gym_products;
DROP POLICY IF EXISTS "gym_products_insert" ON gym_products;
DROP POLICY IF EXISTS "gym_products_update" ON gym_products;
DROP POLICY IF EXISTS "gym_products_delete" ON gym_products;
DROP POLICY IF EXISTS "gp_select_in_gym" ON gym_products;
DROP POLICY IF EXISTS "gp_write_owner_or_trainer" ON gym_products;
DROP POLICY IF EXISTS "gp_update_owner_or_trainer" ON gym_products;
DROP POLICY IF EXISTS "gp_delete_owner_or_trainer" ON gym_products;

CREATE POLICY "gp_select_in_gym"
  ON gym_products FOR SELECT
  USING (
    app_is_trainer_in_gym(gym_id)
    OR app_is_gym_owner(gym_id)
    OR app_is_service_role()
  );

CREATE POLICY "gp_write_owner_or_trainer"
  ON gym_products FOR INSERT
  WITH CHECK (
    app_is_gym_owner(gym_id)
    OR app_is_trainer_in_gym(gym_id)
    OR app_is_service_role()
  );

CREATE POLICY "gp_update_owner_or_trainer"
  ON gym_products FOR UPDATE
  USING (
    app_is_gym_owner(gym_id)
    OR app_is_trainer_in_gym(gym_id)
    OR app_is_service_role()
  )
  WITH CHECK (
    app_is_gym_owner(gym_id)
    OR app_is_trainer_in_gym(gym_id)
    OR app_is_service_role()
  );

CREATE POLICY "gp_delete_owner_or_trainer"
  ON gym_products FOR DELETE
  USING (
    app_is_gym_owner(gym_id)
    OR app_is_trainer_in_gym(gym_id)
    OR app_is_service_role()
  );

-- trainer_ranks 는 직급 코드 마스터 테이블(code, label, base_salary, default_incentive_rate, sort_order).
-- 센터별 분리 컬럼(gym_id) 없음 → 인증 사용자 SELECT 공개, 쓰기는 service_role 만 허용.
ALTER TABLE trainer_ranks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ranks_read"  ON trainer_ranks;
DROP POLICY IF EXISTS "ranks_write" ON trainer_ranks;
DROP POLICY IF EXISTS "tr_select_in_gym"        ON trainer_ranks;
DROP POLICY IF EXISTS "tr_write_owner"          ON trainer_ranks;
DROP POLICY IF EXISTS "tr_update_owner"         ON trainer_ranks;
DROP POLICY IF EXISTS "tr_delete_owner"         ON trainer_ranks;
DROP POLICY IF EXISTS "tr_select_authenticated" ON trainer_ranks;
DROP POLICY IF EXISTS "tr_write_service_role"   ON trainer_ranks;

CREATE POLICY "tr_select_authenticated"
  ON trainer_ranks FOR SELECT
  USING (app_is_authenticated() OR app_is_service_role());

CREATE POLICY "tr_write_service_role"
  ON trainer_ranks FOR ALL
  USING (app_is_service_role())
  WITH CHECK (app_is_service_role());

ALTER TABLE gym_ranks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gym_ranks_read"   ON gym_ranks;
DROP POLICY IF EXISTS "gym_ranks_insert" ON gym_ranks;
DROP POLICY IF EXISTS "gym_ranks_update" ON gym_ranks;
DROP POLICY IF EXISTS "gym_ranks_delete" ON gym_ranks;
DROP POLICY IF EXISTS "gr_select_in_gym" ON gym_ranks;
DROP POLICY IF EXISTS "gr_write_owner"   ON gym_ranks;
DROP POLICY IF EXISTS "gr_update_owner"  ON gym_ranks;
DROP POLICY IF EXISTS "gr_delete_owner"  ON gym_ranks;

CREATE POLICY "gr_select_in_gym"
  ON gym_ranks FOR SELECT
  USING (
    app_is_trainer_in_gym(gym_id)
    OR app_is_gym_owner(gym_id)
    OR app_is_service_role()
  );

CREATE POLICY "gr_write_owner"
  ON gym_ranks FOR INSERT
  WITH CHECK (app_is_gym_owner(gym_id) OR app_is_service_role());

CREATE POLICY "gr_update_owner"
  ON gym_ranks FOR UPDATE
  USING (app_is_gym_owner(gym_id) OR app_is_service_role())
  WITH CHECK (app_is_gym_owner(gym_id) OR app_is_service_role());

CREATE POLICY "gr_delete_owner"
  ON gym_ranks FOR DELETE
  USING (app_is_gym_owner(gym_id) OR app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 12. rental_fees — 본인 트레이너 + gym 대표
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE rental_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_fees_all"        ON rental_fees;
DROP POLICY IF EXISTS "rf_select_self_or_owner" ON rental_fees;
DROP POLICY IF EXISTS "rf_write_owner"          ON rental_fees;
DROP POLICY IF EXISTS "rf_update_owner"         ON rental_fees;
DROP POLICY IF EXISTS "rf_delete_owner"         ON rental_fees;

CREATE POLICY "rf_select_self_or_owner"
  ON rental_fees FOR SELECT
  USING (
    app_is_trainer_of(trainer_id)
    OR app_is_gym_owner(gym_id)
    OR app_is_service_role()
  );

CREATE POLICY "rf_write_owner"
  ON rental_fees FOR INSERT
  WITH CHECK (app_is_gym_owner(gym_id) OR app_is_service_role());

CREATE POLICY "rf_update_owner"
  ON rental_fees FOR UPDATE
  USING (app_is_gym_owner(gym_id) OR app_is_service_role())
  WITH CHECK (app_is_gym_owner(gym_id) OR app_is_service_role());

CREATE POLICY "rf_delete_owner"
  ON rental_fees FOR DELETE
  USING (app_is_gym_owner(gym_id) OR app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 13. community_users — public select, 본인만 INSERT/UPDATE
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE community_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_community_users" ON community_users;
DROP POLICY IF EXISTS "cu_select_public" ON community_users;
DROP POLICY IF EXISTS "cu_insert_self"   ON community_users;
DROP POLICY IF EXISTS "cu_update_self"   ON community_users;
DROP POLICY IF EXISTS "cu_delete_self"   ON community_users;

CREATE POLICY "cu_select_public"
  ON community_users FOR SELECT
  USING (true);

CREATE POLICY "cu_insert_self"
  ON community_users FOR INSERT
  WITH CHECK (
    auth_id::text = auth.uid()::text
    OR app_is_service_role()
  );

CREATE POLICY "cu_update_self"
  ON community_users FOR UPDATE
  USING (auth_id::text = auth.uid()::text OR app_is_service_role())
  WITH CHECK (
    -- 본인은 admin_permissions 자기 격상 차단 불가하므로 추가 트리거가 필요할 수 있으나,
    -- 1차 방어로 본인 행 수정만 허용한다.
    auth_id::text = auth.uid()::text
    OR app_is_service_role()
  );

CREATE POLICY "cu_delete_self"
  ON community_users FOR DELETE
  USING (auth_id::text = auth.uid()::text OR app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 14. community_posts / post_reactions — 작성자 전권 + authenticated SELECT
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_community_posts" ON community_posts;
DROP POLICY IF EXISTS "cp_select_authenticated"   ON community_posts;
DROP POLICY IF EXISTS "cp_insert_self"            ON community_posts;
DROP POLICY IF EXISTS "cp_update_self"            ON community_posts;
DROP POLICY IF EXISTS "cp_delete_self"            ON community_posts;

CREATE POLICY "cp_select_authenticated"
  ON community_posts FOR SELECT
  USING (
    app_is_authenticated()
    OR app_is_service_role()
  );

CREATE POLICY "cp_insert_self"
  ON community_posts FOR INSERT
  WITH CHECK (
    app_is_community_user(user_id)
    OR app_is_service_role()
  );

CREATE POLICY "cp_update_self"
  ON community_posts FOR UPDATE
  USING (
    app_is_community_user(user_id)
    OR app_is_service_role()
  )
  WITH CHECK (
    app_is_community_user(user_id)
    OR app_is_service_role()
  );

CREATE POLICY "cp_delete_self"
  ON community_posts FOR DELETE
  USING (
    app_is_community_user(user_id)
    OR app_is_service_role()
  );

ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_post_reactions" ON post_reactions;
DROP POLICY IF EXISTS "pr_select_authenticated"  ON post_reactions;
DROP POLICY IF EXISTS "pr_insert_self_member"    ON post_reactions;
DROP POLICY IF EXISTS "pr_delete_self_member"    ON post_reactions;

CREATE POLICY "pr_select_authenticated"
  ON post_reactions FOR SELECT
  USING (app_is_authenticated() OR app_is_service_role());

CREATE POLICY "pr_insert_self_member"
  ON post_reactions FOR INSERT
  WITH CHECK (app_is_member(member_id) OR app_is_service_role());

CREATE POLICY "pr_delete_self_member"
  ON post_reactions FOR DELETE
  USING (app_is_member(member_id) OR app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 15. member_posts / member_reactions — 회원 본인 + 담당 트레이너
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE member_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_member_posts" ON member_posts;
DROP POLICY IF EXISTS "mp_select_authenticated" ON member_posts;
DROP POLICY IF EXISTS "mp_insert_self_member"   ON member_posts;
DROP POLICY IF EXISTS "mp_update_self_or_trainer" ON member_posts;
DROP POLICY IF EXISTS "mp_delete_self_or_trainer" ON member_posts;

CREATE POLICY "mp_select_authenticated"
  ON member_posts FOR SELECT
  USING (app_is_authenticated() OR app_is_service_role());

CREATE POLICY "mp_insert_self_member"
  ON member_posts FOR INSERT
  WITH CHECK (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "mp_update_self_or_trainer"
  ON member_posts FOR UPDATE
  USING (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  )
  WITH CHECK (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

CREATE POLICY "mp_delete_self_or_trainer"
  ON member_posts FOR DELETE
  USING (
    app_is_member(member_id)
    OR app_is_trainer_of(trainer_id)
    OR app_is_service_role()
  );

ALTER TABLE member_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_member_reactions" ON member_reactions;
DROP POLICY IF EXISTS "mr_select_authenticated"    ON member_reactions;
DROP POLICY IF EXISTS "mr_insert_self_member"      ON member_reactions;
DROP POLICY IF EXISTS "mr_delete_self_member"      ON member_reactions;

CREATE POLICY "mr_select_authenticated"
  ON member_reactions FOR SELECT
  USING (app_is_authenticated() OR app_is_service_role());

CREATE POLICY "mr_insert_self_member"
  ON member_reactions FOR INSERT
  WITH CHECK (app_is_member(member_id) OR app_is_service_role());

CREATE POLICY "mr_delete_self_member"
  ON member_reactions FOR DELETE
  USING (app_is_member(member_id) OR app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 16. community_contacts — 게시글 작성자 + 본인 컨택
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE community_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cc_select_author_or_self" ON community_contacts;
DROP POLICY IF EXISTS "cc_insert_self"           ON community_contacts;
DROP POLICY IF EXISTS "cc_update_author"         ON community_contacts;
DROP POLICY IF EXISTS "cc_delete_author_or_self" ON community_contacts;

CREATE POLICY "cc_select_author_or_self"
  ON community_contacts FOR SELECT
  USING (
    app_is_community_user(requester_id)
    OR EXISTS (
      SELECT 1 FROM community_posts cp
      WHERE cp.id = community_contacts.post_id
        AND app_is_community_user(cp.user_id)
    )
    OR app_is_service_role()
  );

CREATE POLICY "cc_insert_self"
  ON community_contacts FOR INSERT
  WITH CHECK (
    app_is_community_user(requester_id)
    OR app_is_service_role()
  );

CREATE POLICY "cc_update_author"
  ON community_contacts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM community_posts cp
      WHERE cp.id = community_contacts.post_id
        AND app_is_community_user(cp.user_id)
    )
    OR app_is_service_role()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_posts cp
      WHERE cp.id = community_contacts.post_id
        AND app_is_community_user(cp.user_id)
    )
    OR app_is_service_role()
  );

CREATE POLICY "cc_delete_author_or_self"
  ON community_contacts FOR DELETE
  USING (
    app_is_community_user(requester_id)
    OR EXISTS (
      SELECT 1 FROM community_posts cp
      WHERE cp.id = community_contacts.post_id
        AND app_is_community_user(cp.user_id)
    )
    OR app_is_service_role()
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 17. routine_templates / routine_template_applications — 판매자 + 적용 트레이너
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE routine_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rt_read"   ON routine_templates;
DROP POLICY IF EXISTS "rt_insert" ON routine_templates;
DROP POLICY IF EXISTS "rt_update" ON routine_templates;
DROP POLICY IF EXISTS "rt_delete" ON routine_templates;
DROP POLICY IF EXISTS "rt_select_authenticated" ON routine_templates;
DROP POLICY IF EXISTS "rt_write_seller"         ON routine_templates;
DROP POLICY IF EXISTS "rt_update_seller"        ON routine_templates;
DROP POLICY IF EXISTS "rt_delete_seller"        ON routine_templates;

CREATE POLICY "rt_select_authenticated"
  ON routine_templates FOR SELECT
  USING (app_is_authenticated() OR app_is_service_role());

CREATE POLICY "rt_write_seller"
  ON routine_templates FOR INSERT
  WITH CHECK (app_is_community_user(seller_id) OR app_is_service_role());

CREATE POLICY "rt_update_seller"
  ON routine_templates FOR UPDATE
  USING (app_is_community_user(seller_id) OR app_is_service_role())
  WITH CHECK (app_is_community_user(seller_id) OR app_is_service_role());

CREATE POLICY "rt_delete_seller"
  ON routine_templates FOR DELETE
  USING (app_is_community_user(seller_id) OR app_is_service_role());

ALTER TABLE routine_template_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rta_read"   ON routine_template_applications;
DROP POLICY IF EXISTS "rta_insert" ON routine_template_applications;
DROP POLICY IF EXISTS "rta_select_self_or_seller" ON routine_template_applications;
DROP POLICY IF EXISTS "rta_write_trainer"         ON routine_template_applications;
DROP POLICY IF EXISTS "rta_delete_trainer"        ON routine_template_applications;

CREATE POLICY "rta_select_self_or_seller"
  ON routine_template_applications FOR SELECT
  USING (
    app_is_trainer_of(trainer_id)
    OR EXISTS (
      SELECT 1 FROM routine_templates rt
      WHERE rt.id = routine_template_applications.template_id
        AND app_is_community_user(rt.seller_id)
    )
    OR app_is_service_role()
  );

CREATE POLICY "rta_write_trainer"
  ON routine_template_applications FOR INSERT
  WITH CHECK (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "rta_delete_trainer"
  ON routine_template_applications FOR DELETE
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 18. notices — public read, write service_role only
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_notices" ON notices;
DROP POLICY IF EXISTS "notices_select_public"      ON notices;
DROP POLICY IF EXISTS "notices_write_service_role" ON notices;

CREATE POLICY "notices_select_public"
  ON notices FOR SELECT
  USING (true);

CREATE POLICY "notices_write_service_role"
  ON notices FOR ALL
  USING (app_is_service_role())
  WITH CHECK (app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 19. inquiries — 카카오 우회 후 deprecated. 본인 트레이너만 접근.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_inquiries" ON inquiries;
DROP POLICY IF EXISTS "inq_select_trainer"  ON inquiries;
DROP POLICY IF EXISTS "inq_insert_trainer"  ON inquiries;
DROP POLICY IF EXISTS "inq_update_service"  ON inquiries;
DROP POLICY IF EXISTS "inq_delete_service"  ON inquiries;

CREATE POLICY "inq_select_trainer"
  ON inquiries FOR SELECT
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "inq_insert_trainer"
  ON inquiries FOR INSERT
  WITH CHECK (app_is_trainer_of(trainer_id) OR app_is_service_role());

CREATE POLICY "inq_update_service"
  ON inquiries FOR UPDATE
  USING (app_is_service_role())
  WITH CHECK (app_is_service_role());

CREATE POLICY "inq_delete_service"
  ON inquiries FOR DELETE
  USING (app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 20. gym_weekly_reports — gym owner SELECT, write service_role only
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE gym_weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_read"   ON gym_weekly_reports;
DROP POLICY IF EXISTS "report_insert" ON gym_weekly_reports;
DROP POLICY IF EXISTS "report_update" ON gym_weekly_reports;
DROP POLICY IF EXISTS "gwr_select_owner_or_trainer" ON gym_weekly_reports;
DROP POLICY IF EXISTS "gwr_write_service_role"      ON gym_weekly_reports;

CREATE POLICY "gwr_select_owner_or_trainer"
  ON gym_weekly_reports FOR SELECT
  USING (
    app_is_gym_owner(gym_id)
    OR app_is_trainer_in_gym(gym_id)
    OR app_is_service_role()
  );

CREATE POLICY "gwr_write_service_role"
  ON gym_weekly_reports FOR ALL
  USING (app_is_service_role())
  WITH CHECK (app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 21. member_risk_scores — 트레이너 SELECT, write service_role only
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE member_risk_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "risk_read"   ON member_risk_scores;
DROP POLICY IF EXISTS "risk_insert" ON member_risk_scores;
DROP POLICY IF EXISTS "risk_upsert" ON member_risk_scores;
DROP POLICY IF EXISTS "risk_delete" ON member_risk_scores;
DROP POLICY IF EXISTS "mrs_select_trainer_or_member" ON member_risk_scores;
DROP POLICY IF EXISTS "mrs_write_service_role"       ON member_risk_scores;

CREATE POLICY "mrs_select_trainer_or_member"
  ON member_risk_scores FOR SELECT
  USING (
    app_is_trainer_of(trainer_id)
    OR app_is_member(member_id)
    OR app_is_service_role()
  );

CREATE POLICY "mrs_write_service_role"
  ON member_risk_scores FOR ALL
  USING (app_is_service_role())
  WITH CHECK (app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 22. ai_usage — 트레이너 본인 + service_role
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_all" ON ai_usage;
DROP POLICY IF EXISTS "aiu_select_trainer" ON ai_usage;
DROP POLICY IF EXISTS "aiu_write_service"  ON ai_usage;

CREATE POLICY "aiu_select_trainer"
  ON ai_usage FOR SELECT
  USING (app_is_trainer_of(trainer_id) OR app_is_service_role());

-- 카운터 갱신은 RPC(consume_ai_credit) SECURITY DEFINER 가 처리하므로
-- 직접 INSERT/UPDATE/DELETE 는 service_role 만 허용.
CREATE POLICY "aiu_write_service"
  ON ai_usage FOR ALL
  USING (app_is_service_role())
  WITH CHECK (app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 23. diet_logs — 회원 본인 + 담당 트레이너
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE diet_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diet_logs_all" ON diet_logs;
DROP POLICY IF EXISTS "dl_select_owner_or_trainer" ON diet_logs;
DROP POLICY IF EXISTS "dl_write_owner_or_trainer"  ON diet_logs;
DROP POLICY IF EXISTS "dl_update_owner_or_trainer" ON diet_logs;
DROP POLICY IF EXISTS "dl_delete_owner_or_trainer" ON diet_logs;

CREATE POLICY "dl_select_owner_or_trainer"
  ON diet_logs FOR SELECT
  USING (
    app_is_member(member_id)
    OR app_member_belongs_to_my_trainer(member_id)
    OR app_is_service_role()
  );

CREATE POLICY "dl_write_owner_or_trainer"
  ON diet_logs FOR INSERT
  WITH CHECK (
    app_is_member(member_id)
    OR app_member_belongs_to_my_trainer(member_id)
    OR app_is_service_role()
  );

CREATE POLICY "dl_update_owner_or_trainer"
  ON diet_logs FOR UPDATE
  USING (
    app_is_member(member_id)
    OR app_member_belongs_to_my_trainer(member_id)
    OR app_is_service_role()
  )
  WITH CHECK (
    app_is_member(member_id)
    OR app_member_belongs_to_my_trainer(member_id)
    OR app_is_service_role()
  );

CREATE POLICY "dl_delete_owner_or_trainer"
  ON diet_logs FOR DELETE
  USING (
    app_is_member(member_id)
    OR app_member_belongs_to_my_trainer(member_id)
    OR app_is_service_role()
  );


-- ════════════════════════════════════════════════════════════════════════════
-- 24. diet_templates — member_id 가 TEXT 타입(uuid::text 캐스팅 비교)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE diet_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diet_templates_all" ON diet_templates;
DROP POLICY IF EXISTS "dt_select_owner"    ON diet_templates;
DROP POLICY IF EXISTS "dt_write_owner"     ON diet_templates;
DROP POLICY IF EXISTS "dt_update_owner"    ON diet_templates;
DROP POLICY IF EXISTS "dt_delete_owner"    ON diet_templates;

-- 헬퍼: text member_id → uuid 변환 후 본인 검증
CREATE OR REPLACE FUNCTION app_is_member_text(p_member_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uuid uuid;
BEGIN
  BEGIN
    v_uuid := p_member_id::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN app_is_member(v_uuid);
END;
$$;

REVOKE ALL ON FUNCTION app_is_member_text(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_member_text(text) TO anon, authenticated;

CREATE POLICY "dt_select_owner"
  ON diet_templates FOR SELECT
  USING (app_is_member_text(member_id) OR app_is_service_role());

CREATE POLICY "dt_write_owner"
  ON diet_templates FOR INSERT
  WITH CHECK (app_is_member_text(member_id) OR app_is_service_role());

CREATE POLICY "dt_update_owner"
  ON diet_templates FOR UPDATE
  USING (app_is_member_text(member_id) OR app_is_service_role())
  WITH CHECK (app_is_member_text(member_id) OR app_is_service_role());

CREATE POLICY "dt_delete_owner"
  ON diet_templates FOR DELETE
  USING (app_is_member_text(member_id) OR app_is_service_role());


-- ════════════════════════════════════════════════════════════════════════════
-- 25. global_exercises / food_master — 마스터 데이터(이미 양호하나 명시 보강)
-- ════════════════════════════════════════════════════════════════════════════
-- 이미 좁혀진 정책 사용 중이므로 변경 없음. 본 스크립트에선 손대지 않음.


-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리 (수동 실행)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT tablename, policyname, cmd
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN (
--      'trainers','members','logs','health_records','workout_sessions','workout_routines',
--      'attendance','products','payments','subscriptions','member_holds',
--      'settlements','settlement_items','settlement_snapshots',
--      'gyms','gym_products','trainer_ranks','gym_ranks','rental_fees',
--      'community_users','community_posts','post_reactions','member_posts','member_reactions',
--      'community_contacts','routine_templates','routine_template_applications',
--      'notices','inquiries','gym_weekly_reports','member_risk_scores','ai_usage',
--      'diet_logs','diet_templates'
--    )
--  ORDER BY tablename, cmd, policyname;
