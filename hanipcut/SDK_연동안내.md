# 한입컷 — 게임 SDK 연동 안내 (지팩/사업팀용)

## v0.12.0 — 지팩토리 게임 SDK(gf-sdk) 연결 상태

토스 빌드(`ait/build-toss.py`)에 `ait/vendor/gf-sdk@0.37.1.js`(src_gfac_game_sdk main `4401142` 빌드, sha256 고정)를 싣는다. 순서: 브리지(앱인토스 전체 export → `window.AppsInToss`) → `window.__gfConfig`(= `ait/gf.config.json`) → SDK → 게임. 게임 쪽 연결은 `bb/src/game.js` 의 `Gf` 객체 한 곳. 웹·PWA 빌드는 SDK 없이 지금 그대로다.

| `ait/gf.config.json` | 비어 있으면 | 값을 넣으면 |
|---|---|---|
| (항상) | `GfSDK.init` 1회 — `loginTiming:'explicit'`(진입 직후 로그인 창 없음, 저장 세션만 조용히 복원), 판 시작/종료 로그 | |
| `ads.rv` | 웹 가짜 광고 | `GfSDK.ad` 보상형(이어하기·아이템). 지금은 테스트 ID `ait-ad-test-rewarded-id` → **콘솔 발급 ID로 교체** |
| `promotionCode` | 게임 자체 예시 미션·출석·웰컴·알림(로컬, 실제 지급 없음) | SDK 미션·7일 출석·알림·지급 토스트(`reward.createView`, uxVersion 2). [미션]·[리워드 미션] → SDK 미션 창, 튜토리얼 보상 안내/완료·게임 시작 전 출석 제안·결과 버튼 전 안내는 SDK. 게임 자체 미션/출석 흐름은 꺼짐. 설정에 "알림 해제" 줄 |
| `leaderboardEntryUrl` (`intoss://hanipcut`) | 게임 자체 예시 랭킹 + 토스 게임센터 점수 | SDK 랭킹(`gf_score`, 점수 = 최고 연승, 단위 "연승"). [랭킹] → SDK 랭킹 카드. 순위가 오르면 제출 응답(`rank.all`)으로 게임 토스트(→[랭킹] 흡수), SDK 자동 카드는 끔 |
| `analyticsDeploymentId` | 분석 끔 | SDK 분석 |
| `env` | `test` | 라이브 전환 때 `live` (Worker·캠페인과 함께) |

- 판 신고(§8.1): 정식 판 = 음식 한 세트(`beginSet`), 광고 이어하기는 같은 판. 결과 첫 표시 뒤 `reward.gameEnd()` 1회. 10초 규칙: 실패가 판 시작~판정 10초 이하면 신고 보류, 이어하기 뒤 다음 판정에서 다시 판단. 성공은 항상 1판.
- 상단 [코인][랭킹][미션]은 게임 버튼 그대로(Figma), SDK 배지는 끔(`badge:false`). [미션] 숫자 = SDK 화면 상태의 받을 보상 수.
- 아이템 지급(§8.3): `coin` → 게임 코인, `helper`·`stopwatch`·`magnifier` → 아이템. 멱등키 저널(`hanipcut:gf-grant-journal`) 후 `promoHub.ackItem`. 모르는 통화(하트 등)는 ack 하지 않음 → 캠페인에 하트 보상을 넣지 말 것.
- **출석(attendance) 아이템 보상 금지**: econ4 출석 아이템은 deliver 가 아니라 서버 지갑에 바로 들어가는데(`attendance-granted`), 한입컷은 아직 서버 지갑이 없어 받을 곳이 없다 → hanipcut 캠페인은 econ3(토스포인트 출석)로 두고 출석에 아이템을 넣지 말 것.
- 로그인: 사용자 행동에서만 `GfSDK.retrySession()`(토스 로그인 → 지팩 회원 세션). 브리지가 `appLogin()` 을 직접 부르지 않는다. 지금은 `CFG.loginExample: true` 라 게임 자체 예시 미션의 로그인은 예시 화면.
- SDK 화면을 기다릴 때(게임 시작 전 출석·결과 버튼 전 안내·튜토리얼 보상) 60초가 지나도 SDK 화면이 떠 있으면 닫힐 때까지 기다린다. 결과 안내를 기다리는 사이 홈으로 가면 그 결과 버튼 동작은 버린다.
- 토스 빌드(SDK 켜짐)에서는 3판마다 뜨던 예시 '광고 영역' 팝업을 띄우지 않는다(팝업 광고 형식 확정 전). 설정 "알림 해제"(표준 종 아이콘)는 로비 설정에서만.
- 코인·아이템은 아직 **기기 저장**(localStorage). 서버 지갑(`gf_wallet`, Edge `game` `/wallet/apply`) 이전은 다음 단계.

**켜기 전에 필요한 것 (서버·콘솔)**: ① Worker에 hanipcut 구루토스·아바티·구루게임앱 Basic 등록(키는 11-02 수령, 미반영) → 실기기 로그인으로 회원 생성 확인 ② 콘솔 보상형 광고 ID ③ 토스포인트 프로모션 승인 → `GF_REWARD_CAMPAIGNS` 에 `hanipcut` 병합(`rewardUxV2:true`) ④ 리더보드 entryUrl. 그 뒤 `gf.config.json` 값만 넣고 다시 빌드. SDK를 올릴 때는 SDK main `npm run build` → `vendor/` 교체 → `gf.config.json` 의 file·sha256 갱신.

---

## (이전) 연결 지점 안내 — v0.9 기준

인게임(자르기·판정·연출·사운드·설정)은 완성 상태입니다. 아래 연결 지점만 SDK로 바꿔 끼우면 됩니다.

## 구조
- 순수 HTML5 Canvas 2D + JS (엔진 없음). 원본 `bb/src/` (index.html · style.css · game.js)
- 빌드: `cd bb && python3 build.py` → `bb/dist/` (index.html 하나 + foods/ · intro.mp4 · bgm_*.mp4 · cat_slash.webp)
- 용량 약 4MB, 오디오 AAC(mp4), 이미지 WebP

## 연결 지점 — game.js 의 `Platform` 객체 (한 곳에 모여 있음)
| 함수 | 호출 시점 | 지금 동작 | SDK로 바꿀 것 |
|---|---|---|---|
| `Platform.showRewardedAd()` → `Promise<'done'·'closed'·'error'>` | 실패 팝업 광고 이어하기(한 판 3회, 일일 제한 없음) / 재고 0개 아이템 광고 사용 | 웹: 가짜 광고 / 토스: `window.TossBridge.showRewardedAd` | 보상형 광고. 완료만 `'done'`, 중도 종료 `'closed'`, 불러오기 실패 `'error'`. 아이템 광고는 이어하기 횟수와 별개 |
| `Platform.submitScore(clears, score)` | 판 종료 시 최고기록 갱신 때 | 점수 = 연속클리어×100000 + 누적점수 | 리더보드 |
| `Platform.grantPoint(n, reason)` | 미션 보상 받기 | 로컬 적립(+대기열) | 토스포인트 미션 |
| `Platform.haptic(kind)` | 칼질·성공·실패·보상 | 토스 `Device.triggerHaptic` 매핑표 `HAPTIC` | 그대로 써도 됨 |
| `Platform.login()` → `Promise<boolean>` | 사용자가 '로그인하고 받기' · 미션 '로그인' 버튼을 눌렀을 때만 | 웹: 예시 화면 / 토스: `TossBridge.login` = `appLogin()` 인가 코드 받으면 성공 | **서버 토큰 교환(mTLS) 성공 여부를 돌려주게** |
| `Platform.agreeNotification()` → `'newAgreement'·'alreadyAgreed'·'agreementRejected'` | 미션 '알림 받기' [신청] | 웹: 예시 화면 / 토스: `Notification.requestAgreement` (템플릿 코드 필요) | 콘솔 스마트발송 템플릿 코드 |
| `Platform.getProfile()` | 랭킹 열 때 | 토스: `getGameCenterGameProfile()` → 아바타 | 그대로 |

- `window.TossBridge = { showRewardedAd, submitScore, grantPoints, openLeaderboard, haptic }` 를 게임 스크립트보다 먼저 넣으면 자동으로 그쪽을 씁니다.
- 랭킹 버튼: `openRanking()` — 토스면 `TossBridge.openLeaderboard` 버튼이 붙음
- 미션판 버튼: `openMissions()` — SDK 미션 팝업으로 교체 가능

## 게임 안 자체 기능 (SDK 기능과 겹침 → 교체/삭제 판단 필요)
- 미션판(첫 판·5판·30분·3시간 방문·20판), 포인트 카운터, 랭킹(예시 순위 + 내 기록), 토스트
- 방문 보상 팝업은 "진입 직후 자동 팝업 금지"에 따라 **제거됨** (웰컴 기프트는 SDK)
- 저장: localStorage `S` 객체 (최고기록·설정·미션 진행) → 서버 저장으로 교체 가능

## 화면
- 기준 폭 360 논리px, 휴대폰은 가로 꽉 채움, 폴드 펼침·태블릿은 가운데 480px
- 상단 좌측: [랭킹][미션판][N연승 도전 중!] — 토스 헤더(우상단 ⋯✕)와 세로 가운데 정렬 (세이프영역 + iOS 22 / Android 27px)
- 게임 화면의 하단 좌측은 보유 코인, 우측은 [설정][홈]. 그 위에 [직선 ↔ 곡선][도우미][스탑워치][돋보기]. 하트와 상점은 없으며 마지막 유효 선 이후 자동 판정합니다.
- 토스 SDK 연결 예시: `ait/bridge/toss-bridge.js`, 설정 `ait/apps-in-toss.config.ts` (헤더 다크·투명)

## v0.9.0 리워드 동선 (Figma '리워드 동선 v2' 기준)
- **신규**(`S.tut` 없음): 로딩 → 로비 없이 튜토리얼(1단계, 타이머 없음·무조건 통과) → '튜토리얼 완료!' 웰컴 선물 다이얼로그(웰컴 5원 + 첫 판 1원) → [로그인하고 받기] → 토스 로그인 → 지급 → [바로 한 판 하기]
- **닫기** → 웰컴 선물 '보관 중' 7일(`S.welcome`), 바로 첫 정식 판 + 토스트 1회. 재진입은 로비부터, '리워드 미션' 위 칩(보관 중 D-n / 받을 보상 N개)
- **미로그인**: 미션 진행·달성은 정상 집계, 보상만 보관. 미션 창 버튼 '로그인' → 로그인 성공 시 웰컴 + 받을 수 있는 미션을 한 번에 지급
- **플레이 중**: 팝업·토스트 없음, 헤더 [미션] 배지 숫자만. **판 종료**(결과 팝업 위) 토스트 1회, 같은 안내는 세션당 1회
- 미션: 오늘 달성 보너스 20P / 5판마다 1P + 게임 코인 10개(하루 10번) / 첫 판 1P · 5판 3P · 20판 25P(14시 초기화) · 30분 1P · 알림 받기 1P(1회, 이미 동의한 유저는 숨김). 게임 코인은 `Platform.grantPoint`로 외부 지급하지 않으며 클리어 코인 보상은 없습니다.
- **서버로 옮겨야 할 것(지팩 SDK)**: 지금은 기기 저장(localStorage `S`) — 튜토리얼 완료(`tut`)·로그인(`login`)·웰컴 보관(`welcome`)·미션 진행(`m`)은 게임 식별키(`TossBridge.userKey` = `getUserKeyForGame`) 기준 서버 저장, 지급은 중복 방지 키(유저 + 보상ID). 웰컴은 토스 계정당 1회('이미 받은 선물이에요' 처리는 서버)
- 콘솔: 1인 하루 최대 지급액 설정 필수

## 배포 전 지울 테스트 코드 (v0.9.1~)
- `bb/src/game.js` 맨 위 `[테스트용 · 실제 배포 전 이 블록 삭제]` 블록: 새로 빌드할 때마다 신규 유저로 시작(같은 빌드 안에서는 기록 유지 → 다시 열면 기존 유저 흐름), 주소에 `?reset=1` 붙이면 신규로 초기화
- `bb/build.py` 의 `/*BUILD_ID*/` 치환 줄 (`[테스트용]` 주석)
- `CFG.loginExample: true` → 토스 앱에서도 로그인은 'SDK 예시' 화면. 지팩 SDK 연결 후 false 또는 삭제
