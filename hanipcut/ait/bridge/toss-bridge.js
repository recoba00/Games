// 한입컷 ↔ 앱인토스 SDK 연결부. 게임 코드(game.js)는 window.TossDevice / window.TossBridge 만 봄.
import { Device, Game, SafeArea, NavigationBar, loadFullScreenAd, showFullScreenAd, grantPromotionRewardForGame, getPlatformOS, appLogin, getUserKeyForGame, getGameCenterGameProfile, Notification } from '@apps-in-toss/web-framework';

// ▼ 앱인토스 콘솔에서 발급받은 값을 넣으면 실제 광고·포인트가 켜짐 (비어 있으면 테스트용 가짜 광고 / 로컬 적립만)
const REWARD_AD_GROUP_ID = '';   // 보상형 광고 그룹 ID
const PROMOTION_CODE = '';       // 게임 프로모션(포인트) 코드
const NOTIFICATION_TEMPLATE = '';  // 알림 받기 미션: 콘솔 스마트발송 템플릿 코드

const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
const sup = (fn) => !!fn && safe(() => (fn.isSupported ? fn.isSupported() : true), false);

window.__gameChannel = 'toss';
document.documentElement.classList.add('toss');
window.TossDevice = Device;
window.TossOS = safe(() => getPlatformOS(), 'ios');   // 토스 헤더 버튼 위치(iOS +5 / Android +10)에 맞춰 상단 정렬

// 세이프 에어리어(상태바·다이내믹 아일랜드) → 게임 레이아웃이 읽어 감
const applyInsets = (i) => { if (!i) return; window.TossSafeArea = i; window.dispatchEvent(new Event('tossinsets')); };
applyInsets(safe(() => SafeArea.get()));
safe(() => SafeArea.subscribe({ onEvent: applyInsets }));

// 토스 고유 헤더: 다크 테마 + 투명 배경 (config 와 동일, 런타임에서도 한 번 더 고정)
safe(() => Promise.resolve(NavigationBar.setOptions({ theme: 'dark', transparentBackground: true, withTitle: false })).catch(() => {}));

const bridge = {
  haptic(type) { return safe(() => Device.triggerHaptic({ type })); },
  submitScore(score) {
    if (!sup(Game.setLeaderboardScore)) return;
    return safe(() => Promise.resolve(Game.setLeaderboardScore({ score: String(score) })).catch(() => {}));
  },
};
if (sup(Game.openLeaderboard)) bridge.openLeaderboard = () => safe(() => Promise.resolve(Game.openLeaderboard()).catch(() => {}));

// 보상형 광고: 미리 로드 → 보여주고 결과 반환
if (REWARD_AD_GROUP_ID && sup(loadFullScreenAd) && sup(showFullScreenAd)) {
  let ready = false;
  const preload = () => safe(() => loadFullScreenAd({ options: { adGroupId: REWARD_AD_GROUP_ID }, onEvent: (e) => { if (e.type === 'loaded') ready = true; }, onError: () => { ready = false; } }));
  preload();
  // 결과: 'done'(끝까지 봄) · 'closed'(중간에 닫음) · 'error'(불러오기 실패 → 게임은 이어하기 횟수를 줄이지 않음)
  bridge.showRewardedAd = () => new Promise((res) => {
    if (!ready) { preload(); return res('error'); }
    let earned = false; ready = false;
    try { showFullScreenAd({
      options: { adGroupId: REWARD_AD_GROUP_ID },
      onEvent: (e) => { if (e.type === 'userEarnedReward') earned = true;
        if (e.type === 'failedToShow') { preload(); res('error'); } else if (e.type === 'dismissed') { preload(); res(earned ? 'done' : 'closed'); } },
      onError: () => { preload(); res('error'); },
    }); } catch (e) { res('error'); }
  });
}

// 포인트 지급(토스 프로모션)
if (PROMOTION_CODE && sup(grantPromotionRewardForGame)) {
  bridge.grantPoints = async (amount) => {
    const r = await grantPromotionRewardForGame({ params: { promotionCode: PROMOTION_CODE, amount } });
    return !!(r && typeof r === 'object' && r.key);
  };
}

// 토스 로그인: 인가 코드(10분·1회용)를 받아 서버에서 토큰으로 교환해야 로그인 완료 (mTLS 서버 = 지팩 SDK 담당)
// 서버 연결 전에는 인가 코드를 받으면 성공으로 봄. 지팩 SDK 연결 시 여기서 서버 교환 결과를 돌려주면 됨
bridge.login = async () => { const r = await appLogin(); return !!(r && r.authorizationCode); };
// 게임 식별키: 로그인 없이 조용히 유저 식별 (튜토리얼 기록·웰컴 보관 서버 저장용)
if (sup(getUserKeyForGame)) bridge.userKey = async () => { const r = await getUserKeyForGame(); return r && r.hash ? r.hash : null; };
// 토스 게임 프로필(닉네임·프로필 이미지) → 랭킹 아바타
if (sup(getGameCenterGameProfile)) bridge.getProfile = async () => { const r = await getGameCenterGameProfile(); return r && r.statusCode === 'SUCCESS' ? r : null; };
// 알림 받기 미션: 토스 알림 동의 화면
if (NOTIFICATION_TEMPLATE && Notification && sup(Notification.requestAgreement)) bridge.agreeNotification = () => new Promise((res) => {
  let off = () => {};
  try { off = Notification.requestAgreement({ options: { templateCode: NOTIFICATION_TEMPLATE }, onEvent: (e) => { off(); res(e && e.type); }, onError: () => { off(); res(null); } }); } catch (e) { res(null); }
});

window.TossBridge = bridge;
