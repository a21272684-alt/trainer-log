-- 071_diet_logs_source.sql
-- C-2: 식단 기록 데이터 출처 추적 (식약처 / AI추정 / 직접입력)
-- diet_logs.source: 'db'(food_master 선택 = 식약처 공식) | 'ai'(AI 사진인식) | 'manual'(직접입력)
-- 기존 행은 NULL → 앱에서 ai_recognized 로 폴백 표시.

ALTER TABLE diet_logs ADD COLUMN IF NOT EXISTS source text;

-- 기존 데이터 백필: ai_recognized=true 였던 행을 'ai' 로 표시 (배지 즉시 반영)
UPDATE diet_logs SET source = 'ai' WHERE source IS NULL AND ai_recognized = true;
