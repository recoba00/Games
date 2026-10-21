# Games

지팩토리 스낵게임 모음. 게임마다 하위 폴더 하나씩 두고, 같은 리워드 UX(첫 접속 → 튜토리얼 → 출석·알림 2배 → 미션 → 판 종료 안내 → 광고 · 랭킹)를 씁니다.

| 폴더 | 게임 | 플랫폼 | 버전 | 설명 |
|---|---|---|---|---|
| [hanipcut](hanipcut/) | 한입컷 | 토스 미니앱 · 웹 | v0.9.35 | 음식을 정해진 조각 수로 똑같이 자르는 3단계 스낵게임 |

## 웹에서 바로 보기 (GitHub Pages)
- 게임 목록: https://recoba00.github.io/Games/
- 한입컷: https://recoba00.github.io/Games/hanipcut/
- main에 올라가면 `.github/workflows/pages.yml`이 각 게임을 빌드해서 자동 배포 (빌드 결과물은 저장소에 올리지 않음)
- 새 게임을 추가하면 pages.yml에 빌드 단계 하나, `site/index.html`에 카드 하나 추가

## 새 게임 추가 규칙
- 폴더 이름은 영문 소문자 (`Games/<게임영문명>/`)
- 각 게임 폴더에 `README.md`(구조 · 빌드 · 테스트 · 출시 전 지울 테스트 코드)와 `.gitignore`(빌드 결과물 제외)
- 빌드 결과물(.ait, dist, 웹 빌드)과 `node_modules`는 올리지 않음
- 위 표에 한 줄 추가

## 공통 문서
- 게임 리워드 UX 가이드 (Claude Docs) · 피그마 Game Style Guide (컴포넌트) — 링크는 담당자에게 공유 요청
