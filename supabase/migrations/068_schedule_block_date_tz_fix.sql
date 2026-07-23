-- 068_schedule_block_date_tz_fix.sql
--
-- 배경:
--   TrainerApp 의 dStr 이 d.toISOString().split('T')[0] 로 스케줄 블록 날짜를
--   만들었음. KST(UTC+9) 에서 로컬 자정은 전날 15:00 UTC → 저장된 date 문자열이
--   실제 의도한 캘린더 날짜보다 하루 전(-1일)으로 기록됨.
--   같은 타임존 안에선 저장·조회가 동일하게 밀려 화면상 맞아 보였지만,
--   웹↔모바일 등 환경이 어긋나면 요일이 밀려 표기되는 버그.
--
--   코드 fix: dStr 을 로컬 캘린더 날짜(getFullYear/Month/Date) 기반으로 교체.
--   그러면 컬럼 날짜 키가 실제 캘린더 날짜가 되므로, 기존 -1일 저장 블록은
--   하루 전 요일로 밀려 보이게 됨 → 기존 데이터도 +1일 보정 필요.
--
-- 이 마이그레이션:
--   trainer_schedules.blocks(jsonb 배열) 각 원소의 date 를 +1일 보정.
--   (KST 로 생성된 데이터 가정 — Korea 전용 베타라 안전)
--
-- 재실행 안전(멱등):
--   tz_date_fixed 플래그 컬럼으로 이미 보정된 행은 건너뜀. 신규 행은 DEFAULT true
--   라 (fix 된 클라이언트가 올바른 날짜로 저장) 재보정 대상에서 제외.

-- 1) 보정 여부 플래그 (기존 행은 false 로 들어옴)
ALTER TABLE trainer_schedules
  ADD COLUMN IF NOT EXISTS tz_date_fixed boolean NOT NULL DEFAULT false;

-- 2) 아직 보정 안 된 행의 각 블록 date 를 +1일 (배열 순서 보존)
UPDATE trainer_schedules t
SET blocks = sub.new_blocks
FROM (
  SELECT ts.trainer_id,
         jsonb_agg(
           CASE
             WHEN elem->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
               THEN jsonb_set(elem, '{date}', to_jsonb(((elem->>'date')::date + 1)::text))
             ELSE elem
           END
           ORDER BY ord
         ) AS new_blocks
  FROM trainer_schedules ts,
       jsonb_array_elements(ts.blocks) WITH ORDINALITY AS a(elem, ord)
  WHERE ts.tz_date_fixed = false
    AND jsonb_typeof(ts.blocks) = 'array'
    AND jsonb_array_length(ts.blocks) > 0
  GROUP BY ts.trainer_id
) sub
WHERE t.trainer_id = sub.trainer_id;

-- 3) 빈 블록 포함 모든 기존 행을 보정 완료로 표시 (재실행 시 재보정 방지)
UPDATE trainer_schedules SET tz_date_fixed = true WHERE tz_date_fixed = false;

-- 4) 이후 신규 행은 fix 된 클라이언트가 올바른 날짜로 저장 → 기본값 true
ALTER TABLE trainer_schedules ALTER COLUMN tz_date_fixed SET DEFAULT true;
