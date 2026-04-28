-- 035_workout_sessions_fix.sql
-- workout_sessions / workout_routines 테이블 보장 + anon 권한 명시

-- 1. workout_sessions 테이블 생성 (없을 경우)
CREATE TABLE IF NOT EXISTS workout_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid REFERENCES members(id) ON DELETE CASCADE,
  trainer_id    uuid REFERENCES trainers(id) ON DELETE CASCADE,
  title         text,
  workout_date  date NOT NULL,
  duration_min  int,
  memo          text,
  exercises     jsonb DEFAULT '[]',
  total_volume  numeric DEFAULT 0,
  source        text DEFAULT 'trainer',
  created_at    timestamptz DEFAULT now()
);

-- 2. source 컬럼 추가 (없을 경우)
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'trainer';

-- 3. workout_routines 테이블 생성 (없을 경우)
CREATE TABLE IF NOT EXISTS workout_routines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid REFERENCES trainers(id) ON DELETE CASCADE,
  member_id  uuid REFERENCES members(id) ON DELETE CASCADE,
  name       text NOT NULL,
  exercises  jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- 4. RLS 활성화
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_routines ENABLE ROW LEVEL SECURITY;

-- 5. 기존 정책 제거 후 재생성 (중복 방지)
DROP POLICY IF EXISTS "allow_all_workout_sessions" ON workout_sessions;
DROP POLICY IF EXISTS "allow_all_workout_routines" ON workout_routines;

CREATE POLICY "allow_all_workout_sessions" ON workout_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_workout_routines" ON workout_routines
  FOR ALL USING (true) WITH CHECK (true);

-- 6. anon / authenticated 역할에 명시적 권한 부여
GRANT ALL ON workout_sessions TO anon, authenticated;
GRANT ALL ON workout_routines TO anon, authenticated;
