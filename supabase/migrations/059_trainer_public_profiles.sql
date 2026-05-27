-- 059_trainer_public_profiles.sql
-- 트레이너 공개 프로필 + 회원 변화(비포애프터) + 익명 상담 이벤트 — 스키마 기반.
-- 설계: docs/trainer-public-profile-design.md
--
-- 성격: 전부 신규 테이블/버킷 추가 → 기존 운영 앱 영향 0 (언제든 적용 가능).
-- trainers/members.auth_id = uuid (050 확인) → RLS는 auth.uid() = auth_id 직접 비교.
-- 집계 RPC(오운 인증 데이터)는 logs/attendance 스키마 확인 후 별도 마이그(060).

-- ============================================================
-- 1. trainer_profiles — 1 트레이너 1 공개 프로필
-- ============================================================
CREATE TABLE IF NOT EXISTS trainer_profiles (
  trainer_id  uuid PRIMARY KEY REFERENCES trainers(id) ON DELETE CASCADE,
  handle      text UNIQUE NOT NULL,
  is_public   boolean NOT NULL DEFAULT false,
  tagline     text,
  bio         text,
  specialties text[] DEFAULT '{}',
  location    text,
  photo_url   text,
  kakao_link  text,
  show_stats  boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE trainer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tp_public_read" ON trainer_profiles;
CREATE POLICY "tp_public_read" ON trainer_profiles
  FOR SELECT TO anon, authenticated
  USING (is_public = true);

DROP POLICY IF EXISTS "tp_owner_all" ON trainer_profiles;
CREATE POLICY "tp_owner_all" ON trainer_profiles
  FOR ALL TO authenticated
  USING      (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()));

-- ============================================================
-- 2. trainer_packages — 수업/가격 (트레이너 직접 CRUD, 오운 정산 X)
-- ============================================================
CREATE TABLE IF NOT EXISTS trainer_packages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id  uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  price       integer NOT NULL DEFAULT 0 CHECK (price >= 0),
  sessions    integer,
  description text,
  sort        integer DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE trainer_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pkg_public_read" ON trainer_packages;
CREATE POLICY "pkg_public_read" ON trainer_packages
  FOR SELECT TO anon, authenticated
  USING (active = true
         AND trainer_id IN (SELECT trainer_id FROM trainer_profiles WHERE is_public = true));

DROP POLICY IF EXISTS "pkg_owner_all" ON trainer_packages;
CREATE POLICY "pkg_owner_all" ON trainer_packages
  FOR ALL TO authenticated
  USING      (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()))
  WITH CHECK (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()));

-- ============================================================
-- 3. member_transformations — 비포애프터 + 회원 동의(opt-in/revoke)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_transformations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id     uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  member_id      uuid NOT NULL REFERENCES members(id)  ON DELETE CASCADE,
  before_url     text,
  after_url      text,
  duration_label text,
  result_label   text,
  face_hidden    boolean NOT NULL DEFAULT true,
  consent        boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','revoked')),
  created_at     timestamptz DEFAULT now(),
  consented_at   timestamptz
);
ALTER TABLE member_transformations ENABLE ROW LEVEL SECURITY;

-- 공개: 동의 + published + 부모 프로필 공개
DROP POLICY IF EXISTS "mt_public_read" ON member_transformations;
CREATE POLICY "mt_public_read" ON member_transformations
  FOR SELECT TO anon, authenticated
  USING (consent = true AND status = 'published'
         AND trainer_id IN (SELECT trainer_id FROM trainer_profiles WHERE is_public = true));

-- 회원 본인: 업로드·동의·내리기
DROP POLICY IF EXISTS "mt_member_all" ON member_transformations;
CREATE POLICY "mt_member_all" ON member_transformations
  FOR ALL TO authenticated
  USING      (member_id IN (SELECT id FROM members WHERE auth_id = auth.uid()))
  WITH CHECK (member_id IN (SELECT id FROM members WHERE auth_id = auth.uid()));

-- 트레이너 본인: 자기 회원 변화 조회(관리/확인)
DROP POLICY IF EXISTS "mt_trainer_read" ON member_transformations;
CREATE POLICY "mt_trainer_read" ON member_transformations
  FOR SELECT TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()));

-- ============================================================
-- 4. profile_events — 익명 상담/조회 이벤트 (PII 없음)
-- ============================================================
CREATE TABLE IF NOT EXISTS profile_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id  uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('view','contact_click','pricing_view')),
  interest    text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE profile_events ENABLE ROW LEVEL SECURITY;

-- 익명 기록 허용 (개인정보 미수집)
DROP POLICY IF EXISTS "pe_anon_insert" ON profile_events;
CREATE POLICY "pe_anon_insert" ON profile_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 트레이너 본인만 집계 조회
DROP POLICY IF EXISTS "pe_owner_read" ON profile_events;
CREATE POLICY "pe_owner_read" ON profile_events
  FOR SELECT TO authenticated
  USING (trainer_id IN (SELECT id FROM trainers WHERE auth_id = auth.uid()));

-- ============================================================
-- 5. 스토리지 버킷 — transformations (클라 압축본만, 1MB 상한)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('transformations','transformations', true, 1048576,
        ARRAY['image/webp','image/jpeg','image/jpg','image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 공개 읽기 (프로필에 노출)
DROP POLICY IF EXISTS "transformations_read" ON storage.objects;
CREATE POLICY "transformations_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'transformations');

-- 본인 폴더(auth.uid)만 업로드 (회원이 자기 사진 업로드)
DROP POLICY IF EXISTS "transformations_write" ON storage.objects;
CREATE POLICY "transformations_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'transformations'
              AND (storage.foldername(name))[1] = auth.uid()::text);

-- 본인 폴더만 삭제 (회원이 내리기)
DROP POLICY IF EXISTS "transformations_delete" ON storage.objects;
CREATE POLICY "transformations_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'transformations'
         AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 6. 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tp_handle      ON trainer_profiles (handle);
CREATE INDEX IF NOT EXISTS idx_tp_public      ON trainer_profiles (is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_pkg_trainer    ON trainer_packages (trainer_id, sort);
CREATE INDEX IF NOT EXISTS idx_mt_trainer     ON member_transformations (trainer_id, status);
CREATE INDEX IF NOT EXISTS idx_mt_member      ON member_transformations (member_id);
CREATE INDEX IF NOT EXISTS idx_pe_trainer     ON profile_events (trainer_id, created_at DESC);
