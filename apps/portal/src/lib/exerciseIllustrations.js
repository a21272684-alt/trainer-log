/**
 * exerciseIllustrations.js — 운동 종목별 동작 일러스트 매핑
 *
 * 그림 출처: everkinetic 오픈 운동 일러스트 (@bryllim/workout-guide 로 정리),
 *            CC BY-SA 4.0. → 앱 정보/설정 화면에 저작자표시 필요 (ATTRIBUTION 참고).
 *
 * SVG 애셋은 apps/portal/public/exercises/<slug>.svg 에 있으며,
 * 밝은 카드용으로 채움색을 #3f4756 로 리컬러해 둠. <img src> 로 렌더.
 *
 * 매핑 안 되는 종목(예: 박스 점프)은 null 반환 → 그림 없이 표시(안전).
 */

// 오운 종목명(EXERCISE_DB.name) → workout-guide slug
const NAME_TO_SLUG = {
  // 가슴
  '벤치프레스': 'bench-press',
  '인클라인 벤치프레스': 'incline-bench-press',
  '덤벨 플라이': 'dumbbell-fly',
  '푸시업': 'push-up',
  '딥스': 'dip',
  '케이블 크로스오버': 'cable-fly',
  '체스트 프레스 머신': 'machine-chest-press',
  // 등
  '풀업': 'pull-up',
  '랫풀다운': 'lat-pulldown',
  '바벨 로우': 'barbell-row',
  '덤벨 로우': 'dumbbell-bent-over-row',
  '시티드 케이블 로우': 'seated-row',
  '데드리프트': 'deadlift',
  '루마니안 데드리프트': 'romanian-deadlift',
  '로잉 머신': 'rowing',
  // 어깨
  '바벨 숄더프레스': 'overhead-press',
  '덤벨 숄더프레스': 'seated-dumbbell-press',
  '레터럴 레이즈': 'lateral-raise',
  '프론트 레이즈': 'front-raise',
  '페이스풀': 'face-pull',
  '업라이트 로우': 'upright-row',
  '리어 델트 플라이': 'rear-delt-fly',
  // 이두
  '바벨 컬': 'bicep-curl',
  '덤벨 컬': 'bicep-curl',
  '해머 컬': 'hammer-curl',
  '케이블 컬': 'cable-curl',
  '인클라인 덤벨 컬': 'incline-dumbbell-curl',
  '컨센트레이션 컬': 'concentration-curl',
  '프리처 컬': 'preacher-curl',
  // 삼두
  '케이블 푸시다운': 'tricep-pushdown',
  '스컬 크러셔': 'skull-crusher',
  '오버헤드 트라이셉스 익스텐션': 'overhead-tricep-extension',
  '클로즈그립 벤치프레스': 'close-grip-bench-press',
  '킥백': 'tricep-kickback',
  // 하체
  '스쿼트': 'squat',
  '레그프레스': 'leg-press',
  '런지': 'forward-lunge',
  '불가리안 스플릿 스쿼트': 'bulgarian-split-squat',
  '레그 익스텐션': 'leg-extension',
  '레그 컬': 'leg-curl',
  '힙쓰러스트': 'hip-thrust',
  '카프 레이즈': 'standing-calf-raise',
  '케틀벨 스윙': 'kettlebell-swing',
  // 코어
  '플랭크': 'plank',
  '사이드 플랭크': 'side-plank',
  '크런치': 'crunch',
  '레그 레이즈': 'lying-leg-raise',
  '러시안 트위스트': 'russian-twist',
  'AB 롤아웃': 'ab-wheel',
  '케이블 크런치': 'cable-crunch',
  '마운틴 클라이머': 'mountain-climber',
  // 유산소
  '러닝': 'running',
  '자전거 (실내)': 'cycling',
  '줄넘기': 'jump-rope',
  '버피': 'burpee',
  '점핑잭': 'jumping-jack',
  '팔 벌려뛰기': 'jumping-jack',
  '스텝퍼': 'stair-climber',
  '일립티컬': 'elliptical',
  // 매칭 없음(그림 생략): '박스 점프'
}

/**
 * 종목명으로 동작 일러스트 URL 반환 (없으면 null).
 * 공백/버전 표기 차이를 흡수하기 위해 정확 일치 → trim 일치 순으로 시도.
 * @param {string} name 종목명 (EXERCISE_DB.name)
 * @returns {string|null} `/exercises/<slug>.svg` 또는 null
 */
export function exerciseIllustration(name) {
  if (!name) return null
  const slug = NAME_TO_SLUG[name] || NAME_TO_SLUG[String(name).trim()]
  return slug ? `/exercises/${slug}.svg` : null
}

// 저작자표시 문구 (CC BY-SA — 앱 정보/설정 화면에 표기)
export const ILLUSTRATION_ATTRIBUTION =
  '운동 동작 일러스트: everkinetic (@bryllim/workout-guide), CC BY-SA 4.0'
