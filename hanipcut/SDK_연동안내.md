# 한입컷 — 게임 SDK 연동 안내 (지팩/사업팀용)

인게임(자르기·판정·연출·사운드·설정)은 완성 상태입니다. 아래 연결 지점만 SDK로 바꿔 끼우면 됩니다.

## 구조
- 순수 HTML5 Canvas 2D + JS (엔진 없음). 원본 `bb/src/` (index.html · style.css · game.js)
- 빌드: `cd bb && python3 build.py` → `bb/dist/` (index.html 하나 + foods/ · intro.mp4 · bgm_*.mp4 · cat_slash.webp)
- 용량 약 4MB, 오디오 AAC(mp4), 이미지 WebP

## 연결 지점 — game.js 의 `Platform` 객체 (한 곳에 모여 있음)
| 함수 | 호출 시점 | 지금 동작 | SDK로 바꿀 것 |
|---|---|---|---|
| `Platform.showRewardedAd()` → `Promise<boolean>` | 실패 팝업 "광고 보고 한 번 더" (횟수 제한 없음) | 웹: 가짜 광고 / 토스: `window.TossBridge.showRewardedAd` | 보상형 광고. 끝까지 보면 `true` |
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
- 우상단은 비워 둠. 하단 우측: [설정][홈]
- 토스 SDK 연결 예시: `ait/bridge/toss-bridge.js`, 설정 `ait/apps-in-toss.config.ts` (헤더 다크·투명)

## v0.9.0 리워드 동선 (Figma '리워드 동선 v2' 기준)
- **신규**(`S.tut` 없음): 로딩 → 로비 없이 튜토리얼(1단계, 타이머 없음·무조건 통과) → '튜토리얼 완료!' 웰컴 선물 다이얼로그(웰컴 5원 + 첫 판 1원) → [로그인하고 받기] → 토스 로그인 → 지급 → [바로 한 판 하기]
- **닫기** → 웰컴 선물 '보관 중' 7일(`S.welcome`), 바로 첫 정식 판 + 토스트 1회. 재진입은 로비부터, '리워드 미션' 위 칩(보관 중 D-n / 받을 보상 N개)
- **미로그인**: 미션 진행·달성은 정상 집계, 보상만 보관. 미션 창 버튼 '로그인' → 로그인 성공 시 웰컴 + 받을 수 있는 미션을 한 번에 지급
- **플레이 중**: 팝업·토스트 없음, 헤더 [미션] 배지 숫자만. **판 종료**(결과 팝업 위) 토스트 1회, 같은 안내는 세션당 1회
- 미션: 오늘 달성 보너스 20 / 5판마다 1(하루 10번) / 첫 판 1 · 5판 3 · 20판 25(14시 초기화) · 30분 1 · 알림 받기 1(1회, 이미 동의한 유저는 숨김)
- **서버로 옮겨야 할 것(지팩 SDK)**: 지금은 기기 저장(localStorage `S`) — 튜토리얼 완료(`tut`)·로그인(`login`)·웰컴 보관(`welcome`)·미션 진행(`m`)은 게임 식별키(`TossBridge.userKey` = `getUserKeyForGame`) 기준 서버 저장, 지급은 중복 방지 키(유저 + 보상ID). 웰컴은 토스 계정당 1회('이미 받은 선물이에요' 처리는 서버)
- 콘솔: 1인 하루 최대 지급액 설정 필수

## 배포 전 지울 테스트 코드 (v0.9.1~)
- `bb/src/game.js` 맨 위 `[테스트용 · 실제 배포 전 이 블록 삭제]` 블록: 새로 빌드할 때마다 신규 유저로 시작(같은 빌드 안에서는 기록 유지 → 다시 열면 기존 유저 흐름), 주소에 `?reset=1` 붙이면 신규로 초기화
- `bb/build.py` 의 `/*BUILD_ID*/` 치환 줄 (`[테스트용]` 주석)
- `CFG.loginExample: true` → 토스 앱에서도 로그인은 'SDK 예시' 화면. 지팩 SDK 연결 후 false 또는 삭제
