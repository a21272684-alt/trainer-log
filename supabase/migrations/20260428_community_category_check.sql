-- community_posts.category check constraint 업데이트
-- trainer_seeks_member 제거 → trainer_lesson_recruit 추가

ALTER TABLE community_posts
  DROP CONSTRAINT IF EXISTS community_posts_category_check;

ALTER TABLE community_posts
  ADD CONSTRAINT community_posts_category_check
  CHECK (category IN (
    'trainer_lesson_recruit',
    'member_seeks_trainer',
    'instructor_seeks_student',
    'gym_seeks_trainer',
    'trainer_seeks_gym',
    'gym_partnership',
    'educator_course',
    'educator_market'
  ));
