한입컷 - 앱인토스(토스 미니앱) 빌드 v0.11.0

[산출물]
- hanipcut.ait : 콘솔 업로드용 번들 (npx ait build 결과)

[설정] apps-in-toss.config.ts
- appName 'hanipcut'  ← 콘솔에 등록한 앱 이름과 다르면 바꿔서 다시 빌드
- navigationBar: theme 'dark', transparentBackground true, withTitle false  (토스 고유 헤더 다크)
- 앱 타입(게임)·표시 이름·아이콘은 v3부터 콘솔에서 설정

[연동 상태] bridge/toss-bridge.js
- 햅틱: Device.triggerHaptic 연결 완료
- 리더보드: Game.setLeaderboardScore / openLeaderboard 연결 완료 (연속클리어*100000+점수)
- 세이프 에어리어: SafeArea.get/subscribe → 헤더 위치 반영
- 보상형 광고: REWARD_AD_GROUP_ID 넣으면 활성 (비어 있으면 테스트용 가짜 광고)
- 포인트 지급: PROMOTION_CODE 넣으면 grantPromotionRewardForGame 활성
- 폰트(Jua)는 번들에 포함, 외부 로드 없음

[다시 빌드]
npm install
python3 build-toss.py   (게임 소스 = ../bb)
npx ait build
[배포]
npx ait token add  → npx ait deploy
