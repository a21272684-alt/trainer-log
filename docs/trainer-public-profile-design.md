# 트레이너 공개 프로필 + 회원 변화 공유 — 설계 문서

> 작성 2026-05-28. 오운 Community 활성화를 위한 첫 기능. 시안 3종(`docs/mockups/`) 기반.
> 철칙: ① 1인 개발자 리스크 최소화(법적·금전) ② 유지보수 간결화.

## 1. 목적 & 전략

- **wedge:** 혼자 써도 가치 있는 AI 도구로 트레이너를 모으고, 그 위에 Community를 얹는다(come for the tool, stay for the network).
- **공개 프로필 = 콜드스타트 해결책:** 트레이너가 인스타 바이오/카톡에 거는 "명함 링크". 트레이너가 스스로 퍼뜨려 → 잠재 회원 유입 + 오운 노출(0원 홍보).
- **차별점:** 단순 링크인바이오(리틀리)가 아니라 **"오운 인증 데이터(실제 활동) + 회원 동의 비포애프터 + 1:1 연결"** = 신뢰 증명형 프로필.
- **가치소비·비구독:** 수익화는 구독이 아니라 소비형 크레딧(노출 끌어올리기) + 일회성 Pro 언락.

## 2. 화면 / 라우트

| 경로 | 화면 | 로그인 | 시안 |
|---|---|---|---|
| `/t/{handle}` | 공개 프로필 (명함+비포애프터+인증데이터+가격버튼) | ❌ 공개 | trainer-profile-mockup |
| `/t/{handle}/contact` | 상담 연결 (관심분야 선택 → 카톡) | ❌ | trainer-profile-flow ① |
| `/t/{handle}/pricing` | 수업·가격 | ❌ | trainer-profile-flow ③ |
| 트레이너 앱 내 "내 프로필" | 프로필/패키지 편집 + 변화 관리 + 문의 지표 | ✅ 본인 | (후속) |
| 회원 앱 내 "내 변화 공유" | 비포애프터 업로드 + 공개 동의 + 내리기 | ✅ 본인 | member-share-progress |

- 공개 라우트는 portal 앱에 **lazy 라우트**로 추가(메인 번들 영향 최소).

## 3. 데이터 모델 (마이그 059)

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `trainer_profiles` | trainer_id PK, handle uniq, is_public, tagline, bio, specialties[], location, photo_url, kakao_link, show_stats | 1 트레이너 1 프로필 |
| `trainer_packages` | trainer_id, name, price, sessions, description, sort, active | 가격은 트레이너가 직접 CRUD (오운 정산 X) |
| `member_transformations` | trainer_id, member_id, before_url, after_url, duration_label, result_label, face_hidden, **consent**, status(draft/published/revoked), consented_at | 비포애프터 + 동의 상태 |
| `profile_events` | trainer_id, type(view/contact_click/pricing_view), interest, created_at | **익명**(PII 없음) — 노출·문의 지표 |
| 스토리지 `transformations` | public, 1MB 제한, webp/jpg/png | 클라 압축본만 |

- trainers/members `auth_id` = uuid (050 확인) → RLS는 `auth.uid() = auth_id` 직접 비교.

## 4. 비포애프터 + 동의 (회원 주도)

- **제출 위치 = 회원 앱 안 "내 변화 공유" 화면.** 회원이 직접 사진 업로드 + "공개 동의" 토글 → 트레이너 프로필에 노출.
- **회원 주도 = 동의 자연 확보** (트레이너 무단 게시 아님).
- **얼굴 가림 기본 ON** (식별성·리스크 ↓). 클라/회원이 처리, 서버 이미지 가공 X.
- **셀프 내리기(revoke):** 회원이 언제든 내림 → 즉시 비공개. "사진 내려달라" CS 소멸.
- 오운은 **상태값(consent/status)만 저장** → 수동 검수 큐 없음 = 저유지보수.

## 5. 상담 = 카톡 연결 + 익명 이벤트 (PII 미수집)

- "1:1 상담 신청하기" → 관심분야(익명) 선택 → **트레이너 카톡으로 연결**. 이름·전화 **수집 안 함**.
- 오운엔 `profile_events`(profile_id·시각·관심분야)만 익명 기록 → "문의 N건" 같은 지표로 수익화·랭킹에 활용.
- 개인정보 처리는 카카오 몫 → 오운 법적·보안 부담 거의 0.
- 인앱 리드 관리가 명확히 필요해지면, **최소 PII + 90일 자동삭제 + 동의**로 승급(후속, 수요 확인 후).

## 6. 오운 인증 데이터 (집계, 후속 060)

- 시안의 다크 박스 숫자(누적 일지·평균 유지·출석률)는 기존 데이터 집계.
- **개인정보 0, 집계값만** 반환하는 `SECURITY DEFINER` RPC `get_public_trainer_stats(handle)` 1개.
- ⚠️ logs/attendance/members 스키마 정밀 확인 후 작성(검증 전 SQL 금지 원칙) → 059 이후 별도 마이그.
- 데이터 적은 신규 트레이너는 `show_stats=false`로 숨김.

## 7. 비용 / 유지보수 통제

- **클라 압축**(기존 `compressImageFile` 재사용, ~720–1080px WebP) → 큰 사진도 ~80–150KB만 업로드. 원본 미보관.
- **버킷 size_limit(1MB) + mime 제한** = 서버측 안전망(054 패턴).
- **프로필당 비포애프터 개수 제한**(예: 6–8쌍) + **lazy-load** + **public 버킷 캐시** → egress 최소.
- 추정: 트레이너 100 × 8쌍 × 2장 × ~70KB ≈ 90MB → Supabase Free(1GB) 여유.
- HEIC(아이폰)·초대형 원본 가드 한 줄.

## 8. 수익화 (구독 X)

| 모델 | 작동 | 우선 |
|---|---|---|
| 노출 "끌어올리기" 크레딧 | 매칭/검색 상단 노출 시 크레딧 소모 (기존 029 credits 재활용) | ⭐ 메인 |
| Pro 프로필 일회성 언락 | 영상 소개·사진 다수·조회 분석 평생 결제 | 보조 |
| 매칭 거래 수수료 | (후순위) 교육콘텐츠·자리매칭 Toss 패스스루 | liquidity 후 |

- 무료 코어(프로필·비포애프터·상담)로 네트워크부터 키우고, **과금은 트래픽·수요 확인 후**(법적·결제 부담을 초기에 안 짊어짐).

## 9. 보안 / RLS / 법적

| 대상 | 정책 요약 |
|---|---|
| trainer_profiles | 공개 SELECT는 is_public=true만 / 본인(auth_id) 전체 |
| trainer_packages | 공개(active+부모 공개) 읽기 / 본인 쓰기 |
| member_transformations | 공개 SELECT는 consent+published+부모공개만 / 회원 본인 CRUD / 트레이너 본인 조회 |
| profile_events | anon INSERT(PII 없음) / 본인 집계 SELECT |
| storage transformations | 공개 읽기 / 본인 폴더(auth.uid) 업로드·삭제 |
| 법적 | 비포애프터 = 회원 동의 필수(opt-in+revoke), 얼굴가림 기본. 상담은 PII 미수집(카톡 위임). 오운=전달자 |

## 10. MVP 범위 & 빌드 순서

1. **(완료 예정) 059 마이그** — 스키마/RLS/버킷. 추가 전용, 언제든 적용 가능.
2. 트레이너 앱: **내 프로필 편집** (handle·소개·전문분야·사진·카톡·패키지) + is_public 토글.
3. **공개 프로필 페이지** `/t/{handle}` (+contact, +pricing). 익명 이벤트 기록.
4. 회원 앱: **내 변화 공유** (업로드+동의+내리기).
5. (후속 060) 인증 데이터 집계 RPC.
6. (후속) 수익화 — 끌어올리기 크레딧.

## 11. 결정/검토 필요 (사용자)

- handle 정책(영문 slug 자유 입력 vs 자동 생성)
- 비포애프터 개수 상한 (제안 6–8쌍)
- "오운 인증 데이터"에 넣을 지표 확정 (누적 일지/평균 유지/출석률 등)
- 끌어올리기 크레딧 가격·단위 (수익화 단계에서)
