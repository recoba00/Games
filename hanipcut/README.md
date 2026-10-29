# 한입컷 (Hanipcut)

음식 그림을 직선 또는 자유곡선으로 잘라 정해진 조각 수로 똑같이 나누는 스낵게임. 토스 미니앱(앱인토스) + 웹 + PWA.

- 현재 버전: **v0.11.0** (`bb/src/game.js` 의 `CFG.version`)
- 엔진 없음: HTML5 Canvas 2D + 순수 JS
- 리워드 동선(첫 접속 → 튜토리얼 → 출석·알림 2배 → 미션 → 판 종료 안내 → 광고 · 랭킹)은 다른 게임에도 그대로 쓰는 공통 UX

## 게임 규칙과 아이템

- 1~3단계 제한시간은 30·30·24초. 연승 도전 3·6·9·12…번째 판에는 4단계(7등분, 24초)가 추가됩니다.
- 기본은 **직선**이며 하단 첫 버튼에서 **직선 ↔ 곡선**으로 무료 전환합니다. 선택은 저장되고, 이미 그은 선은 유지됩니다. 직선은 시작점과 끝점을 연결하고 곡선은 전체 드래그 경로로 자릅니다. 마지막 유효 선을 그으면 자동 판정합니다. 취소·판정 버튼은 없습니다.
- 광고 이어하기는 한 판 3회, 하루 무제한입니다. 광고 실패·중도 종료는 차감하지 않습니다. 하트 없이 새 게임을 횟수 제한 없이 시작할 수 있습니다.
- 최초 코인 50개, 도우미·스탑워치·돋보기 각 1개. 게임 코인은 토스포인트와 별개입니다. 클리어 시 코인 보상은 없으며, **5판 반복 미션 수령 시 1P + 코인 10개**를 받습니다(기존 하루 10회 한도 유지).
- 재고가 0개인 아이템을 누르면 **코인으로 사용 / 광고 보고 사용** 중 선택합니다. 가격은 도우미 30코인, 스탑워치 20코인, 돋보기 30코인입니다. 선택·광고 중 게임 시간은 정지하며, 닫기·광고 실패·중도 종료에는 차감하지 않습니다. 별도 상점은 없습니다.
- **도우미**는 같은 면적의 실선 가이드, **돋보기**는 드래그 중 면적 %를 보여주며 해당 판의 성공·실패까지 유지됩니다. **스탑워치**는 현재 단계의 시간을 멈추며 다음 단계·재시도 시 해제됩니다.

이번 사업팀 재요청과 변경 결정은 [수정 계획](docs/superpowers/plans/2026-10-29-business-revision.md)에 있습니다. 이전 v0.10.0 [설계서](docs/superpowers/specs/2026-10-29-gameplay-expansion-design.md)와 [audit 기록](docs/superpowers/specs/2026-10-29-gameplay-expansion-audit.md)은 당시 기록으로 보관합니다.

## 폴더 구조

```
bb/                 게임 원본
  src/              index.html · style.css · game-core.js · game.js
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

```bash
node --test bb/tests/game-core.test.cjs
python -X utf8 -m unittest discover -s bb/tests -p "test_*.py"
python -X utf8 pwa/build.py
python -X utf8 -m unittest discover -s pwa -p "test_*.py"
```

브라우저 테스트는 Python Playwright와 Microsoft Edge를 사용합니다. 곡선·교차·7등분·재화·광고 중복 방지 및 음식 50종의 가이드 판정을 검증합니다.

Microsoft Store용 PWA 빌드: `python pwa/build.py` → `pwa/dist/`, `pwa/hanipcut-pwa.zip`.
설치·검증·Store 패키징 절차와 제출 전 해결할 항목은 [pwa/README.md](pwa/README.md)를 참고하세요. ZIP은 웹 호스팅용이며 MSIX가 아닙니다.

- 웹 주소 뒤 `?reset=1` → 신규 유저로 처음부터
- 웹 주소 뒤 `?adfail=1` → 광고 불러오기 실패 상황
- 토스 앱: 설정 팝업의 '버전' 글자를 3초 안에 5번 → 테스트 초기화

## ⚠ 출시 전에 지울 테스트 코드
| 위치 | 내용 |
|---|---|
| `bb/src/game.js` 맨 위 `TEST_BUILD_ID` 블록 + `bb/build.py`의 `/*BUILD_ID*/` 치환 | 명시적 `?reset=1` 초기화만 허용. 일반 재빌드 시 기존 저장 유지 |
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
