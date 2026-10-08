-- ============================================================
-- 076_account_deletion.sql — 인앱 계정 삭제
-- App Store 심사 5.1.1(v) / Google Play 요구: 로그인 사용자가 앱 안에서
-- 본인 계정+데이터를 직접 삭제할 수 있어야 함.
--
-- 구성:
--  (1) trainers / members 를 참조하는 FK 중 ON DELETE 동작이 없는(NO ACTION/RESTRICT)
--      것을 CASCADE 로 전환 → 루트(트레이너/회원) 행 삭제 시 하위 데이터 자동 정리.
--      (이미 CASCADE/SET NULL 인 FK 는 건드리지 않음)
--  (2) 본인 계정 삭제 RPC delete_my_account() — authenticated 전용.
-- ============================================================

-- (1) no-action/restrict FK → cascade 전환 (public 스키마에서 trainers/members 참조)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname,
           cl.relname               AS child_table,
           pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class     cl ON cl.oid = con.conrelid
    JOIN pg_class     rf ON rf.oid = con.confrelid
    JOIN pg_namespace n  ON n.oid  = cl.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname  = 'public'
      AND rf.relname IN ('trainers', 'members')
      AND con.confdeltype IN ('a', 'r')   -- a=NO ACTION, r=RESTRICT (이미 c/n 인 것은 제외)
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.child_table, r.conname);
    -- pg_get_constraintdef 결과(예: FOREIGN KEY (trainer_id) REFERENCES trainers(id))에
    -- ON DELETE CASCADE 를 덧붙여 재생성.
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s ON DELETE CASCADE',
                   r.child_table, r.conname, r.def);
    RAISE NOTICE 'FK % on %: NO ACTION → CASCADE', r.conname, r.child_table;
  END LOOP;
END $$;

-- (2) 본인 계정 삭제 RPC
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION '로그인 상태가 아닙니다.';
  END IF;

  -- 업로드 파일(사진 등) best-effort 삭제. 실패해도 계정 삭제는 계속 진행.
  BEGIN
    DELETE FROM storage.objects WHERE owner = uid;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 앱 데이터: 트레이너/회원 루트 행 삭제 → FK CASCADE 로 하위(회원·일지·운동·결제 등) 정리.
  -- 한 계정이 트레이너이자 회원일 가능성은 없지만, 양쪽 모두 시도해 안전하게 정리.
  DELETE FROM public.trainers WHERE auth_id = uid;
  DELETE FROM public.members  WHERE auth_id = uid;

  -- 인증 계정 삭제 → 로그인 불가(계정 영구 삭제).
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- anon/public 은 호출 불가, 로그인 사용자만.
REVOKE ALL ON FUNCTION public.delete_my_account() FROM public;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
