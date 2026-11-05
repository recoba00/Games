// 한입컷 ↔ 앱인토스 연결부. 게임 코드(game.js)는 window.TossDevice / window.TossBridge / window.GfSDK 만 봄.
// 광고·로그인·토스포인트·랭킹·알림은 지팩토리 게임 SDK(gf-sdk, ait/vendor)가 담당 — 설정은 ait/gf.config.json.
// SDK 는 앱인토스 web-framework 의 **전체 export** 를 window.AppsInToss 에서 읽는다(GAME-INTEGRATION §3.1) → SDK 보다 먼저 실행돼야 함.
import * as AppsInToss from '@apps-in-toss/web-framework';
const { Device, Game, SafeArea, NavigationBar, getPlatformOS, getUserKeyForGame, getGameCenterGameProfile } = AppsInToss;
window.AppsInToss = AppsInToss;

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

// 로그인은 지팩 SDK(GfSDK.retrySession → 지팩 회원 세션)만 — 인가 코드를 게임이 직접 받지 않는다
// 게임 식별키: 로그인 없이 조용히 유저 식별 (튜토리얼 기록·웰컴 보관 서버 저장용)
if (sup(getUserKeyForGame)) bridge.userKey = async () => { const r = await getUserKeyForGame(); return r && r.hash ? r.hash : null; };
// 토스 게임 프로필(닉네임·프로필 이미지) → 랭킹 아바타
if (sup(getGameCenterGameProfile)) bridge.getProfile = async () => { const r = await getGameCenterGameProfile(); return r && r.statusCode === 'SUCCESS' ? r : null; };
window.TossBridge = bridge;
