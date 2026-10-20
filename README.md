# 한입컷 (Hanipcut)

음식 그림을 화면을 밀어 잘라 정해진 조각 수로 똑같이 나누는 3단계 스낵게임. 토스 미니앱(앱인토스) + 웹.

- 현재 버전: **v0.9.35** (`bb/src/game.js` 의 `CFG.version`)
- 엔진 없음: HTML5 Canvas 2D + 순수 JS
- 리워드 동선(첫 접속 → 튜토리얼 → 출석·알림 2배 → 미션 → 판 종료 안내 → 광고 · 랭킹)은 다른 게임에도 그대로 쓰는 공통 UX

## 폴더 구조

```
bb/                 게임 원본
  src/              index.html · style.css · game.js  (실제 코드는 여기만 고치면 됨)
  assets/           UI 이미지(빌드 때 인라인), foods/ 음식 50종 WebP, fx/, intro.mp4, bgm_*.mp4
  raw_foods/        음식 원본 PNG (560px, 투명)
  music/            compose.py + MIDI
  build.py          웹 빌드 → bb/dist/
  sim.js            판정 시뮬레이션(개발용)
ait/                토스 미니앱 포장
  apps-in-toss.config.ts · package.json
  bridge/           toss-bridge.js (토스 SDK 연결) · jua.woff2 (폰트)
  build-toss.py     bb 빌드 → ait/dist/ (토스용 index.html)
SDK_연동안내.md       게임 ↔ SDK 연결 지점 (Platform 객체)
```

## 빌드

필요: Python 3, Node.js 18+

**웹**
```bash
cd bb
python3 build.py          # → bb/dist/ (index.html + foods/ + intro.mp4 + bgm_*.mp4 + cat_slash.webp)
```
`bb/dist/` 안의 파일을 폴더 구조 그대로 웹 서버에 올리면 됩니다 (`bungeo-banban.html`은 미리보기용, 업로드 불필요).

**토스 미니앱 (.ait)**
```bash
cd ait
npm install
python3 build-toss.py     # bb 빌드 + 토스용 dist + package.json 버전을 게임 버전에 맞춤
npx ait build             # → ait/hanipcut.ait  (콘솔 업로드용)
```
- 콘솔은 같은 버전을 다시 받지 않습니다('이미 존재하는 버전'). 올리기 전에 `CFG.version`을 올리세요.
- 게임 폴더 위치가 다르면 `HANIPCUT_GAME=/path/to/bb python3 build-toss.py`

## 테스트 방법
- 웹 주소 뒤 `?reset=1` → 신규 유저로 처음부터
- 웹 주소 뒤 `?adfail=1` → 광고 불러오기 실패 상황
- 토스 앱: 설정 팝업의 '버전' 글자를 3초 안에 5번 → 테스트 초기화

## ⚠ 출시 전에 지울 테스트 코드
| 위치 | 내용 |
|---|---|
| `bb/src/game.js` 맨 위 `TEST_BUILD_ID` 블록 + `bb/build.py`의 `/*BUILD_ID*/` 치환 | 빌드할 때마다 모든 유저를 신규로 초기화 |
| `bb/src/game.js` `CFG.loginExample: true` | 토스에서도 로그인을 예시 화면으로 |
| `bb/src/game.js` `testResetTap()` (▼▼▼ [테스트용] 표시) + `openSettings` 안 호출 1줄 | 버전 5번 탭 초기화 |
| `FakeAd`의 `?adfail=1` | 웹 테스트용 광고 실패 |
| 예시 SDK 시트(`SdkSheet`) · 예시 N판 광고 팝업 | 실제 SDK 연결 시 교체 |

## 연결이 남은 값 (`ait/bridge/toss-bridge.js`)
- `REWARD_AD_GROUP_ID` 보상형 광고 그룹 ID (비면 테스트 광고)
- `PROMOTION_CODE` 토스포인트 지급 프로모션 코드
- `NOTIFICATION_TEMPLATE` 알림 동의 스마트발송 템플릿 코드
- 출석 금액 · 이어하기 횟수 · N판 광고(N) 등 어드민 값은 지금 `CFG` 임시값

## 참고 문서
- 기획서: 스낵게임 기획서 — 한입컷 (Claude Docs)
- 공통 UX: 게임 리워드 UX 가이드 (Claude Docs)
- 피그마: 김성식_워크스페이스 › Game Style Guide (컴포넌트) / 리워드 동선 v2 (스토리보드)
- 링크는 담당자에게 공유 요청
