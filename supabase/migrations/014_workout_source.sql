-- workout_sessions에 source 컬럼 추가 (회원 직접 기록 구분용)
alter table workout_sessions
  add column if not exists source text default 'trainer'; -- 'trainer' | 'member'
