# 한입컷 게임 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 요청된 게임 규칙·곡선 자르기·재화·네 부스터를 구현하고 두 audit 85점 이상을 통과한다.

**Architecture:** DOM 없는 core와 기존 Canvas 화면을 연결한다. 광고 및 아이템 재진입은 상태와 flow 토큰으로 차단한다.

**Tech Stack:** Vanilla JavaScript, Canvas 2D, Node test, Python build, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-gameplay-expansion-design.md`

## Global Constraints

- 단계 시간 30/30/24초, 3·6·9·12번째 연승 도전 판에 7등분 4단계(24초).
- 광고 이어하기 한 판 3회, 하루 무제한; closed/error는 소비하지 않는다.
- 도우미·돋보기는 판 성공/실패/이탈 시 종료, 스탑워치는 단계/시도 범위.
- 기존 포인트와 코인 분리, 저장 마이그레이션, 빌드 후 재고 유지.
- gate >=85/100, 중대 결함 0건. 실광고 SDK 검증은 모의 결과로 대체한 사실을 기록.

## Review Focus

- 자체 교차·반복 경로·내부에서 끝나는 경로가 조각 수나 총면적을 망가뜨리지 않는다.
- 포인터 취소/멀티터치/팝업/리사이즈에서 원치 않는 선이 확정되지 않는다.
- 판정 예약 중 취소·홈 이동 시 오래된 콜백이 다음 화면을 덮지 않는다.
- 광고 중복 클릭·광고 도중 이탈·결과 버튼 중복 클릭으로 소비/지급이 중복되지 않는다.
- 기존 저장과 PWA 오프라인 재실행에서 재고·포인트·기록이 유지된다.

## Task 1: 순수 규칙 및 기하

Files: create `bb/src/game-core.js`, `bb/tests/game-core.test.cjs`.

Interfaces: `GameCore.stageCount(round)`, `GameCore.initWallet(save, now)`, `GameCore.regenerateHearts(save, now)`, `GameCore.buy(save, key, now)`, `GameCore.consume(save, key)`, `GameCore.rewardRound(save, bonus)`, `GameCore.split(food, paths, crumbRatio)` → `{labels, comps, pieces, total}`, `GameCore.guides(food, n)` → paths.

- [x] Write/run failing tests: 3/6/9/12 stage count; starter wallet/migration/regen/cap/purchase/insufficient balance; curved vs chord areas; conservation; seven bands; repeat stroke; internal endpoints; disconnected food islands.
- [x] Implement core; rerun `node --test bb/tests/game-core.test.cjs`, expect all pass.

## Task 2: 화면·게임 흐름 연결

Files: modify `bb/src/game.js`, `index.html`, `style.css`, `bb/build.py`, `pwa/build.py`.

Consumes Task 1 API; produces active stage list, per-round flags, immutable local cut paths, cached preview/guide/result layers.

- [x] Connect time limits, bonus stage count and labels, unlimited daily continuation, wallet HUD/shop.
- [x] Connect full pointer path, preview/area result masks, safe pointer cancellation and resize.
- [x] Connect undo, helper, stopwatch, magnifier; final cut stays editable until confirmation.
- [x] Connect rewarded ad lock/flow validation, heart continue, single round reward.
- [x] Build with `python -X utf8 bb/build.py` from bb directory and `python -X utf8 pwa/build.py`; syntax-check JS.

## Task 3: ブラウザ 검증 및 최종 audit

Files: create `bb/tests/test_gameplay.py`, audit report beside spec; update README/checklist.

- [x] Browser tests: actual curved pointer input, preview and undo, effect scope, stopwatch, bonus transition, ads done/closed/error/concurrency/stale flow, wallet persistence, reward once, 360x640 and 390x844 layout.
- [x] Run `python -X utf8 -m unittest discover -s bb/tests -p 'test_*.py'` and `python -X utf8 -m unittest discover -s pwa -p 'test_*.py'`; expect all pass.
- [x] Independent implementation audit with rubric >=85, fix important findings and rerun affected tests.
- [x] Mark spec checklist and record scores, verification evidence, remaining SDK environment limits.

## 실행 기록

- Pre-flight: Task 1 core API is consumed by Task 2; Task 2 built bundles are consumed by Task 3. Use one global `GameCore` before game script in both builders.
- 환경: 현재 폴더에는 `.git`이 없으며 상위 저장소를 가리키는 Git 환경이 동작하지 않는다(`cannot change to .../Games`). 파일 기반 구현·검증으로 진행하고 임의 git 초기화/커밋은 하지 않는다.
- 기존 사용자 요청이 전체 사이클 구현을 승인하므로 추가 설계 승인 질문 없이 audit 결과를 반영하며 진행한다.

- Task 1 complete: core tests 8/8 RED→GREEN. No added dependencies for game core.
- Task 2 complete: freehand paths, label masks, economy/shop and lifetimes integrated; web/PWA/Toss builds pass.
- Task 3 complete: browser 10/10 and PWA offline 1/1; 200 food/guide combinations; independent audit 90, two P2 defects RED→GREEN, gate closed.
- Ruling: Initial restricted Git lookup failed; artifacts, tests and durable audit report provided review evidence. On the user's follow-up commit/push/deploy request, access to the existing parent Games repository was confirmed; use its main branch and existing deployment targets.
- Ruling: Use native implementation plus independent design/final reviewers, as authorized by the audit cycle; no per-task subagent implementation.
- Final review: P2 magnifier cancellation and stale heart continuation fixed with regression tests. No deferred minors.
