-- 038_phone_nullable.sql
-- OAuth(구글) 회원가입 시 phone 없이 등록 가능하도록 NOT NULL 제약 해제

ALTER TABLE trainers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE trainers ALTER COLUMN phone SET DEFAULT '';
