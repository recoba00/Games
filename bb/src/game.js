'use strict';
/* 붕어빵 반반 — 3단계 정밀 컷 스낵게임 (Canvas 2D + DOM UI) */

// ───────────────── 설정 ─────────────────
const CFG = {
  stages: [
    { pieces: 2, cuts: 1, pass: 50, time: 10, K: 2.0, speed: 0,
      talk: '머리부터 vs 꼬리부터\n정확하게 절반 나누기', hint: '화면을 밀어서 잘라요', goal: '<span class="k">[2조각]</span> 되도록\n완벽히 절반 자르기' },
    { pieces: 3, cuts: 2, pass: 65, time: 10, K: 2.0, speed: 0,
      talk: '머리, 몸통, 꼬리로\n3등분 할 수 있지?', hint: '[3조각] 정확하게 자르기', goal: '<span class="k">[3조각]</span> 되도록\n정확하게 자르기' },
    { pieces: 5, cuts: 4, pass: 75, time: 8, K: 1.5, speed: 0.1,
      talk: '오, 제법인데?\n마지막! 스피드가 생명!', hint: '[5조각] 신속하게 자르기', goal: '<span class="k">[5조각]</span> 되도록\n신속하게 자르기' },
  ],
  crumbRatio: 0.015,   // 전체의 1.5% 미만 조각은 부스러기
  perfect: 98,
  foodW: 270, foodH: 250,
  // 광고 — 모두 내부 어드민 설정값 (연결 전 임시값). 광고를 못 불러오면 횟수 차감 없음
  adRetryPerGame: 1,    // 실패 이어하기(보상형 광고): 한 판에 N번
  adDailyCap: 3,        // 실패 이어하기: 하루 N번
  adEveryN: 3,          // N판마다 팝업형 광고(전면 아님) — 결과 팝업에서 다음 판으로 넘어갈 때. 0 = 안 띄움
  version: '0.9.35',
  // 출석 선물 7일 (날짜 기준: 1일차 = 튜토리얼 완료일, 그날 못 받으면 기간만료) — 1일차도 같은 '출석 선물'(이름 통일). ※ 2~7일차 금액은 기획 확정 전 임시값
  // 노란 테두리 = 보상이 가장 큰 2일 (자동 계산, 보통 3·7일차가 되게 금액 설정)
  attend: [5, 1, 2, 1, 1, 1, 5], attendNote: ['추가 선물내용', '추가 선물내용', '추가 선물내용', '추가 선물내용', '추가 선물내용', '추가 선물내용', '추가 선물내용'],   // 칸 둘째 줄 (기획 확정 전 자리표시)
  tossIntroWait: 2500,  // 토스: 앱 자체 첫 화면(게임 등급 안내 등)이 덮고 있는 동안 영상이 지나가지 않게, 이만큼 기다렸다가 재생(ms)
  loginExample: true,   // [테스트용] 토스 앱에서도 로그인은 'SDK 예시' 화면으로 (지팩 SDK 연결 후 false 또는 삭제)
};

// ───────────────── 저장 ─────────────────
const Store = {
  key: 'bb_save_v1',
  load() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { return {}; } },
  save(s) { try { localStorage.setItem(this.key, JSON.stringify(s)); } catch (e) {} },
};
let S0 = Store.load();
// ▼▼▼ [테스트용 · 실제 배포 전 이 블록 삭제] 새로 빌드할 때마다 신규 유저로 시작 (같은 빌드 안에서는 기록 유지 → 다시 열면 기존 유저 흐름)
//     주소에 ?reset=1 을 붙이면 언제든 신규 유저로 초기화
const TEST_BUILD_ID = '/*BUILD_ID*/';
if (S0.testBuild !== TEST_BUILD_ID || new URLSearchParams(location.search).has('reset')) {
  const keep = { sound: S0.sound, bgm: S0.bgm, vibe: S0.vibe };   // 소리·진동 설정만 유지
  S0 = Object.assign({ testBuild: TEST_BUILD_ID, tut: false }, Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== undefined)));
  Store.save(S0);
}
// ▲▲▲ [테스트용 끝] if (S0 && S0.bestClear == null && S0.bestStage) S0.bestClear = S0.bestStage;
const S = Object.assign({ points: 0, best: 0, bestClear: 0, sound: true, bgm: true, vibe: true, visitDay: '', m: null, adDay: '', adCount: 0, pending: [],
  tut: !!(S0 && (S0.bestClear || S0.m)),   // 튜토리얼 완료 기록 (예전 버전에서 플레이한 기기는 완료로 봄)
  login: false,                            // 토스 로그인 여부 (실서비스: 게임 식별키 + 서버 기록으로 판별 — 지팩 SDK)
  welcome: null,                           // 웰컴 선물 { at, state: held · claimed · expired }
  notifOk: false, notifDone: false, notifDay: '', notifHidden: false, profileImg: '',
  notifSince: '',   // 알림 켠 날 (그 다음 날부터 출석 2배)
  alarmAsk: 0,      // 1 = 1일차 수령 때 알림 안 켬 → 첫 정식 판 종료 때 알림 팝업 1번 / 2 = 이미 물어봄
  plays: 0, adAt: 0 // 누적 판 수 (N판마다 광고), 마지막 광고를 띄운 판 수
}, S0);
const save = () => Store.save(S);

// ───────────────── 채널 어댑터 ─────────────────
const HAPTIC = {
  tap:     { toss: 'tap',         web: 8 },              // 버튼 누름 (보상 받기 누르는 순간)
  tick:    { toss: 'tickWeak',    web: 6 },              // 카운트다운 GO
  cut:     { toss: 'tickMedium',  web: 18 },             // 칼질
  stamp:   { toss: 'basicMedium', web: 28 },             // 미션 완료 도장 쾅
  reward:  { toss: 'confetti',    web: [12, 50, 12, 50, 30] }, // 포인트 받음
  success: { toss: 'success',     web: [20, 40, 30] },   // 단계 성공
  fail:    { toss: 'error',       web: 70 },             // 실패
};
const Platform = (() => {
  const q = new URLSearchParams(location.search);
  const channel = window.__gameChannel || q.get('channel') || (window.TossBridge ? 'toss' : 'web');
  return {
    channel,
    // 진동: 게임 안 이름(kind) → 토스 Device.triggerHaptic 타입 / 웹 navigator.vibrate 패턴
    // 토스 타입: tickWeak · tap · tickMedium · softMedium · basicWeak · basicMedium · success · error · wiggle · confetti
    haptic(kind) {
      if (!S.vibe) return;
      const h = HAPTIC[kind] || HAPTIC.tap;
      try {
        const dev = window.TossDevice || (window.TossBridge && TossBridge.Device);   // 토스 빌드에서 Device 를 넣어 줌
        if (dev && dev.triggerHaptic) { Promise.resolve(dev.triggerHaptic({ type: h.toss })).catch(() => {}); return; }
        if (window.TossBridge && TossBridge.haptic) { TossBridge.haptic(h.toss); return; }
        navigator.vibrate && navigator.vibrate(h.web);
      } catch (e) {}
    },
    // 보상형 광고 결과: 'done'(끝까지 봄) · 'closed'(중간에 닫음) · 'error'(불러오기 실패)
    async showRewardedAd() {
      const norm = (r) => r === true ? 'done' : r === false || r == null ? 'error' : r;
      if (window.TossBridge && TossBridge.showRewardedAd) {   // 광고 중엔 소리 멈춤 (토스 검수 항목)
        Sfx.suspend(); try { return norm(await SdkGuard.run(() => TossBridge.showRewardedAd())); } catch (e) { return 'error'; } finally { if (!document.hidden) Sfx.resume(); }
      }
      return FakeAd.show();
    },
    grantPoint(n, reason) {  // 채널 지급은 대기열 → flush (토스 프로모션 / 제휴사 API)
      S.pending.push({ n, reason, t: Date.now() }); save();
      if (window.TossBridge && TossBridge.grantPoints) {
        Promise.resolve(TossBridge.grantPoints(n, reason)).then(ok => { if (ok) { S.pending.shift(); save(); } }).catch(() => {});
      }
    },
    // 토스 로그인: 사용자가 '로그인' 버튼을 눌렀을 때만 호출. 토스 = appLogin(인가 코드 → 서버 토큰 교환은 지팩 SDK), 웹 = 예시 화면
    async login() {
      if (!CFG.loginExample && window.TossBridge && TossBridge.login) { try { return !!(await SdkGuard.run(() => TossBridge.login())); } catch (e) { return false; } }
      return SdkSheet.open({ title: '한입컷에서 토스 로그인', desc: '정보 제공에 동의하고 포인트를 받아요 (토스가 그리는 화면 · 예시)', ok: '동의하고 계속하기' });
    },
    // 알림 동의: 'newAgreement' · 'alreadyAgreed' · 'agreementRejected'(또는 null)
    async agreeNotification() {
      if (window.TossBridge && TossBridge.agreeNotification) { try { return await SdkGuard.run(() => TossBridge.agreeNotification()); } catch (e) { return null; } }
      return (await SdkSheet.open({ title: '한입컷 알림 받기', desc: '이벤트·보상 소식을 토스 알림으로 받아요 (토스가 그리는 화면 · 예시)', ok: '알림 받기' })) ? 'newAgreement' : 'agreementRejected';
    },
    getProfile() { return window.TossBridge && TossBridge.getProfile ? Promise.resolve(TossBridge.getProfile()) : Promise.resolve(null); },
    submitScore(clears, score) { try { window.TossBridge && TossBridge.submitScore && TossBridge.submitScore(clears * 100000 + Math.min(99999, Math.round(score))); } catch (e) {} },  // 연속 클리어 우선, 같으면 누적 점수
  };
})();

// 토스 SDK 화면이 떠 있는 동안 화면 맞춤(fit)을 멈춤 → 끝나고 0.4초 뒤 다시 맞춤
const SdkGuard = { n: 0, get on() { return this.n > 0; },
  async run(fn) { this.n++; try { return await fn(); } finally { setTimeout(() => { this.n = Math.max(0, this.n - 1); if (!this.n) fit(); }, 400); } } };
// ───────────────── 알림 (토스 알림 동의) — 켠 다음 날부터 출석 선물 2배 ─────────────────
// 게임은 알림을 껐는지 알 수 없음(SDK 조회 불가) → 한 번 동의하면 켠 상태로 봄
const Alarm = {
  on() { return !!S.notifOk; },
  today() { return !!S.notifOk && S.notifSince === dayKey(); },   // 오늘 켬 = 오늘은 1배, 내일부터 2배
  // 알림 동의 화면 → 결과 그대로 반환 ('newAgreement' · 'alreadyAgreed' · 'agreementRejected' · null)
  async ask() {
    const r = await Platform.agreeNotification();
    if (r === 'newAgreement' || r === 'alreadyAgreed') {
      if (!S.notifSince || !S.notifOk) S.notifSince = dayKey();
      S.notifOk = true; if (r === 'alreadyAgreed' && !S.notifDone) S.notifHidden = true;   // 이미 동의한 유저는 '알림 받기' 미션 숨김(보상 없음)
      save(); refreshLobby();
    }
    return r;
  },
};

// ───────────────── 사운드 (WebAudio 합성) ─────────────────
const Sfx = (() => {
  let ac = null, noiseBuf = null, master = null, sfxBus = null, bgmBus = null;
  const ctx = () => {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ac = new C();
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ac.destination);
      master = ac.createGain(); master.gain.value = 0.9; master.connect(comp);
      sfxBus = ac.createGain(); sfxBus.connect(master);
      bgmBus = ac.createGain(); bgmBus.gain.value = 0; bgmBus.connect(master);
    }
    if (ac.state === 'suspended' && !document.hidden) ac.resume();
    return ac;
  };
  const T = () => ac.currentTime;
  // 기본 음 (env: 짧은 어택 → 지수 감쇠), lp = 저역통과로 부드럽게
  const voice = (dest, f, t, dur, type = 'sine', vol = 0.18, f2 = null, lp = 0) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.setTargetAtTime(0.0001, t + 0.008, dur / 4);
    let n = o; if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; }
    n.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.03);
  };
  const nz = (dest, t, dur, f1, f2, vol = 0.25, q = 1.2, type = 'bandpass') => {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = type; bp.Q.value = q; bp.frequency.setValueAtTime(f1, t); bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  };
  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const fx = (fn) => () => { if (!S.sound || !ctx()) return; fn(T()); };
  const tone = (f, dt, dur, type, vol, f2, lp) => voice(sfxBus, f, T() + dt, dur, type, vol, f2, lp);
  const notes = (ms, gap, dur, type, vol, lp) => ms.forEach((m, i) => m && tone(mf(m), i * gap, dur, type, vol, null, lp));

  // ───── 배경음 (절차 생성, 8분음표 단위 스케줄러) ─────
  // 진행 C–Am–F–G, 트랙마다 빠르기·멜로디·드럼만 다름
  const ROOT = [48, 45, 41, 43], TRI = [[0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]];
  const TRACKS = {
    lobby: { bpm: 96, drums: false, vol: 0.5,
      mel: [76, 0, 79, 0, 81, 79, 76, 0, 72, 0, 76, 0, 74, 72, 69, 0, 69, 0, 72, 0, 74, 72, 69, 65, 67, 0, 71, 74, 72, 0, 71, 0],
      mel2: [79, 0, 76, 0, 79, 81, 84, 0, 81, 0, 76, 0, 79, 76, 72, 0, 77, 0, 76, 0, 74, 72, 69, 0, 71, 72, 74, 0, 71, 0, 67, 0] },
    play: { bpm: 122, drums: true, vol: 0.42,
      mel: [67, 72, 76, 79, 0, 76, 79, 0, 69, 72, 76, 81, 0, 79, 76, 0, 65, 69, 72, 77, 0, 76, 72, 0, 67, 71, 74, 79, 0, 77, 74, 71],
      mel2: [79, 0, 79, 76, 0, 72, 76, 0, 81, 0, 81, 76, 0, 72, 69, 0, 77, 0, 77, 72, 0, 69, 72, 0, 74, 76, 77, 79, 0, 0, 0, 0] },
  };
  const M = { cur: null, step: 0, next: 0, timer: null, ducked: false };
  const playStep = (tr, s, t) => {
    const e = 60 / tr.bpm / 2, bar = Math.floor(s / 8) % 4, i = s % 8, loop = Math.floor(s / 32) % 2;
    const r = ROOT[bar], tri = TRI[bar];
    // 베이스
    if (tr.drums ? i % 2 === 0 : i % 4 === 0) voice(bgmBus, mf(r + (tr.drums && i % 4 === 2 ? 12 : 0)), t, e * (tr.drums ? 1.6 : 3.2), 'triangle', 0.32, null, 900);
    // 화음 뜯기 (아르페지오)
    voice(bgmBus, mf(r + 24 + tri[i % 3]), t, e * 1.8, 'triangle', 0.07, null, 2400);
    // 멜로디 (두 번째 바퀴는 변주)
    const m = (loop ? tr.mel2 : tr.mel)[bar * 8 + i];
    if (m) { voice(bgmBus, mf(m), t, e * (tr.drums ? 1.1 : 1.7), 'square', 0.055, null, 2600); voice(bgmBus, mf(m + 12), t, e * 0.6, 'sine', 0.03); }
    if (tr.drums) {
      if (i % 4 === 0) voice(bgmBus, 140, t, 0.16, 'sine', 0.42, 45);           // 킥
      if (i === 2 || i === 6) nz(bgmBus, t, 0.12, 1800, 1200, 0.12, 0.9);       // 스네어(박수)
      nz(bgmBus, t, 0.035, 9000, 7000, i % 2 ? 0.035 : 0.055, 0.7, 'highpass'); // 하이햇
    }
  };
  const sched = () => {
    if (!ac || !M.cur) return; const tr = TRACKS[M.cur];
    if (M.next < T() - 0.3) M.next = T() + 0.05;  // 백그라운드 복귀 등으로 밀렸으면 건너뜀
    while (M.next < T() + 0.15) { playStep(tr, M.step, M.next); M.next += 60 / tr.bpm / 2; M.step++; }
  };
  const bgmLevel = () => (!S.bgm || !M.cur) ? 0 : (M.noFile ? TRACKS[M.cur].vol : 0.7) * (M.ducked ? 0.3 : 1);
  const applyBgm = (time = 0.4) => { if (!ac) return; const g = bgmBus.gain; g.cancelScheduledValues(T()); g.setValueAtTime(g.value, T()); g.linearRampToValueAtTime(bgmLevel(), T() + time); };
  // 배경음 파일 (직접 작곡·렌더한 곡, bgm_*.mp4). 앞뒤 0.5초 여유를 두고 정확한 마디 길이로 반복 → 이음새 없음
  // 파일을 못 읽는 환경이면 위의 합성 배경음으로 대신 재생
  const FILES = { lobby: { url: 'bgm_lobby.mp4', len: 38.4 }, play: { url: 'bgm_play.mp4', len: 30 } }, PRE = 0.5;
  const buf = {}, raw = {}, live = {};
  const fetchRaw = (n) => raw[n] || (raw[n] = fetch(FILES[n].url).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }));
  const decode = (n) => buf[n] || (buf[n] = fetchRaw(n).then(ab => new Promise((res, rej) => { const p = ac.decodeAudioData(ab.slice(0), res, rej); if (p && p.catch) p.catch(rej); })).catch(e => { delete buf[n]; throw e; }));
  const stopFile = (n, fade = 0.6) => { const v = live[n]; if (!v) return; delete live[n]; try { v.g.gain.setTargetAtTime(0, T(), fade / 3); v.s.stop(T() + fade + 0.05); } catch (e) {} };
  const startFile = (n, b) => {
    if (M.cur !== n || live[n]) return; Object.keys(live).forEach(k => stopFile(k));
    if (M.timer) { clearInterval(M.timer); M.timer = null; }
    const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; s.loop = true; s.loopStart = PRE; s.loopEnd = Math.min(b.duration, PRE + FILES[n].len);
    g.gain.setValueAtTime(0, T()); g.gain.linearRampToValueAtTime(1, T() + 0.8); s.connect(g).connect(bgmBus); s.start(T() + 0.02, PRE); live[n] = { s, g };
  };
  const bgm = (name) => {
    if (!ctx()) return; if (M.cur === name) { M.ducked = false; applyBgm(); return; }
    M.cur = name; M.step = 0; M.next = T() + 0.08; M.ducked = false;
    bgmBus.gain.setValueAtTime(bgmBus.gain.value, T()); applyBgm(0.6);
    if (FILES[name] && !M.noFile) {
      Object.keys(live).forEach(k => k !== name && stopFile(k));
      decode(name).then(b => startFile(name, b)).catch(() => { M.noFile = true; if (M.cur === name && !M.timer) M.timer = setInterval(sched, 25); });
    } else if (!M.timer) M.timer = setInterval(sched, 25);
  };

  return {
    unlock: () => { const was = ac && ac.state; ctx(); if (M.cur && was !== 'running') applyBgm(); },
    suspend: () => { try { ac && ac.suspend(); } catch (e) {} },
    resume: () => { try { ac && ac.resume(); } catch (e) {} },
    preload: () => { for (const n in FILES) fetchRaw(n).catch(() => {}); },
    bgm, duck: (on) => { M.ducked = on; applyBgm(0.25); }, refreshBgm: () => applyBgm(0.3),
    tick: (hi) => fx(() => tone(hi ? 1480 : 880, 0, hi ? 0.05 : 0.08, 'sine', hi ? 0.12 : 0.16))(),
    go: fx(() => { tone(784, 0, 0.09, 'square', 0.08, null, 3000); tone(1175, 0.08, 0.28, 'square', 0.1, null, 3500); nz(sfxBus, T(), 0.25, 2000, 6000, 0.08); }),
    // 칼 휘두르는 바람 소리
    // 고양이 칼 휘두르기용 '휙' (big = 크게 베는 '쉭-챙')
    slash: (big) => fx((t) => { nz(sfxBus, t, big ? 0.26 : 0.18, 380, big ? 7000 : 5200, big ? 0.3 : 0.22, 0.8);
      nz(sfxBus, t + 0.02, 0.12, 3000, 9000, 0.09, 1.4, 'highpass');
      if (big) { voice(sfxBus, 2400, t + 0.06, 0.35, 'triangle', 0.06, 3100); voice(sfxBus, 3600, t + 0.07, 0.25, 'sine', 0.04); } })(),
    swish: fx((t) => { nz(sfxBus, t, 0.2, 700, 5200, 0.2, 0.9); nz(sfxBus, t + 0.03, 0.14, 2500, 8000, 0.08, 1.5, 'highpass'); }),
    // 자를 때: 금속성 '슥' + 빵 써는 '탁'
    // 컷 확정 '챙~' (칼이 빛나는 금속음)
    shing: fx((t) => { voice(sfxBus, 3400, t, 0.22, 'sine', 0.05, 2500); voice(sfxBus, 5200, t + 0.012, 0.14, 'sine', 0.025, 4100); nz(sfxBus, t, 0.06, 9000, 6000, 0.12, 4); }),
    cut: fx((t) => { nz(sfxBus, t, 0.08, 7000, 3000, 0.32, 3); voice(sfxBus, 2600, t, 0.12, 'triangle', 0.06, 1800); voice(sfxBus, 260, t + 0.01, 0.11, 'sine', 0.3, 90); nz(sfxBus, t + 0.01, 0.12, 900, 300, 0.22, 1); }),
    // 조각이 벌어질 때
    split: fx((t) => { voice(sfxBus, 180, t, 0.16, 'sine', 0.25, 70); nz(sfxBus, t, 0.22, 1400, 400, 0.12, 0.8); }),
    // 결과 기다리는 드럼롤
    roll: (dur = 0.6) => { if (!S.sound || !ctx()) return; const t = T(); for (let k = 0, n = Math.floor(dur / 0.045); k < n; k++) nz(sfxBus, t + k * 0.045, 0.05, 1600, 1100, 0.04 + 0.08 * k / n, 1); },
    pop: (i = 0) => fx(() => { tone(mf(72 + [0, 4, 7, 12, 16][i % 5]), 0, 0.14, 'sine', 0.16, null); tone(mf(84 + [0, 4, 7, 12, 16][i % 5]), 0, 0.06, 'triangle', 0.05); })(),
    click: fx(() => tone(660, 0, 0.06, 'triangle', 0.12, 990)),
    // 단계 성공 징글
    success: fx(() => { notes([72, 76, 79, 84], 0.085, 0.24, 'square', 0.07, 3200); notes([60, 0, 0, 67], 0.085, 0.3, 'triangle', 0.18); tone(mf(88), 0.36, 0.5, 'sine', 0.08); }),
    // 모든 단계 성공 팡파레
    fanfare: fx(() => {
      notes([67, 67, 67, 72, 0, 76, 79, 0, 84], 0.1, 0.22, 'square', 0.08, 3500);
      notes([48, 0, 0, 55, 0, 60, 0, 0, 60], 0.1, 0.4, 'triangle', 0.22);
      [84, 88, 91, 96].forEach((m, i) => tone(mf(m), 0.85 + i * 0.05, 0.6, 'sine', 0.05));
      nz(sfxBus, T() + 0.8, 0.6, 6000, 9000, 0.05, 0.6, 'highpass');
    }),
    perfect: fx(() => { [84, 88, 91, 96, 100].forEach((m, i) => tone(mf(m), i * 0.05, 0.35, 'sine', 0.1)); }),
    // 실패: 트롬본 '뿌우우'
    fail: fx(() => { [[55, 0], [54, 0.22], [53, 0.44]].forEach(([m, d]) => tone(mf(m), d, 0.22, 'sawtooth', 0.07, null, 900)); tone(mf(52), 0.66, 0.6, 'sawtooth', 0.08, mf(49), 800); }),
    coin: fx(() => { tone(988, 0, 0.08, 'square', 0.06, null, 4000); tone(1318, 0.07, 0.22, 'square', 0.07, null, 4000); }),
    stamp: fx((t) => { voice(sfxBus, 120, t, 0.22, 'sine', 0.4, 50); nz(sfxBus, t, 0.14, 700, 200, 0.22); }),
    // 실패 판이 떨어지는 둔탁한 '쿵'
    thud: fx((t) => { voice(sfxBus, 90, t, 0.35, 'sine', 0.5, 38); nz(sfxBus, t, 0.25, 500, 120, 0.25, 0.7, 'lowpass'); }),
    // 불꽃놀이 '펑' + 타닥
    boom: fx((t) => { voice(sfxBus, 70, t, 0.3, 'sine', 0.3, 35); nz(sfxBus, t, 0.35, 1200, 200, 0.18, 0.7, 'lowpass'); for (let k = 0; k < 6; k++) nz(sfxBus, t + 0.12 + Math.random() * 0.3, 0.03, 5000, 3000, 0.05, 2); }),
    // 점수 다 올라갔을 때 '띵'
    ding: fx(() => { tone(mf(91), 0, 0.5, 'sine', 0.12); tone(mf(98), 0.04, 0.4, 'sine', 0.06); }),
    // 점수 올라가는 동안 '틱틱' (점점 높아짐)
    count: (k = 0) => fx(() => tone(700 + k * 900, 0, 0.03, 'square', 0.035, null, 3000))(),
  };
})();

// ───────────────── 레이아웃 ─────────────────
const $ = (id) => document.getElementById(id);
const app = $('app'), gcv = $('game'), fcv = $('fx');
const gctx = gcv.getContext('2d'), fctx = fcv.getContext('2d');
const L = { W: 360, H: 780, s: 1, dpr: 1, hdrTop: 12, bottom: 24, foodCX: 180, foodCY: 420 };
function safeInset(side) {
  const ti = window.TossSafeArea; if (ti && typeof ti[side] === 'number') return ti[side];   // 토스: SDK 값 우선
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;${side}:0;height:env(safe-area-inset-${side});width:1px;visibility:hidden`;
  document.body.appendChild(probe); const v = probe.getBoundingClientRect().height; probe.remove(); return v || 0;
}
function fit() {
  // 키보드가 떠 있는 동안(닉네임 입력)은 다시 맞추지 않음 → 화면이 출렁이지 않게
  const ae = document.activeElement; if (ae && ae.tagName === 'INPUT' && L._fitted) return;
  // 토스 SDK 화면(로그인·알림 동의·광고)이 떠 있는 동안도 그대로: 웹뷰 높이가 줄어도 팝업이 위로 밀려 올라가지 않고 SDK가 위에 덮음
  if (SdkGuard.on && L._fitted) return;
  // 실제로 보이는 크기 기준 (iOS 사파리 주소창·툴바 제외)
  const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
  let s;
  if (vw <= 520) { s = vw / 360; if (vh / s < 560) s = vh / 560; }        // 휴대폰: 가로를 꽉 채움 (세로가 아주 짧을 때만 축소)
  else { s = Math.min(vw / 360, 480 / 360); if (vh / s < 640) s = vh / 640; }  // 폴드 펼침·태블릿: 지금처럼 가운데
  L._fitted = true;
  L.s = s; L.H = Math.round(vh / s); L.dpr = Math.min(window.devicePixelRatio || 1, 2);
  app.style.height = L.H + 'px'; app.style.transform = `translate(-50%,0) scale(${s})`;
  const sTop = safeInset('top'); document.documentElement.style.setProperty('--safe-top', sTop + 'px');
  // 토스: 상단 버튼 줄을 토스 헤더(더보기·닫기) 버튼과 세로 가운데 정렬. 토스 버튼 위치 = 세이프영역 + 5(iOS)/10(Android), 높이 약 34
  const tossNav = window.__gameChannel === 'toss' ? (window.TossOS === 'android' ? 27 : 22) : 0;
  document.documentElement.style.setProperty('--toss-nav', (tossNav || 22) + 'px');
  L.hdrTop = tossNav ? (sTop + tossNav) / s - 18 : 12 + sTop / s; L.bottom = 24 + safeInset('bottom') / s;
  app.style.setProperty('--hdr-top', L.hdrTop + 'px'); app.style.setProperty('--bottom-pad', L.bottom + 'px');
  // 팝업 최대 높이: 보이는 높이(토스 헤더·세이프영역 제외)의 80%, 단 위아래 16px 여유는 항상 남김
  // 팝업 최대 높이 (v0.9.32): 보이는 높이(토스 헤더·세이프영역 제외)에서 위아래 12px만 남기고 최대로. 최소 높이는 없음(내용만큼), 넘치면 본문 스크롤
  const popTop = tossNav ? L.hdrTop + 44 : sTop / s, popBot = safeInset('bottom') / s, vis = L.H - popTop - popBot;
  app.style.setProperty('--pop-top', popTop + 'px'); app.style.setProperty('--pop-bot', popBot + 'px'); app.style.setProperty('--pop-max', Math.round(vis - 24) + 'px');
  for (const c of [gcv, fcv]) { c.width = Math.round(360 * s * L.dpr); c.height = Math.round(L.H * s * L.dpr); c.style.width = '360px'; c.style.height = L.H + 'px'; }
  const top = L.hdrTop + 222, bot = L.H - L.bottom - 76;
  L.foodCX = 180; L.foodCY = Math.round((top + bot) / 2);
  Food.prepare();
  $('ring').style.top = (L.foodCY - 58) + 'px'; $('stageLabel').style.top = (L.foodCY - 58 - 48) + 'px'; $('ready').style.top = (L.foodCY - 22) + 'px';
}

// ───────────────── 음식 (자리표시 붕어빵 → 에셋 교체) ─────────────────
const FISH_PATH = 'M18 92 C18 38 80 18 132 28 C162 34 178 52 186 68 L228 40 C236 35 243 42 239 50 L218 90 L239 130 C243 138 236 145 228 140 L186 112 C178 128 162 146 132 152 C80 162 18 146 18 92Z';
// 스테이지마다 무작위로 나오는 음식 (난이도는 같고 그림만 다름). img = ASSETS 키, 없으면 draw 로 그린 자리표시
const FOOD_LIST = [['bungeo', '붕어빵'], ['ramen', '라멘'], ['lasagna', '라자냐'], ['burrito', '부리토'], ['egg', '계란후라이'], ['pancake', '팬케이크'], ['pizza', '피자'],
  ['avocado', '아보카도 토스트'], ['sushi', '새우초밥'], ['cake', '딸기 케이크'], ['steak', '스테이크'], ['pie', '파이'], ['croissant', '크루아상'], ['dumpling', '만두'],
  ['macaron', '마카롱'], ['challah', '꽈배기빵'], ['burger', '햄버거'], ['waffle', '와플'], ['gimbap', '김밥'], ['cookie', '쿠키'],
  ['donut', '도넛'], ['dorayaki', '도라야키'], ['hotdog', '핫도그'], ['pepperoni', '페퍼로니 피자'], ['buttercroissant', '버터 크루아상'], ['hotcake', '핫케이크'],
  ['xiaolongbao', '샤오롱바오'], ['dango', '경단 꼬치'], ['sakuramochi', '벚꽃떡'], ['muffin', '초코칩 머핀'], ['asparagus', '아스파라거스 베이컨말이'], ['crab', '꽃게'],
  ['shrimp', '새우'], ['icebar', '초코 아이스바'], ['drumstick', '닭다리 튀김'], ['onionring', '어니언링'], ['fruitwaffle', '과일 와플'], ['cheesecake', '블루베리 치즈케이크'],
  ['porkbelly', '삼겹살'], ['beef', '소고기'], ['salmon', '연어 스테이크'], ['broccoli', '브로콜리'], ['brownegg', '달걀'], ['potato', '감자'],
  ['mushroom', '표고버섯'], ['tomato', '토마토'], ['cabbage', '양배추'], ['cheese', '치즈'], ['carrot', '당근'], ['paprika', '파프리카']];
// 음식 이미지는 foods/<id>.webp (투명 배경, 여백 잘라낸 540px). 필요할 때 불러옴
const FOODS = FOOD_LIST.map(([id, name]) => ({ id, name, src: `foods/${id}.webp` }));
const TALKS = ['그림을 정확하게\n1/2로 나눠요', '그림을 정확하게\n1/3로 나눠요', '오, 제법인데?\n마지막! 스피드가 생명!'];
const FoodLoader = {
  cache: {},
  // fetch → blob URL 로 읽어 캔버스가 오염(taint)되지 않게 함 (판정 마스크에 getImageData 필요)
  load(def) {
    if (!this.cache[def.id]) this.cache[def.id] = fetch(def.src).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(b => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(b); }))
      .catch(e => { delete this.cache[def.id]; throw e; });
    return this.cache[def.id];
  },
  preloadAll() { let i = 0; const next = () => { if (i >= FOODS.length) return; this.load(FOODS[i++]).catch(() => {}).finally(() => setTimeout(next, 60)); }; next(); },
};
const Food = {
  def: null, images: {},
  set(def, img) { this.def = def; this.img = img || null; this.prepare(); },
  img: null,           // 사용자 에셋(PNG, 투명 배경)이 오면 Image 로 교체: Food.useImage(url)
  w: 280, h: 202, canvas: null, mask: null, mw: 0, mh: 0, total: 0,
  drawPlaceholder(c, w, h) {
    const sx = w / 250, sy = h / 180; c.save(); c.scale(sx, sy);
    const body = new Path2D(FISH_PATH);
    const g = c.createRadialGradient(110, 80, 10, 120, 92, 140); g.addColorStop(0, '#ffd27a'); g.addColorStop(0.55, '#f4a849'); g.addColorStop(1, '#d97f2a');
    c.fillStyle = g; c.fill(body);
    c.save(); c.clip(body);
    c.strokeStyle = 'rgba(176,96,28,.55)'; c.lineWidth = 4; c.lineCap = 'round';
    for (let col = 0; col < 4; col++) for (let r = 0; r < 4; r++) { c.beginPath(); c.arc(92 + col * 22 + (r % 2) * 11, 52 + r * 24, 10, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    c.fillStyle = 'rgba(255,240,200,.35)'; c.beginPath(); c.ellipse(96, 60, 54, 16, -0.2, 0, Math.PI * 2); c.fill();
    c.restore();
    c.strokeStyle = '#a85a1a'; c.lineWidth = 5; c.lineJoin = 'round'; c.stroke(body);
    c.strokeStyle = 'rgba(168,90,26,.6)'; c.lineWidth = 3.5;
    c.beginPath(); c.moveTo(196, 72); c.lineTo(214, 88); c.lineTo(196, 108); c.stroke();
    c.beginPath(); c.moveTo(70, 30); c.quadraticCurveTo(84, 18, 104, 24); c.stroke();
    c.fillStyle = '#3d220c'; c.beginPath(); c.arc(56, 78, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(53, 75, 2.6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#a85a1a'; c.lineWidth = 3.5; c.beginPath(); c.arc(36, 104, 9, -0.2, 0.9); c.stroke();
    c.restore();
  },
  useImage(url) { const im = new Image(); im.onload = () => { this.img = im; this.prepare(); }; im.src = url; },
  prepare() {
    const d0 = this.def || {}; const ar = this.img ? this.img.width / this.img.height : 1 / 0.72;  // 가로 270·세로 250 상자 안에 비율 유지
    this.w = Math.round(Math.min(CFG.foodW, CFG.foodH * ar)); this.h = Math.round(this.w / ar);
    const draw = d0.draw || ((c, w, h) => this.drawPlaceholder(c, w, h));
    const k = L.s * L.dpr;
    const cv = document.createElement('canvas'); cv.width = Math.ceil(this.w * k) + 4; cv.height = Math.ceil(this.h * k) + 4;
    const c = cv.getContext('2d'); c.translate(2, 2);
    if (this.img) c.drawImage(this.img, 0, 0, this.w * k, this.h * k); else draw(c, this.w * k, this.h * k);
    this.canvas = cv; this.k = k;
    // 판정용 마스크 (논리 1px)
    const mw = this.mw = Math.ceil(this.w), mh = this.mh = Math.ceil(this.h);
    const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh; const m = mc.getContext('2d', { willReadFrequently: true });
    if (this.img) m.drawImage(this.img, 0, 0, this.w, this.h); else draw(m, this.w, this.h);
    const d = m.getImageData(0, 0, mw, mh).data; this.mask = new Uint8Array(mw * mh); let t = 0;
    for (let i = 0; i < mw * mh; i++) if (d[i * 4 + 3] > 127) { this.mask[i] = 1; t++; }
    this.total = t;
    let cx = 0, cy = 0; for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (this.mask[y * mw + x]) { cx += x; cy += y; }
    this.cx = cx / t; this.cy = cy / t;
  },
  // 논리 좌표 → 음식 로컬
  ox() { return L.foodCX - this.w / 2; }, oy() { return L.foodCY - this.h / 2; },
  draw(c, x, y, alpha = 1) { c.save(); c.globalAlpha = alpha; c.drawImage(this.canvas, x - 2 / this.k, y - 2 / this.k, this.canvas.width / this.k, this.canvas.height / this.k); c.restore(); },
};

// ───────────────── 기하 / 판정 ─────────────────
// 직선: 음식 로컬 좌표 p, 방향 d (정규화)
const side = (ln, x, y) => (x - ln.px) * ln.dy - (y - ln.py) * ln.dx;
function lineSplits(ln) {
  let pos = 0, neg = 0; const { mask, mw, mh } = Food;
  for (let y = 0; y < mh; y += 2) for (let x = 0; x < mw; x += 2) if (mask[y * mw + x]) { side(ln, x + 0.5, y + 0.5) > 0 ? pos++ : neg++; }
  const t = pos + neg; return Math.min(pos, neg) / t > 0.01;
}
function computePieces(lines) {
  const { mask, mw, mh, total } = Food; const n = mw * mh;
  const sig = new Int32Array(n).fill(-1);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const i = y * mw + x; if (!mask[i]) continue; let s = 0;
    for (let k = 0; k < lines.length; k++) if (side(lines[k], x + 0.5, y + 0.5) > 0) s |= 1 << k; sig[i] = s; }
  const lab = new Int32Array(n).fill(-1); const comps = []; const stack = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (sig[i] < 0 || lab[i] >= 0) continue;
    const id = comps.length, s0 = sig[i]; let sp = 0, area = 0, sx = 0, sy = 0; stack[sp++] = i; lab[i] = id;
    while (sp) { const j = stack[--sp]; area++; const x = j % mw, y = (j / mw) | 0; sx += x; sy += y;
      if (x > 0 && lab[j - 1] < 0 && sig[j - 1] === s0) { lab[j - 1] = id; stack[sp++] = j - 1; }
      if (x < mw - 1 && lab[j + 1] < 0 && sig[j + 1] === s0) { lab[j + 1] = id; stack[sp++] = j + 1; }
      if (y > 0 && lab[j - mw] < 0 && sig[j - mw] === s0) { lab[j - mw] = id; stack[sp++] = j - mw; }
      if (y < mh - 1 && lab[j + mw] < 0 && sig[j + mw] === s0) { lab[j + mw] = id; stack[sp++] = j + mw; } }
    comps.push({ sig: s0, area, cx: sx / area + 0.5, cy: sy / area + 0.5 });
  }
  // 조각 = 칼 선으로 나뉜 같은 구역(서명)의 묶음. 화면에서도 같은 구역은 함께 벌어지므로
  // 오목한 음식(크루아상 양끝 등)이 한 칼에 두 덩어리로 갈려도 한 조각으로 셈 → 보이는 것과 판정이 같음
  const bySig = new Map();
  for (const c of comps) { const g = bySig.get(c.sig); if (!g) bySig.set(c.sig, { sig: c.sig, area: c.area, big: c }); else { g.area += c.area; if (c.area > g.big.area) g.big = c; } }
  const pieces = [...bySig.values()].filter(g => g.area / total >= CFG.crumbRatio).map(g => ({ sig: g.sig, area: g.area, cx: g.big.cx, cy: g.big.cy })).sort((a, b) => b.area - a.area);
  return { comps, pieces, total };
}
function scoreOf(stage, res, timeRatio) {
  const N = stage.pieces, ideal = res.total / N;
  if (res.pieces.length !== N) return { ok: false, reason: 'count', score: 0, acc: 0 };
  const dev = res.pieces.reduce((a, p) => a + Math.abs(p.area / ideal - 1), 0) / N;
  const acc = Math.max(0, Math.min(100, 100 - stage.K * dev * 100));
  const sc = stage.speed ? acc * (1 - stage.speed) + 100 * stage.speed * Math.max(0, timeRatio) : acc;
  const score = Math.round(sc * 10) / 10;
  return { ok: score >= stage.pass, score, acc, dev };
}
// 볼록 다각형을 반평면으로 자르기 (Sutherland–Hodgman)
function clipPoly(poly, ln, keepPos) {
  const out = []; const inside = (p) => (side(ln, p[0], p[1]) > 0) === keepPos;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) { const sa = side(ln, a[0], a[1]), sb = side(ln, b[0], b[1]); const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
  return out;
}
function regionPoly(sigBits, lines) {
  let poly = [[-40, -40], [Food.w + 40, -40], [Food.w + 40, Food.h + 40], [-40, Food.h + 40]];
  lines.forEach((ln, k) => { poly = clipPoly(poly, ln, !!(sigBits & (1 << k))); });
  return poly;
}
// 직선을 음식 영역(+여유)으로 자른 선분
function lineSegment(ln, pad = 14) {
  const b = [[-pad, -pad], [Food.w + pad, -pad], [Food.w + pad, Food.h + pad], [-pad, Food.h + pad]];
  const pts = []; for (let i = 0; i < 4; i++) { const a = b[i], c = b[(i + 1) % 4]; const sa = side(ln, a[0], a[1]), sc = side(ln, c[0], c[1]);
    if ((sa > 0) !== (sc > 0)) { const t = sa / (sa - sc); pts.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]); } }
  return pts.length >= 2 ? pts.slice(0, 2) : null;
}

// ───────────────── 상태 ─────────────────
const G = {
  state: 'lobby', stage: 0, lines: [], cutsLeft: 0, timeLeft: 0, paused: false,
  stageScores: [], adUsed: 0, playCounted: true, countT: 0, judge: null, splitT: 0, shakeT: 0, failShakeT: 0,
  trail: [], dragging: false, dragStart: null, foodAlpha: 1, flash: [], seconds: 0,
};

// ───────────────── 파티클 / FX ─────────────────
const P = []; // {x,y,vx,vy,life,max,size,color,kind,rot,vr}
function crumbs(x0, y0, x1, y1, n = 12) {
  const cols = ['#c8611a', '#ffc928', '#d9822e', '#8a4a14', '#ffe08a'];
  for (let i = 0; i < n; i++) { const t = Math.random(); const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    P.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 140, life: 0, max: 0.5 + Math.random() * 0.3, size: 2 + Math.random() * 3.5, color: cols[i % cols.length], kind: 'dot', g: 600 }); }
}
function confetti(n = 46) {
  const cols = [['#ffd54a', '#c99a10'], ['#ffffff', '#d8d2c4'], ['#ff7a8a', '#c8405a'], ['#6fd3ff', '#2f8ac0'], ['#8ae66a', '#3e9a2a'], ['#ffb26a', '#d8742a']];
  for (let i = 0; i < n; i++) { const cc = cols[i % cols.length]; P.push({ x: 10 + Math.random() * 340, y: -20 - Math.random() * 160, vx: (Math.random() - 0.5) * 50, vy: 60 + Math.random() * 90,
    life: 0, max: 2.6 + Math.random() * 1.2, size: 5 + Math.random() * 5, color: cc[0], dark: cc[1], kind: 'paper', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8, g: 30, sw: 20 + Math.random() * 30, ph: Math.random() * 6, drag: 0.4 }); }
}
function sparkles(x, y, n = 8) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
    P.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.6, size: 6 + Math.random() * 6, color: '#fff3b0', kind: 'star', g: 0 }); }
}
// ───────────────── PERFECT 고양이 칼 휘두르기 (cat_slash.webp: 4×4 시트 16프레임, 16fps = 1초) ─────────────────
const CatSlash = {
  img: null, ok: false,
  preload() { if (this.img) return; const im = new Image(); im.onload = () => { this.ok = true; }; im.src = 'cat_slash.webp'; this.img = im; },
  // 프레임별 표시 시간(ms): 휘두르는 구간은 빠르게, 베는 순간은 잠깐 멈춤(히트스톱)
  DUR: [40, 35, 110, 45, 45, 40, 40, 40, 40, 35, 35, 80, 35, 35, 45, 70],
  // 칼이 지나가는 프레임: 소리 · 진동 · 화면 베기 궤적(각도) · 줌 펀치
  HITS: { 0: { big: false, a: [-2.6, -0.9], r: 120 }, 2: { big: true, a: [-2.9, 0.2], r: 150 }, 9: { big: false, a: [2.6, 0.9], r: 130 }, 12: { big: true, a: [-0.4, 2.4], r: 140 } },
  play(done) {
    if (!this.ok) { this.preload(); done(); return; }
    const x = 180, y = L.foodCY;
    const el = document.createElement('div'); el.className = 'catSlash';
    el.style.cssText = `left:${x}px;top:${y}px;background-image:url(${this.img.src})`;
    app.appendChild(el);
    FX.dark(x, y, 0.55, 1.25); FX.speedLines(x, y, 1.05);
    // 등장: 크게 → 제자리로 확 (모션 블러)
    el.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(1.6)', filter: 'blur(6px)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(.94)', filter: 'blur(0)', offset: .7 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', filter: 'blur(0)' }],
      { duration: 130, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    let f = 0;
    const step = () => {
      el.style.backgroundPosition = `${(f % 4) * 100 / 3}% ${Math.floor(f / 4) * 100 / 3}%`;
      const h = this.HITS[f];
      if (h) {
        Sfx.slash(h.big); Platform.haptic(h.big ? 'stamp' : 'cut');
        FX.arcSlash(x, y, h.r, h.a[0], h.a[1], h.big ? 0.32 : 0.24, h.big ? 18 : 12);
        G.shakeT = h.big ? 0.18 : 0.1;
        el.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: `translate(calc(-50% + ${h.big ? 7 : 4}px),calc(-50% - 3px)) scale(${h.big ? 1.13 : 1.06})`, offset: .25 }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: h.big ? 200 : 140, easing: 'ease-out', composite: 'replace' });
        if (h.big) { FX.flash('#fff', 0.55); FX.streaks(x, y, ['#ffffff', '#ffe58a', '#fff6d0'], 26, 340); }
      }
      const d = this.DUR[f]; f++;
      if (f < 16) setTimeout(step, d);
      else setTimeout(() => { el.animate([{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)', filter: 'blur(0)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.25)', filter: 'blur(4px)' }], { duration: 150, fill: 'forwards' }).onfinish = () => el.remove(); done(); }, d);
    };
    step();
  },
};

// ───────────────── 결과 이펙트 ─────────────────
// 판 연출(크게 → 쾅 → 살짝 눌림 → 제자리)은 도장과 같은 문법. 뒤 배경은 단색 도형 대신
// 빛 번짐(bloom)·부드러운 빛줄기·빛 고리·반짝이(glint)·불꽃 꼬리(streak)·연기를 겹쳐 그림 (더하기 합성)
const FX_THEME = {
  success: { g1: '#a8ef7c', g2: '#3ea52a', b: '#1f6512', light: [255, 236, 160], glints: ['#fffbe6', '#fff0a8', '#b8ffd0'] },
  perfect: { g1: '#fff4b8', g2: '#ffb800', b: '#b8560f', light: [255, 214, 90], glints: ['#ffffff', '#ffe58a', '#ffd04a', '#fff6d0'] },
  final:   { g1: '#ffd9a0', g2: '#ff8a1f', b: '#a2470c', light: [255, 200, 120], glints: ['#ffffff', '#ffe08a', '#ffc6a8', '#c8f0ff'] },
  fail:    { g1: '#ff9a8a', g2: '#d9322a', b: '#8a1810', light: null, glints: [] },
};
const FXL = [];  // 화면 덮는 빛 효과 {type,x,y,t,dur,...}
// 색: [r,g,b] 배열 또는 '#rrggbb' 둘 다 받음 (잘못된 색이면 흰색)
const toRGB = (c) => Array.isArray(c) ? c : (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c) ? [0, 2, 4].map(i => parseInt(c.replace('#', '').slice(i, i + 2), 16)) : [255, 255, 255]);
const rgba = (c, a) => { const v = toRGB(c); return `rgba(${v[0]},${v[1]},${v[2]},${Math.max(0, Math.min(1, +a || 0))})`; };
const FX = {
  bloom(x, y, light, r = 170, dur = 0.7, a = 0.9) { FXL.push({ type: 'bloom', x, y, light, r, dur, a, t: 0 }); },
  rays(x, y, light, dur = 1.6, n = 18, len = 230) { FXL.push({ type: 'rays', x, y, light, dur, t: 0, rot: Math.random() * 6, spec: Array.from({ length: n }, (_, i) => ({ a: i / n * Math.PI * 2 + Math.random() * 0.2, w: 0.03 + Math.random() * 0.06, l: len * (0.6 + Math.random() * 0.5) })) }); },
  wave(x, y, light, r = 150, dur = 0.55, w = 10) { FXL.push({ type: 'wave', x, y, light, r, dur, w, t: 0 }); },
  vignette(color, dur = 0.7) { FXL.push({ type: 'vig', color, dur, t: 0 }); },
  // 집중선 (만화식 속도선) — 가운데로 몰리는 흰 선이 깜빡임
  speedLines(x, y, dur = 1) { FXL.push({ type: 'speed', x, y, dur, t: 0, seed: Math.random() * 100 }); },
  // 화면 베기 궤적: 원호를 따라 흰 칼빛이 빠르게 지나감
  cutLine(x0, y0, x1, y1, dur = 0.55) { FXL.push({ type: 'cut', x0, y0, x1, y1, dur, t: 0 }); },
  arcSlash(x, y, r, a0, a1, dur = 0.28, w = 14) { FXL.push({ type: 'arc', x, y, r, a0, a1, dur, w, t: 0 }); },
  flash(color = '#fff', a = 0.5) { FXL.push({ type: 'flash', color, a, dur: 0.16, t: 0 }); },
  // 배경을 잠깐 어둡게 (밝은 화면에서도 빛이 살아나게) — 가운데는 덜 어둡게
  dark(x, y, a = 0.5, dur = 1.25, tint = [24, 12, 2]) { FXL.unshift({ type: 'dark', x, y, a, dur, tint, t: 0 }); },
  glints(x, y, colors, n = 14, sp = 170, spread = 0) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.35 + Math.random() * 0.8);
      P.push({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0, max: 0.8 + Math.random() * 0.7,
        size: 6 + Math.random() * 9, color: colors[i % colors.length], kind: 'glint', g: 60, drag: 2.2, tw: 8 + Math.random() * 10, ph: Math.random() * 6 }); }
  },
  streaks(x, y, colors, n = 22, sp = 300) {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.25, v = sp * (0.55 + Math.random() * 0.6);
      P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.6 + Math.random() * 0.4, size: 2.2 + Math.random() * 2, color: colors[i % colors.length], kind: 'streak', g: 180, drag: 2.4 }); }
  },
  embers(x, y, colors, n = 16, spread = 200) {
    for (let i = 0; i < n; i++) P.push({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.3) * spread * 0.5, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 40,
      life: 0, max: 1.4 + Math.random() * 1.2, size: 2 + Math.random() * 3, color: colors[i % colors.length], kind: 'ember', g: -10, drag: 0.5, tw: 3 + Math.random() * 4, ph: Math.random() * 6 });
  },
  smoke(x, y, n = 14) {
    for (let i = 0; i < n; i++) { const a = Math.PI + Math.random() * Math.PI, v = 40 + Math.random() * 80;
      P.push({ x: x + (Math.random() - 0.5) * 150, y: y + 20 + Math.random() * 20, vx: Math.cos(a) * v * 1.5, vy: Math.sin(a) * v * 0.5, life: 0, max: 0.9 + Math.random() * 0.5,
        size: 14 + Math.random() * 14, color: [110, 92, 80], kind: 'smoke', g: -15, drag: 2.5 }); }
  },
  debris(x, y, n = 12) {
    const cols = ['#c8843c', '#a8632a', '#e0a860', '#8a5020'];
    for (let i = 0; i < n; i++) P.push({ x: x + (Math.random() - 0.5) * 120, y, vx: (Math.random() - 0.5) * 140, vy: -80 - Math.random() * 120, life: 0, max: 0.9, size: 2 + Math.random() * 3, color: cols[i % 4], kind: 'dot', g: 700 });
  },
  fireworks(count = 4) {
    const pal = [[[255, 120, 110], ['#ffd0c8', '#ff6a5a', '#fff']], [[120, 200, 255], ['#c8ecff', '#5ab8ff', '#fff']], [[150, 240, 120], ['#e0ffc0', '#7ee05a', '#fff']], [[255, 210, 110], ['#fff0b8', '#ffc94a', '#fff']], [[210, 160, 255], ['#ecd8ff', '#b28bff', '#fff']]];
    for (let k = 0; k < count; k++) setTimeout(() => {
      const x = 60 + Math.random() * 240, y = L.H * (0.12 + Math.random() * 0.22), [lc, cs] = pal[k % pal.length];
      FX.bloom(x, y, lc, 90, 0.5, 0.8); FX.streaks(x, y, cs, 30, 230); FX.glints(x, y, cs, 8, 90); Sfx.boom();
    }, 200 + k * 280);
  },
  // 큰 글자 판이 쾅 찍힘. 반환: 사라지게 하는 함수
  slam({ text, theme = 'success', y = L.foodCY - 6, size = 46 }) {
    const th = FX_THEME[theme], x = 180;
    const w = document.createElement('div'); w.className = 'slam'; w.style.cssText = `left:${x}px;top:${y}px;--g1:${th.g1};--g2:${th.g2};--b:${th.b}`;
    // 게임 타이틀 글자: 글자마다 [입체 그림자 · 두꺼운 테두리 · 그라데이션 채움] 3겹 + 빛 쓸기
    w.innerHTML = `<div class="ttl ${theme}" style="font-size:${size}px">${[...text].map((ch, i) => ch === ' ' ? '<span class="sp"> </span>' : `<span class="ch" data-c="${ch}"><i>${ch}</i></span>`).join('')}</div>`;
    app.appendChild(w);
    const plate = w.querySelector('.ttl');
    plate.animate([{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(2.2)', opacity: 1, offset: 0.35 }, { transform: 'scale(.86)', opacity: 1, offset: 0.75 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 380, easing: 'cubic-bezier(.5,0,.75,1)', fill: 'forwards' });
    setTimeout(() => {
      G.shakeT = theme === 'fail' ? 0.22 : 0.16;
      if (theme === 'fail') {
        FX.dark(x, y, 0.42, 1.3, [30, 8, 8]);
        Sfx.thud(); Platform.haptic('fail'); FX.smoke(x, y, 16); FX.debris(x, y + 10, 14); FX.vignette('rgba(70,0,0,', 0.9);
        plate.animate([{ transform: 'scale(1) rotate(0deg) translateY(0)' }, { transform: 'scale(1) rotate(-3deg) translateY(2px)', offset: 0.3 }, { transform: 'scale(1) rotate(6deg) translateY(8px)' }], { duration: 520, delay: 120, easing: 'cubic-bezier(.3,1.6,.5,1)', fill: 'forwards' });
        plate.animate([{ filter: 'saturate(1) brightness(1)' }, { filter: 'saturate(.8) brightness(.92)' }], { duration: 600, delay: 150, fill: 'forwards' });
      } else {
        const big = theme !== 'success';
        FX.dark(x, y, big ? 0.62 : 0.5, 1.3);
        Sfx.stamp(); Platform.haptic(big ? 'reward' : 'success'); if (big) Sfx.perfect();
        FX.bloom(x, y, th.light, big ? 230 : 170, big ? 0.9 : 0.7, big ? 1 : 0.85);
        FX.rays(x, y, th.light, big ? 2.2 : 1.5, big ? 22 : 16, big ? 280 : 220);
        FX.wave(x, y, th.light, big ? 190 : 150, 0.55, 10); FX.wave(x, y, [255, 255, 255], big ? 130 : 105, 0.45, 5);
        FX.streaks(x, y, th.glints, big ? 34 : 22, big ? 360 : 290);
        FX.glints(x, y, th.glints, big ? 26 : 16, big ? 220 : 170, 80);
        FX.embers(x, y, th.glints, big ? 22 : 12, 260);
        plate.querySelectorAll('.ch').forEach((c, i) => {
          c.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-9px) scale(1.06)' }, { transform: 'translateY(0)' }], { duration: 300, delay: 90 + i * 45, easing: 'ease-out' });
          c.firstElementChild.animate([{ backgroundPosition: '150% 0, 0 0' }, { backgroundPosition: '-60% 0, 0 0' }], { duration: 520, delay: 160 + i * 45, easing: 'ease-in-out' });
        });
        // 글자 양끝 위에 반짝 플레어 (참고 이미지처럼)
        const tw = plate.getBoundingClientRect().width / L.s;
        for (const [dx, dy, sz, dl] of [[-tw * 0.36, -size * 0.42, 15, 120], [tw * 0.3, -size * 0.38, 13, 260], [tw * 0.05, -size * 0.5, 9, 420]])
          setTimeout(() => P.push({ x: x + dx, y: y + dy, vx: 0, vy: 0, life: 0, max: 1.1, size: sz, color: '#fffbe0', kind: 'glint', g: 0, tw: 9, ph: 0 }), dl);
      }
    }, 285);
    let gone = false;
    return () => { if (gone) return; gone = true; w.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-24px)' }], { duration: 220, fill: 'forwards' }).onfinish = () => w.remove(); };
  },
  // 팝업 점수 숫자: 다 올라가면 통 튀고 반짝
  bump(el, good = true) {
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.32)', offset: 0.35 }, { transform: 'scale(.94)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });
    if (!good) { el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 360, delay: 40 }); return; }
    const c = FX.center(el); FX.bloom(c.x, c.y, [255, 230, 150], 80, 0.45, 0.7); FX.glints(c.x, c.y, ['#ffffff', '#ffe58a'], 10, 120, 40); Sfx.ding(); Platform.haptic('tap');
  },
  // 넓은 화면: 캔버스의 어둡게(dark)·비네트(vig) 효과를 게임 영역 밖 양옆에도 같은 농도로 (#sideFx)
  syncSides() {
    const el = FX._side || (FX._side = document.getElementById('sideFx')); if (!el) return;
    const layers = []; let rect = null; const sc = L.s;
    for (const e of FXL) { const k = e.t / e.dur;
      if (e.type === 'dark') { rect = rect || app.getBoundingClientRect(); const a = e.a * Math.min(1, e.t / 0.12) * (k > 0.8 ? (1 - k) / 0.2 : 1); if (a <= 0.003) continue;
        const cx = rect.left + e.x * sc, cy = rect.top + e.y * sc, t = e.tint.join(',');
        layers.push(`radial-gradient(circle at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, rgba(${t},${(a * 0.35).toFixed(3)}) ${(30 * sc).toFixed(1)}px, rgba(${t},${a.toFixed(3)}) ${(420 * sc).toFixed(1)}px)`); }
      else if (e.type === 'vig') { rect = rect || app.getBoundingClientRect(); const a = Math.sin(Math.min(1, k) * Math.PI) * 0.55; if (a <= 0.003) continue;
        const cx = rect.left + 180 * sc, cy = rect.top + L.H / 2 * sc;
        layers.unshift(`radial-gradient(circle at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, ${e.color}0) ${(L.H * 0.25 * sc).toFixed(1)}px, ${e.color}${a.toFixed(3)}) ${(L.H * 0.75 * sc).toFixed(1)}px)`); } }
    const css = layers.length ? layers.join(',') : 'none';
    if (css !== FX._sideCss) { FX._sideCss = css; el.style.backgroundImage = css; }
  },
  center(el) { const r = el.getBoundingClientRect(), a = app.getBoundingClientRect(); return { x: (r.left + r.width / 2 - a.left) / L.s, y: (r.top + r.height / 2 - a.top) / L.s, w: r.width / L.s }; },
  // 칩·라벨 같은 작은 요소를 도장처럼 찍기
  stampEl(el, light = [255, 214, 90]) {
    el.animate([{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(2.2)', opacity: 1, offset: 0.35 }, { transform: 'scale(.86)', opacity: 1, offset: 0.75 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.5,0,.75,1)', fill: 'backwards' });
    setTimeout(() => { const c = FX.center(el); FX.bloom(c.x, c.y, light, 90, 0.5, 0.8); FX.wave(c.x, c.y, light, Math.max(70, c.w), 0.45, 6); FX.glints(c.x, c.y, ['#ffffff', '#ffe58a'], 10, 120, c.w * 0.6); Sfx.stamp(); Platform.haptic('stamp'); }, 285);
  },
  draw(c, dt) {
    for (let i = FXL.length - 1; i >= 0; i--) { const e = FXL[i]; e.t += dt; if (e.t > e.dur) { FXL.splice(i, 1); continue; } }
    FX.syncSides();
    for (const e of FXL) {
      const k = e.t / e.dur;
      if (e.type === 'dark') { const k2 = e.t, a = e.a * Math.min(1, k2 / 0.12) * (k > 0.8 ? (1 - k) / 0.2 : 1);
        const g = c.createRadialGradient(e.x, e.y, 30, e.x, e.y, 420); g.addColorStop(0, rgba(e.tint, a * 0.35)); g.addColorStop(1, rgba(e.tint, a));
        c.globalCompositeOperation = 'source-over'; c.fillStyle = g; c.fillRect(0, 0, 360, L.H); continue; }
      if (e.type === 'speed') { const fade = Math.min(1, e.t / 0.08) * (k > 0.8 ? (1 - k) / 0.2 : 1), fr = Math.floor(e.t * 30);
        c.globalCompositeOperation = 'source-over'; c.strokeStyle = `rgba(255,255,255,${0.55 * fade})`; c.lineCap = 'round';
        for (let i = 0; i < 46; i++) { const rnd = Math.sin((i + 1) * 12.9898 + (fr + e.seed) * 78.233) * 43758.5453; const q = rnd - Math.floor(rnd);
          const a = (i / 46) * Math.PI * 2 + q * 0.12, r0 = 150 + q * 60, r1 = 420; c.lineWidth = 1 + q * 3.2;
          c.beginPath(); c.moveTo(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0); c.lineTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1); c.stroke(); }
        continue; }
      if (e.type === 'flash') { c.globalCompositeOperation = 'lighter'; c.fillStyle = e.color; c.globalAlpha = e.a * (1 - k); c.fillRect(0, 0, 360, L.H); c.globalAlpha = 1; continue; }
      if (e.type === 'arc') { // 앞쪽 끝이 먼저 빠르게 나가고 꼬리가 따라오며 사라짐
        const head = Math.min(1, k / 0.45), tail = Math.max(0, (k - 0.25) / 0.75); const ea = (u) => 1 - Math.pow(1 - u, 3);
        const A0 = e.a0 + (e.a1 - e.a0) * ea(tail), A1 = e.a0 + (e.a1 - e.a0) * ea(head); if (A1 === A0) continue; const ccw = e.a1 < e.a0;
        c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        for (const [lw, al, colr] of [[e.w * 2.6, 0.18, '255,214,120'], [e.w * 1.4, 0.45, '255,240,200'], [e.w * 0.55, 0.95, '255,255,255']]) {
          c.lineWidth = lw * (1 - tail * 0.5); c.strokeStyle = `rgba(${colr},${al})`; c.beginPath(); c.arc(e.x, e.y, e.r, A0, A1, ccw); c.stroke(); }
        continue; }
      if (e.type === 'cut') { // 칼 선이 순식간에 그어지고(0.07초) 금빛 광선이 번졌다 사라짐 + 빛 한 점이 칼 방향으로 훑고 지나감
        const head = Math.min(1, e.t / 0.07), fade = e.t < 0.07 ? 1 : Math.pow(Math.max(0, 1 - (e.t - 0.07) / (e.dur - 0.07)), 1.15);
        const hx = e.x0 + (e.x1 - e.x0) * head, hy = e.y0 + (e.y1 - e.y0) * head; c.lineCap = 'round';
        c.globalCompositeOperation = 'source-over'; c.lineWidth = 30 * (0.5 + 0.5 * fade); c.strokeStyle = `rgba(255,140,30,${0.32 * fade})`; c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(hx, hy); c.stroke();  // 밝은 배경에서도 보이게 주황 후광
        c.lineWidth = 16 * (0.5 + 0.5 * fade); c.strokeStyle = `rgba(255,200,90,${0.55 * fade})`; c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(hx, hy); c.stroke();
        c.globalCompositeOperation = 'lighter';
        for (const [lw, al, col] of [[28, 0.22, '255,180,80'], [13, 0.55, '255,224,150'], [4.5, 1, '255,255,255']]) { c.lineWidth = lw * (0.55 + 0.45 * fade); c.strokeStyle = `rgba(${col},${al * fade})`; c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(hx, hy); c.stroke(); }
        const sp = Math.min(1, e.t / 0.3); if (sp < 1) { const sx = e.x0 + (e.x1 - e.x0) * sp, sy = e.y0 + (e.y1 - e.y0) * sp, rr = 30 * (1 - sp * 0.4);
          const g = c.createRadialGradient(sx, sy, 0, sx, sy, rr); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.4, 'rgba(255,230,160,.5)'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.beginPath(); c.arc(sx, sy, rr, 0, Math.PI * 2); c.fill(); }
        continue; }
      if (e.type === 'vig') { const a = Math.sin(Math.min(1, k) * Math.PI) * 0.55; const g = c.createRadialGradient(180, L.H / 2, L.H * 0.25, 180, L.H / 2, L.H * 0.75);
        g.addColorStop(0, e.color + '0)'); g.addColorStop(1, e.color + a + ')'); c.globalCompositeOperation = 'source-over'; c.fillStyle = g; c.fillRect(0, 0, 360, L.H); continue; }
      c.globalCompositeOperation = 'lighter';
      if (e.type === 'bloom') { const r = e.r * (0.35 + 0.65 * (1 - Math.pow(1 - k, 3))), a = e.a * Math.pow(1 - k, 1.6);
        const g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.25, rgba(e.light, a * 0.75)); g.addColorStop(0.6, rgba(e.light, a * 0.22)); g.addColorStop(1, rgba(e.light, 0));
        c.fillStyle = g; c.beginPath(); c.arc(e.x, e.y, r, 0, Math.PI * 2); c.fill(); }
      else if (e.type === 'rays') { const a = Math.min(1, k / 0.1) * Math.pow(1 - k, 1.1) * 0.9, rot = e.rot + e.t * 0.35;
        for (const s of e.spec) { const l = s.l * (0.7 + 0.3 * Math.min(1, k / 0.2)); const g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, l);
          g.addColorStop(0, rgba(e.light, a)); g.addColorStop(0.35, rgba(e.light, a * 0.45)); g.addColorStop(1, rgba(e.light, 0)); c.fillStyle = g;
          c.beginPath(); c.moveTo(e.x, e.y); c.arc(e.x, e.y, l, s.a + rot - s.w, s.a + rot + s.w); c.closePath(); c.fill(); } }
      else if (e.type === 'wave') { const r = e.r * (0.25 + 0.75 * (1 - Math.pow(1 - k, 2.4))), a = Math.pow(1 - k, 1.5);
        c.lineWidth = e.w * 2.4 * (1 - k * 0.6); c.strokeStyle = rgba(e.light, a * 0.25); c.beginPath(); c.arc(e.x, e.y, r, 0, Math.PI * 2); c.stroke();
        c.lineWidth = e.w * (1 - k * 0.7); c.strokeStyle = rgba(e.light, a * 0.6); c.stroke();
        c.lineWidth = Math.max(1, e.w * 0.3); c.strokeStyle = `rgba(255,255,255,${a * 0.9})`; c.stroke(); }
    }
    c.globalCompositeOperation = 'source-over';
  },
};
// 반짝이(4갈래 별 + 빛 번짐)
function drawGlint(c, x, y, r, color, a) {
  c.globalAlpha = a * 0.5; const g = c.createRadialGradient(x, y, 0, x, y, r * 1.6); g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r * 1.6, 0, Math.PI * 2); c.fill();
  c.globalAlpha = a; c.fillStyle = color; c.beginPath();
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r * 0.28, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r * 0.28, y); c.quadraticCurveTo(x, y, x, y - r);
  c.moveTo(x - r * 0.7, y); c.quadraticCurveTo(x, y, x, y - r * 0.2); c.quadraticCurveTo(x, y, x + r * 0.7, y); c.quadraticCurveTo(x, y, x, y + r * 0.2); c.quadraticCurveTo(x, y, x - r * 0.7, y); c.fill();
}
function drawStar(c, x, y, r) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.35 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); }

// ───────────────── 렌더 ─────────────────
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);  // 먼저 다음 프레임 예약 → 어떤 오류가 나도 게임이 멈추지 않음
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try { update(dt); } catch (e) { console.error('update', e); }
  try { render(dt); } catch (e) { console.error('render', e); FXL.length = 0; }  // 연출 오류면 연출만 비우고 계속
}
function update(dt) {
  if (G.state === 'cutting' && !G.paused && G.timerOn) {
    G.timeLeft -= dt; G.seconds += dt;
    const st = CFG.stages[G.stage]; const r = Math.max(0, G.timeLeft / st.time);
    $('barFill').style.width = (r * 100) + '%';
    const low = G.timeLeft <= 3; $('bar').classList.toggle('low', low);
    if (low) { const sec = Math.ceil(G.timeLeft * 2); if (sec !== G._lastTick) { G._lastTick = sec; Sfx.tick(true); } }
    if (G.timeLeft <= 0) timeOver();
  }
  if (G.state === 'countdown' && !G.paused) {
    G.countT -= dt;
    const n = Math.ceil(G.countT);
    if (n !== G._lastCount) { G._lastCount = n; if (n >= 1) showCount(String(n)); }
    if (G.countT > 0) $('ringFg').style.strokeDashoffset = (326.7 * (1 - (G.countT - Math.floor(G.countT)))).toFixed(1);
    if (G.countT <= 0) startCutting();
  }
  if (Screen.cur === 'play') { Missions.addSeconds(dt); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.life += dt; if (p.life > p.max) { P.splice(i, 1); continue; }
    p.vy += (p.g || 0) * dt; if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; } p.x += p.vx * dt + (p.sw ? Math.sin(p.life * 3 + p.ph) * p.sw * dt : 0); p.y += p.vy * dt; if (p.vr) p.rot += p.vr * dt; }
  G.splitT += dt; G.shakeT = Math.max(0, G.shakeT - dt); G.failShakeT = Math.max(0, G.failShakeT - dt);
  G.flash = G.flash.filter(f => (f.t += dt) < 0.35);
  if (G.trail.length) { const t = performance.now(); G.trail = G.trail.filter(p => t - p.t < 160); }
}
function render(dt) {
  const k = L.s * L.dpr;
  gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, gcv.width, gcv.height); gctx.setTransform(k, 0, 0, k, 0, 0);
  fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, fcv.width, fcv.height); fctx.setTransform(k, 0, 0, k, 0, 0);
  if (Screen.cur === 'play') renderPlay(gctx);
  // 빛 효과 + 파티클 (fx 캔버스, 팝업 위)
  FX.draw(fctx, Math.min(0.05, dt || 0.016));
  for (const p of P) { const a = 1 - p.life / p.max; fctx.globalAlpha = Math.min(1, a * 1.6); fctx.fillStyle = p.color;
    if (p.kind === 'paper') { const fl = Math.cos(p.rot * 1.7); fctx.fillStyle = fl > 0 ? p.color : (p.dark || p.color); fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6 * Math.max(0.15, Math.abs(fl))); fctx.restore(); }
    else if (p.kind === 'glint') { fctx.globalCompositeOperation = 'lighter'; const tw = 0.6 + 0.4 * Math.sin(p.life * p.tw + p.ph); drawGlint(fctx, p.x, p.y, p.size * (0.4 + 0.6 * a) * tw, p.color, Math.min(1, a * 1.8)); fctx.globalCompositeOperation = 'source-over'; }
    else if (p.kind === 'streak') { fctx.globalCompositeOperation = 'lighter'; const tx = p.x - p.vx * 0.09, ty = p.y - p.vy * 0.09; const g = fctx.createLinearGradient(tx, ty, p.x, p.y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, p.color);
      fctx.strokeStyle = g; fctx.lineWidth = p.size; fctx.lineCap = 'round'; fctx.beginPath(); fctx.moveTo(tx, ty); fctx.lineTo(p.x, p.y); fctx.stroke(); fctx.globalCompositeOperation = 'source-over'; }
    else if (p.kind === 'ember') { fctx.globalCompositeOperation = 'lighter'; fctx.globalAlpha = Math.min(1, a * 1.4) * (0.5 + 0.5 * Math.sin(p.life * p.tw + p.ph)); const g = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3); g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(255,255,255,0)'); fctx.fillStyle = g; fctx.beginPath(); fctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); fctx.fill(); fctx.globalCompositeOperation = 'source-over'; }
    else if (p.kind === 'smoke') { const r = p.size * (1 + 1.8 * p.life / p.max), aa = 0.45 * Math.pow(a, 1.3); const g = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, rgba(p.color, aa)); g.addColorStop(1, rgba(p.color, 0)); fctx.globalAlpha = 1; fctx.fillStyle = g; fctx.beginPath(); fctx.arc(p.x, p.y, r, 0, Math.PI * 2); fctx.fill(); }
    else if (p.kind === 'star') drawStar(fctx, p.x, p.y, p.size * a);
    else if (p.kind === 'spark__old') { fctx.strokeStyle = p.color; fctx.lineWidth = p.size; fctx.lineCap = 'round'; fctx.beginPath(); fctx.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); fctx.lineTo(p.x, p.y); fctx.stroke(); }
    else if (p.kind === 'puff__old') { fctx.globalAlpha = a * 0.8; fctx.beginPath(); fctx.arc(p.x, p.y, p.size * (1 + 1.6 * p.life / p.max), 0, Math.PI * 2); fctx.fill(); }
    else { fctx.beginPath(); fctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); fctx.fill(); } }
  fctx.globalAlpha = 1;
}
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function renderPlay(c) {
  const ox = Food.ox(), oy = Food.oy();
  let sx = 0, sy = 0;
  if (G.shakeT > 0) { sx = (Math.random() - 0.5) * 8 * (G.shakeT / 0.15); sy = (Math.random() - 0.5) * 8 * (G.shakeT / 0.15); }
  if (G.failShakeT > 0) { const t = 0.45 - G.failShakeT; sx += Math.sin(t * Math.PI * 2 * 3 / 0.45) * 8 * (G.failShakeT / 0.45); }
  c.save(); c.translate(sx, sy);
  // 그림자
  c.fillStyle = 'rgba(160,90,20,.18)'; c.beginPath(); c.ellipse(L.foodCX, oy + Food.h + 6, Food.w * 0.4, 10, 0, 0, Math.PI * 2); c.fill();
  // 카운트다운 링
  if (G.judge && G.judge.res) {
    // 조각 분리
    const t = Math.min(1, G.splitT / 0.28), e = easeOutBack(t);
    for (const g of G.judge.groups) {
      c.save(); c.translate(g.ox * e, g.oy * e);
      c.beginPath(); g.poly.forEach((p, i) => i ? c.lineTo(ox + p[0], oy + p[1]) : c.moveTo(ox + p[0], oy + p[1])); c.closePath(); c.clip();
      Food.draw(c, ox, oy, 1); c.restore();
    }
  } else {
    Food.draw(c, ox, oy, 1);
    // 컷 선
    for (const ln of G.lines) { const seg = lineSegment(ln); if (!seg) continue;
      c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 3.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(ox + seg[0][0], oy + seg[0][1]); c.lineTo(ox + seg[1][0], oy + seg[1][1]); c.stroke(); }
  }
  // 섬광
  for (const f of G.flash) { const a = 1 - f.t / 0.35; const seg = lineSegment(f.ln, 24); if (!seg) continue;
    c.save(); c.globalAlpha = a; c.shadowColor = '#ff9a2e'; c.shadowBlur = 18; c.strokeStyle = '#fff'; c.lineWidth = 8 * a + 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(ox + seg[0][0], oy + seg[0][1]); c.lineTo(ox + seg[1][0], oy + seg[1][1]); c.stroke(); c.restore(); }
  c.restore();
  // 칼 궤적
  if (G.trail.length > 1) {
    const now = performance.now(); const pts = G.trail;
    for (let pass = 0; pass < 2; pass++) for (let i = 1; i < pts.length; i++) { const a = 1 - (now - pts[i].t) / 160; if (a <= 0) continue; const w = i / pts.length;
      c.strokeStyle = pass ? `rgba(255,255,255,${a})` : `rgba(255,154,46,${a * 0.4})`; c.lineWidth = pass ? 2 + 7 * w : 8 + 12 * w; c.lineCap = 'round';
      c.beginPath(); c.moveTo(pts[i - 1].x, pts[i - 1].y); c.lineTo(pts[i].x, pts[i].y); c.stroke(); }
    const tip = pts[pts.length - 1]; c.fillStyle = '#ffe08a'; drawStar(c, tip.x, tip.y, 8);
  }
  if (G.dragging && G.dragStart && G.dragCur) {  // 확정될 직선 미리보기
    c.save(); c.setLineDash([6, 6]); c.strokeStyle = 'rgba(74,44,16,.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(G.dragStart.x, G.dragStart.y); c.lineTo(G.dragCur.x, G.dragCur.y); c.stroke(); c.restore();
  }
}

// ───────────────── 화면 / 팝업 ─────────────────
const Screen = {
  cur: 'lobby',
  show(name) { this.cur = name; app.classList.toggle('inPlay', name === 'play'); document.body.classList.toggle('inPlay', name === 'play'); $('ready').classList.add('hidden'); app.classList.toggle('inLobby', name === 'lobby'); $('lobby').classList.toggle('hidden', name !== 'lobby'); $('play').classList.toggle('hidden', name !== 'play'); if (name === 'lobby') { refreshLobby(); Sfx.bgm('lobby'); } },
};
// 팝업 (Theme Dialog): 가로 344 · 내용 여백 10 · 최대 높이 = min(보이는 높이 80%, 보이는 높이 - 32)
// 구조: 머리(제목·닫기) / head(위 고정) / body(넘치면 여기만 스크롤 + 아래 그라데이션) / foot(아래 고정) / below(팝업 밖 아래, 예: '닫기' 글자)
const X_SVG = '<svg width="22" height="22" viewBox="9 9 22 22" aria-hidden="true"><path d="M26.19 12.28a1.53 1.53 0 0 1 1.08 2.61l-5.1 5.11 5.1 5.1a1.53 1.53 0 0 1-2.17 2.17L20 22.17l-5.1 5.1a1.53 1.53 0 0 1-2.17-2.17l5.1-5.1-5.1-5.1a1.53 1.53 0 0 1 2.17-2.17L20 17.83l5.1-5.1c.29-.29.68-.45 1.09-.45Z" fill="#fff" stroke="#4A2C10" stroke-width="1"/></svg>';
const Pop = {
  el: null,
  open({ title, body, head = null, foot = null, below = '', cls = 'enter', close = true, onClose = null }) {
    this.close(true);
    const dim = document.createElement('div'); dim.className = 'dim'; dim.dataset.t = title;
    dim.innerHTML = `<div class="pop ${cls}"><div class="ph"><h3>${title}</h3>${close ? `<button class="sq" data-x aria-label="닫기">${X_SVG}</button>` : ''}</div>
      <div class="pb"><div class="phd"></div><div class="pbody"></div><div class="pft"></div></div></div>${below}`;
    const put = (sel, c) => { const el = dim.querySelector(sel); if (c == null) { el.remove(); return; } if (typeof c === 'string') el.innerHTML = c; else el.appendChild(c); };
    put('.phd', head); put('.pbody', body); put('.pft', foot);
    const sb = dim.querySelector('.pbody'), fade = document.createElement('i'); fade.className = 'pfade'; sb.appendChild(fade);
    const upd = () => { const over = sb.scrollHeight - sb.clientHeight; sb.classList.toggle('noscroll', over <= 2); fade.classList.toggle('on', over > 2 && over - sb.scrollTop > 4); };
    sb.addEventListener('scroll', upd, { passive: true }); requestAnimationFrame(upd); setTimeout(upd, 400); this.updFade = upd;
    if (close) dim.querySelector('[data-x]').onclick = () => { Sfx.pop(); this.close(); onClose && onClose(); };
    $('popRoot').appendChild(dim); this.el = dim; this.onClose = onClose; assetImgs(dim); return dim;
  },
  close(silent) { if (this.el) { this.el.remove(); this.el = null; } },
  // 본문 스크롤을 특정 줄이 보이게 (받을 수 있는 미션이 아래에 있을 때)
  // smooth = 맨 위부터 보여 준 뒤 그 줄까지 부드럽게 내려감 (미션 창)
  reveal(el, smooth) { const sb = this.el && this.el.querySelector('.pbody'); if (!sb || !el) return;   // offset 기준(팝업 등장 애니메이션 배율 영향 없음)
    let top = 0, n = el; while (n && n !== sb) { top += n.offsetTop; n = n.offsetParent; }
    const h = el.offsetHeight, ch = sb.clientHeight; if (top >= sb.scrollTop && top + h <= sb.scrollTop + ch) return;
    const to = Math.min(sb.scrollHeight - ch, Math.max(0, top - (ch - h) / 2));
    if (smooth) sb.scrollTo({ top: to, behavior: 'smooth' }); else sb.scrollTop = to;
    this.updFade && this.updFade(); },
};
// 토스트 (토스 미니앱 UI): 흰 알약 + (포인트면) 파란 P, 위치 고정 = 상단 버튼 줄 아래 가운데, 2초, 터치 안 막음
function toast(msg, point = false) {
  app.querySelectorAll('.ttoast').forEach(t => t.remove());   // 연속 노출 금지: 새 토스트가 이전 것을 대체
  const t = document.createElement('div'); t.className = 'ttoast';
  t.innerHTML = (point ? '<i class="tp">P</i>' : '') + `<span></span>`; t.lastChild.textContent = msg; app.appendChild(t); setTimeout(() => t.remove(), 2100);
}
// 보상 안내 토스트: 잠깐 보여 준 뒤 [미션] 버튼으로 쭉 빨려 들어감 → 버튼 통 튀기 (어디에 쌓였는지 인지)
function missionTarget() {
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('.hidden'); };
  const a = $('btnMis'), b = $('btnMission');
  return !$('lobby').classList.contains('hidden') && vis(b) ? b : vis(a) ? a : vis(b) ? b : null;
}
// 랭킹 버튼(상단 [랭킹]) — 로비·게임 공통
function rankTarget() { const b = $('btnRank'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !b.closest('.hidden') ? b : null; }
function toastToMission(msg, point = false) { toastAbsorb(msg, point, missionTarget); }
function toastToRank(msg) { toastAbsorb(msg, false, rankTarget); }
// 흡수 토스트 줄 세우기: 미션·랭킹 토스트가 겹치면 앞 것이 [버튼]에 들어간 뒤 0.25초 쉬고 다음 것 (연속 노출 금지 규칙 유지)
const AbsorbQ = { q: [], busy: false };
function toastAbsorb(msg, point, targetFn) {
  if (AbsorbQ.busy) { AbsorbQ.q.push([msg, point, targetFn]); return; }
  AbsorbQ.busy = true;
  let fin = false; const done = () => { if (fin) return; fin = true; AbsorbQ.busy = false; const n = AbsorbQ.q.shift(); if (n) setTimeout(() => toastAbsorb(...n), 250); };
  setTimeout(done, 3200);   // 안전장치: 다른 토스트가 끼어들어 애니메이션이 끊겨도 줄이 멈추지 않게
  app.querySelectorAll('.ttoast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'ttoast absorb';
  t.innerHTML = (point ? '<i class="tp">P</i>' : '') + `<span></span>`; t.lastChild.textContent = msg; app.appendChild(t);
  setTimeout(() => {
    if (!t.isConnected) { done(); return; }
    const tg = targetFn(); if (!tg) { t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => { t.remove(); done(); }; return; }
    const ar = app.getBoundingClientRect(), s = ar.width / app.offsetWidth, tr = t.getBoundingClientRect(), gr = tg.getBoundingClientRect();
    const dx = ((gr.left + gr.width / 2) - (tr.left + tr.width / 2)) / s, dy = ((gr.top + gr.height / 2) - (tr.top + tr.height / 2)) / s;
    t.style.animation = 'none';
    // 1) 살짝 움츠렸다가 2) 가속하며 버튼 쪽으로 쭉 → 작아지며 흡수
    const fly = t.animate([
      { transform: 'translate(-50%,0) scale(1)', opacity: 1 },
      { transform: 'translate(-50%,3px) scale(1.05,.86)', opacity: 1, offset: .18 },
      { transform: `translate(calc(-50% + ${dx * .55}px), ${dy * .55}px) scale(.42,.5)`, opacity: .95, offset: .7 },
      { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(.06)`, opacity: .4 }],
      { duration: 620, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' });
    // 꼬리 반짝이 3개가 뒤따라감
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('i'); d.className = 'absorbDot'; d.style.left = (tr.left + tr.width / 2 - ar.left) / s + 'px'; d.style.top = (tr.top + tr.height / 2 - ar.top) / s + 'px'; app.appendChild(d);
      d.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .3 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.3)`, opacity: .2 }],
        { duration: 560, delay: 120 + i * 70, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'both' }).onfinish = () => d.remove();
    }
    fly.onfinish = () => {
      t.remove(); Sfx.coin(); Platform.haptic('tap');
      tg.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: .35 }, { transform: 'scale(.94)', offset: .7 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
      const ring = document.createElement('i'); ring.className = 'absorbRing'; const r2 = tg.getBoundingClientRect();
      ring.style.left = (r2.left + r2.width / 2 - ar.left) / s + 'px'; ring.style.top = (r2.top + r2.height / 2 - ar.top) / s + 'px'; ring.style.width = r2.width / s + 'px'; ring.style.height = r2.height / s + 'px';
      app.appendChild(ring); ring.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }], { duration: 480, easing: 'ease-out' }).onfinish = () => ring.remove();
      refreshLobby(); done();
    };
  }, 1700);
}
// 화면 전체 딤 (폴드·태블릿처럼 게임 영역 양옆이 남는 화면): 게임 영역 안 딤들의 농도를 합쳐 #fullDim에 그대로
const DIM_A = [['.dim', .5], ['.sdkDim', .45], ['.cdim:not(.hidden)', .5], ['.tutDim', .55], ['.tutIntroDim', .55]];
function syncDim() {
  let keep = 1;
  for (const [sel, a] of DIM_A) app.querySelectorAll(sel).forEach(() => { keep *= 1 - a; });
  const a = 1 - keep, fd = $('fullDim'); if (fd) fd.style.opacity = a.toFixed(3);
  app.classList.toggle('dimmed', a > 0); app.style.setProperty('--dim-b', (1 - a).toFixed(3));
  app.classList.toggle('sdkOn', !!app.querySelector('.sdkDim'));   // 로비에서 SDK 시트가 팝업 위에 뜨면 팝업도 어둡게
}
{ let q = 0; new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; syncDim(); }); }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); }
function assetImgs(root = document) { root.querySelectorAll('img[data-a]').forEach(im => { if (!im.src) im.src = (window.ASSETS || {})[im.dataset.a] || ''; }); }
function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1); }
const won = (n) => `${n.toLocaleString('ko-KR')}P`;   // 보상 단위 = P (토스포인트)

function refreshPoints(anim) {
  // 헤더 재화 표시는 없음 (포인트는 채널 지갑으로 지급)
}
// 로비: '리워드 미션' 위 칩 (받을 보상 N개 — 출석 선물 포함) + 헤더 [미션] 배지 (일일 미션 달성 수/전체)
function refreshLobby() {
  const L2 = Missions.list(); $('hdrDot').textContent = `${L2.daily.filter(x => x.cur >= x.max).length}/${L2.daily.length}`;
  $('lobbyNick').classList.toggle('hidden', !S.login);   // 닉네임 칸은 로그인한 유저만 (Figma 4-1)
  if (document.activeElement !== $('nickInput')) $('nickInput').value = S.nick || '';
  const chip = $('rewardChip'), n = Missions.claimable().length + (Attend.today() ? 1 : 0);
  const txt = n ? `받을 보상 ${n}개` : '';
  chip.textContent = txt; chip.classList.toggle('hidden', !txt);
  app.classList.toggle('canClaim', n > 0);   // 받을 보상이 있으면 [미션]·[리워드 미션] 버튼이 주기적으로 움찔 + 게임 중엔 [미션] 아래 말풍선
}
// 지급: 채널 지갑(토스 프로모션 / 제휴사 API) 대기열 → 받는 순간 소리·진동 + 토스 토스트
function grant(n, reason, silent) { S.points += n; save(); Platform.grantPoint(n, reason); refreshPoints(); if (!silent) rewardToast(n); }
function josa(w, a, b) { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 ? a : b; }
function rewardToast(n = 1) { Sfx.coin(); Platform.haptic('reward'); toast(`한입컷에서 ${won(n)}를 지급했어요`, true); }

// ───────────────── 출석 선물 (7일 · 날짜 기준) — 1일차 = 튜토리얼 완료일, 2~7일차 = 그날 첫 로비 진입 팝업 ─────────────────
// 보관 없음: 그날 받을 일차는 그날 안에(팝업·미션 창) 받아야 하고, 날짜가 지나면 '기간만료'
const dnum = (k) => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const Attend = {
  st() { if (!S.att || S.att.start === undefined) S.att = { start: S.tut ? dayKey() : '', got: [] }; return S.att; },
  begin() { const a = this.st(); if (!a.start) { a.start = dayKey(); save(); } },
  idx() { const a = this.st(); return a.start ? dnum(dayKey()) - dnum(a.start) + 1 : 0; },   // 오늘이 몇 일차인지 (8 이상 = 끝)
  amt(d) { return CFG.attend[d - 1] || 0; },   // 기본 금액 (어드민)
  // 알림 2배: 알림을 켠 '다음 날'부터 그날 금액 × 2 (켠 날은 1배)
  mult(d) { const a = this.st(); return S.notifOk && S.notifSince && a.start && dnum(a.start) + d - 1 > dnum(S.notifSince) ? 2 : 1; },
  pay(d) { return this.amt(d) * this.mult(d); },
  today() { const i = this.idx(); return S.tut && i >= 1 && i <= 7 && !this.st().got[i] ? i : 0; },   // 오늘 받을 일차 (없으면 0)
  claim() { const d = this.today(); if (!d) return 0; const a = this.st(); a.got[d] = true; save(); const p = this.pay(d); Platform.grantPoint(p, d === 1 ? 'welcome' : 'attend_' + d); return p; },
  state(d) { const i = this.idx(); return this.st().got[d] ? 'got' : d === i ? 'today' : d < i ? 'expired' : d === i + 1 ? 'tomorrow' : 'later'; },
  hi() { return [2, 3, 4, 5, 6, 7].sort((x, y) => this.amt(y) - this.amt(x) || y - x).slice(0, 2); },   // 보상 큰 2일 (1일차 제외, 같으면 뒤 일차)
  name() { return '출석 선물'; },
};
const Welcome = { get amount() { return CFG.attend[0]; } };   // 튜토리얼 말풍선 문구용
// 보상 아이콘: 토스 = P 동전(Iconpack 93_coin), 그 밖의 플랫폼 = 별 동전(92_coin)
const COIN = Platform.channel === 'toss' ? 'coin_p' : 'coin_star';
function giftSlot(big, desc) { return `<div class="slot gslot"><img class="gift" data-a="${COIN}"><div class="big gbig">${big}</div><div class="desc">${desc}</div></div>`; }
// 출석 캘린더 (Figma 1-4/1-6): 1~7일차 가로 목록. 상태 = 기간만료 · 지급완료 · 오늘 · 내일 · N일차, 노란 테두리 = 보상 큰 2일
// 알림 2배 대상 날짜는 '+NP X2' (Figma 2-2 · 4-4)
function attendCal() {
  const hi = Attend.hi(), cells = [];
  for (let d = 1; d <= 7; d++) {
    const st = Attend.state(d), note = CFG.attendNote[d - 1];
    const ic = st === 'expired' ? 'ic_expired' : st === 'got' ? 'ic_got' : COIN;
    const todayDone = !Attend.today();   // 오늘 것을 받기 전엔 '오늘'만 초록, 받은 뒤엔 '내일'이 초록 (둘 다 초록이면 헷갈림)
    const [lab, col] = { expired: ['기간만료', 'red'], got: ['지급완료', 'done'], today: ['오늘', 'green'], tomorrow: ['내일', todayDone ? 'green' : 'done'] }[st] || [`${d}일차`, 'done'];
    cells.push(`<div class="acell ${st} ${hi.includes(d) ? 'hi' : ''}" data-d="${d}"><img class="aci" data-a="${ic}" alt="">
      <span class="ainfo"><span class="aamt">+${Attend.amt(d)}P${Attend.mult(d) === 2 ? ' X2' : ''}</span>${note ? `<span class="anote">${note}</span>` : ''}<span class="btn s ${col} aday">${lab}</span></span></div>`); }
  return `<div class="arow">${cells.join('')}</div>`;
}
// 캘린더: 한 번 가로로 스르륵 7일차(최고 보상)까지 → '내일' 칸(없으면 오늘 칸)을 가운데로 맞추고 멈춤
function attendPeek(dlg) {
  const row = dlg.querySelector('.arow'); if (!row) return;
  const max = row.scrollWidth - row.clientWidth; if (max < 8) return;
  const focus = row.querySelector('.acell.tomorrow') || row.querySelector('.acell.today');
  const to = focus ? Math.max(0, Math.min(max, focus.offsetLeft - row.offsetLeft - (row.clientWidth - focus.offsetWidth) / 2)) : 0;
  let stop = false; row.addEventListener('pointerdown', () => { stop = true; }, { once: true });
  const ease = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const run = (from, end, ms) => new Promise((res) => { const t0 = performance.now(); const f = (now) => { if (stop || !row.isConnected) return res();
    const k = Math.min(1, (now - t0) / ms); row.scrollLeft = from + (end - from) * ease(k); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
  setTimeout(async () => { await run(0, max, 1100); await new Promise(r => setTimeout(r, 650)); if (!stop) await run(max, to, 800); }, 700);
}
// 알림 줄 (Figma 1-6 · 2-2 · 4-2 · 4-4): 꺼짐 = 종 + '알림 켜면 내일부터 매일 2배로 받아요!' + [알림켜기]
// 오늘 켬 = 체크 + '알림 ON · 내일부터 매일 2배로 받아요' + [오늘은 1배] / 전에 켬 = 종 + '알림을 켜서 매일 2배로 받는 중이에요' + [X2]
// 출석 기간에 남은 날이 없으면(7일차) 안 보임
function notifyRow() {
  if (Attend.idx() >= 7) return '';
  if (!Alarm.on()) return `<div class="nrow ask"><svg class="nglow" aria-hidden="true"></svg><img data-a="ic_bell" alt=""><span>알림 켜면 내일부터<br>매일 2배로 받아요!</span><button class="btn s blue" data-alarm>알림켜기</button></div>`;
  if (Alarm.today()) return `<div class="nrow on"><img data-a="ic_got" alt=""><span>알림 ON · 내일부터<br>매일 2배로 받아요</span><button class="btn s blue nb">내일부터 X2</button></div>`;
  return `<div class="nrow"><img data-a="ic_bell" alt=""><span>알림을 켜서 매일<br>2배로 받는 중이에요</span><button class="btn s blue nb">X2</button></div>`;
}
// 출석 팝업 본문: 큰 카드(오늘 금액) + 캘린더 (+ 알림 줄)
function attendBody(d, got, withNotify) {
  const x2 = Attend.mult(d) === 2, base = Attend.amt(d);
  let desc;
  if (got) desc = x2 ? `${d}일차 출석 선물을 2배로 받았어요` : `${d}일차 출석 선물을 받았어요${Alarm.today() ? '<br>내일부터 매일 2배로 받아요' : ''}`;
  else desc = (x2 ? `${d}일차 출석 선물 ${won(base)} × 2배<br>알림을 켜서 2배로 받아요` : `${d}일차 출석 선물이에요`) + (S.login ? '' : '<br>토스 로그인하면 바로 받아요');
  const w = document.createElement('div'); w.className = 'acol';
  w.innerHTML = giftSlot(`토스포인트 ${won(Attend.pay(d))}`, desc) + attendCal() + (withNotify ? notifyRow() : ''); return w;
}
// 팝업 안 [알림켜기]: 토스 알림 동의 → 켜면 줄 ON · 캘린더 X2 로 다시 그림 + 토스트 (Figma 2-1 → 2-2). 거절하면 그대로
// 테두리를 따라 도는 빛 (v0.9.31): 가운데는 굵고 밝게, 앞·뒤 끝은 얇고 흐리게 → 끝이 뾰족한 빛 줄기
// 같은 지점을 가운데로 둔 dash 여러 겹(길수록 얇고 흐림)을 겹쳐 그림. 알림 줄 상자 안쪽에만(clip)
// [길이(둘레 비율), 굵기, 투명도] 12겹: 길수록 얇고 흐림 → 겹쳐 보면 가운데 굵고 밝고, 끝으로 갈수록 가늘고 흐려짐
const GLOW_LAYERS = Array.from({ length: 12 }, (_, i) => { const t = i / 11; return [.32 - .29 * Math.pow(t, .8), .5 + 2.7 * t, .1 + .14 * t]; });
function armGlow(root) {
  root.querySelectorAll('.nrow.ask .nglow').forEach(svg => {
    const row = svg.parentElement, w = row.offsetWidth, h = row.offsetHeight; if (!w || !h) return;
    const r = 12, P = 2 * (w + h - 3) - (8 - 2 * Math.PI) * (r - .75), max = GLOW_LAYERS[0][0] * P, id = 'nc' + Math.random().toString(36).slice(2, 7);
    svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<defs><clipPath id="${id}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}"/></clipPath></defs><g clip-path="url(#${id})">` +
      GLOW_LAYERS.map(([k, sw, op]) => `<rect x=".75" y=".75" width="${w - 1.5}" height="${h - 1.5}" rx="${r - .75}" fill="none" stroke="#fff6c4" stroke-width="${sw}" stroke-opacity="${op}" stroke-linecap="butt" stroke-dasharray="${(k * P).toFixed(1)} ${(P - k * P).toFixed(1)}" data-k="${k}"/>`).join('') + '</g>';
    svg.querySelectorAll('rect[data-k]').forEach(el => { const o = -(max - el.dataset.k * P) / 2;   // 겹마다 가운데 맞춤
      el.animate([{ strokeDashoffset: o }, { strokeDashoffset: o - P }], { duration: 2600, iterations: Infinity }); });
  });
}
function bindNotify(dlg, rerender) {
  requestAnimationFrame(() => { armGlow(dlg); Pop.updFade && Pop.updFade(); });
  const b = dlg.querySelector('[data-alarm]'); if (!b) return;
  b.onclick = async () => { if (Pop._busy) return; Sfx.pop(); Platform.haptic('tap'); Pop._busy = true; let r = null;
    try { r = await Alarm.ask(); } finally { Pop._busy = false; }
    if (r === 'newAgreement' || r === 'alreadyAgreed') { rerender(); toast('알림을 켰어요 · 내일부터 매일 2배'); } };
}
// 출석 팝업: ctx = 'tutorial'(1-4 튜토리얼 완료 · 알림 줄 없음) | 'play'(2일차부터 [게임 시작]으로 인게임 진입 순간, 하루 1번)
function attendOffer(ctx, done) {
  const d = Attend.today(); if (!d) { if (ctx === 'tutorial') newGame(); else done && done(); return; }
  S.attShown = dayKey(); save();
  const tut = ctx === 'tutorial';
  const foot = `<button class="btn green" data-get>${S.login ? '받기' : '로그인하고 받기'}</button>`;
  const after = () => { if (tut) { newGame(); setTimeout(() => toastToMission('출석 선물은 미션에서 받을 수 있어요', true), 500); } else { refreshLobby(); done && done(); } };
  const dlg = Pop.open({ title: tut ? '튜토리얼 완료!' : '출석 선물', body: attendBody(d, false, !tut), foot, onClose: after });
  if (tut) { confetti(40); Sfx.success(); } else Sfx.pop();
  attendPeek(dlg);
  const rerender = () => { const pb = dlg.querySelector('.pbody .acol'); if (!pb) return; const sl = pb.querySelector('.arow').scrollLeft;
    pb.replaceWith(attendBody(d, false, !tut)); assetImgs(dlg); const r2 = dlg.querySelector('.arow'); if (r2) r2.scrollLeft = sl; bindNotify(dlg, rerender); };
  bindNotify(dlg, rerender);
  dlg.querySelector('[data-get]').onclick = async () => {
    if (Pop._busy) return; Sfx.pop(); Platform.haptic('tap');
    if (!S.login) { let ok = false; Pop._busy = true; try { ok = await Platform.login(); } finally { Pop._busy = false; } if (!ok) return; S.login = true; save(); }
    const p = Attend.claim(); if (!p) return; refreshLobby(); showPaid(d, p, ctx, done);
  };
}
// 보상 받기 (P12) — 지급 완료: 같은 캘린더에서 받은 일차 표시 + 알림 줄 (알림은 받은 뒤에만 권함)
function showPaid(d, p, ctx, done) {
  const tut = ctx === 'tutorial';
  const foot = `<button class="btn green" data-ok>${tut ? '바로 한 판 하기' : '확인'}</button>`;
  const go = () => { Pop.close();
    if (tut) { if (!Alarm.on() && !S.alarmAsk) { S.alarmAsk = 1; save(); } newGame(); }   // 수령 때 알림 안 켬 → 첫 정식 판 종료 때 알림 팝업 1번
    else if (ctx === 'missions') openMissions(Missions._onDone); else done && done(); };
  const dlg = Pop.open({ title: '보상 받기', body: attendBody(d, true, true), foot, onClose: go });
  dlg.querySelector('[data-ok]').onclick = () => { Sfx.pop(); go(); };
  const rerender = () => { const pb = dlg.querySelector('.pbody .acol'); if (!pb) return; const sl = pb.querySelector('.arow').scrollLeft;
    pb.replaceWith(attendBody(d, true, true)); assetImgs(dlg); const r2 = dlg.querySelector('.arow'); if (r2) r2.scrollLeft = sl; bindNotify(dlg, rerender); };
  bindNotify(dlg, rerender);
  attendPeek(dlg);
  confetti(30); setTimeout(() => rewardToast(p), 350);
}
// 출석표 보기 (오늘 받은 뒤, Figma 4-7): 큰 카드 = 내일 받을 보상, 아래 캘린더 + 알림 줄
function attendView(back) {
  const i = Attend.idx(), nx = i >= 1 && i < 7 ? i + 1 : 0;
  const body = () => { const w = document.createElement('div'); w.className = 'acol';
    w.innerHTML = giftSlot(nx ? `내일 토스포인트 ${won(Attend.pay(nx))}` : '출석 완료', nx ? `${nx}일차 출석 선물이에요 · 내일 들어오면 받아요` : '7일 출석 선물을 모두 받았어요') + attendCal() + notifyRow(); return w; };
  const go = () => { Pop.close(); back && back(); };
  const dlg = Pop.open({ title: '출석 선물', body: body(), foot: '<button class="btn green" data-ok>확인</button>', onClose: go });
  dlg.querySelector('[data-ok]').onclick = () => { Sfx.pop(); go(); };
  const rerender = () => { const pb = dlg.querySelector('.pbody .acol'); if (!pb) return; pb.replaceWith(body()); assetImgs(dlg); bindNotify(dlg, rerender); };
  bindNotify(dlg, rerender);
  attendPeek(dlg);
}
// 튜토리얼 완료 → 출석 1일차 팝업. 닫으면 바로 첫 정식 판, 1일차는 미션 창에서 받을 수 있음
function welcomeOffer() { attendOffer('tutorial'); }

// ───────────────── SDK 화면 자리 (웹 테스트용 · 토스에서는 토스가 그림) ─────────────────
const SdkSheet = {
  open(o) { return SdkGuard.run(() => this._open(o)); },   // 떠 있는 동안 화면 맞춤 멈춤 (팝업은 제자리, 시트가 위에 덮음)
  _open({ title, desc, ok }) { return new Promise((res) => {
    const el = document.createElement('div'); el.className = 'sdkDim';
    el.innerHTML = `<div class="sdkSheet"><div class="sdkTop"><i class="sdkAv"></i><span class="sdkTag">SDK 화면 · 예시</span></div><b>${title}</b><p>${desc}</p><i class="sdkLn"></i><i class="sdkLn s"></i><i class="sdkLn"></i>
      <button class="sdkOk">${ok}</button><button class="sdkNo">닫기</button></div>`;
    const done = (v) => { el.remove(); res(v); };
    el.onclick = (e) => { if (e.target === el) done(false); };
    el.querySelector('.sdkOk').onclick = () => done(true); el.querySelector('.sdkNo').onclick = () => done(false);
    app.appendChild(el);
  }); },
};

// ───────────────── 미션 (Figma P07-1) ─────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function key14(d = new Date()) { const b = new Date(d); if (b.getHours() < 14) b.setDate(b.getDate() - 1); b.setHours(14, 0, 0, 0); return b.getTime(); }  // 20판: 매일 14시 초기화
// 보상(원/P). 일일 미션 모두 달성 시 보너스, 5판마다 반복(하루 상한)
const MIS = {
  play1: { name: '첫 판 플레이', p: 1, max: 1, reset: '0시 초기화' },
  play5: { name: '오늘 5판 플레이', p: 3, max: 5, reset: '0시 초기화' },
  play20: { name: '20판 플레이', p: 25, max: 20, reset: '14시 초기화' },
  time30: { name: '오늘 30분 플레이', p: 1, max: 30, reset: '0시 초기화' },
  notif: { name: '알림 받기', p: 1, max: 1, reset: '초기화 없음' },
};
const BONUS_P = 20, REP_P = 1, REP_EVERY = 5, REP_CAP = 10;
const Missions = {
  state() {
    const today = dayKey(); let m = S.m;
    if (!m || m.v !== 2 || m.day !== today) m = S.m = { v: 2, day: today, plays: 0, sec: 0, claimed: {}, rep: 0, bonus: false, tut: false, w14: (m && m.v === 2 && m.w14) || { key: 0, plays: 0, claimed: false } };
    const k = key14(); if (m.w14.key !== k) m.w14 = { key: k, plays: 0, claimed: false };
    return m;
  },
  addPlay() { const m = this.state(); m.plays++; m.w14.plays++; save(); refreshLobby(); },
  addSeconds(dt) { const m = this.state(); const before = Math.floor(m.sec / 60); m.sec += dt; if (Math.floor(m.sec / 60) !== before) { save(); refreshLobby(); } },
  notifVisible() { return !S.notifHidden && (!S.notifDone || S.notifDay === dayKey()); },
  list() {
    const m = this.state(), min = Math.floor(m.sec / 60);
    const mk = (id, cur, claimed, meta) => { const d = MIS[id]; cur = Math.min(d.max, cur); return { id, name: d.name, p: d.p, cur, max: d.max, claimed, ready: !claimed && cur >= d.max, meta }; };
    const daily = [
      mk('play1', m.plays, !!m.claimed.play1, `${Math.min(1, m.plays)}/1 · 0시 초기화`),
      mk('play5', m.plays, !!m.claimed.play5, `${Math.min(5, m.plays)}/5 · 0시 초기화`),
      mk('play20', m.w14.plays, m.w14.claimed, `${Math.min(20, m.w14.plays)}/20 · 14시 초기화`),
      mk('time30', min, !!m.claimed.time30, `${Math.min(30, min)}/30분 · 0시 초기화`),
    ];
    if (this.notifVisible()) daily.push(Object.assign(mk('notif', S.notifOk ? 1 : 0, !!S.notifDone, '1회 · 초기화 없음'), { apply: !S.notifOk }));
    const got = Math.min(REP_CAP, Math.floor(m.plays / REP_EVERY)), avail = got - m.rep;
    const rep = { id: 'rep', name: '5판마다 반복', p: REP_P, cur: avail > 0 ? REP_EVERY : m.plays % REP_EVERY, max: REP_EVERY, claimed: m.rep >= REP_CAP, ready: avail > 0,
      meta: m.rep >= REP_CAP ? `오늘 ${REP_CAP}번 다 받았어요` : `${avail > 0 ? REP_EVERY : m.plays % REP_EVERY}/${REP_EVERY} · 계속 반복` };
    const ach = daily.filter(x => x.cur >= x.max).length;
    const bonus = { id: 'bonus', name: '오늘 달성 보너스', p: BONUS_P, cur: ach, max: daily.length, claimed: m.bonus, ready: !m.bonus && ach >= daily.length, meta: `${ach}/${daily.length} · ${daily.length}개 모두 달성 시 ${BONUS_P}P 지급!` };
    return { daily, rep, bonus };
  },
  claimable() { const l = this.list(); return [l.bonus, l.rep, ...l.daily].filter(x => x.ready); },
  // 지급 후 받은 금액 반환
  claim(id, silent) {
    const m = this.state(), l = this.list(), it = [l.bonus, l.rep, ...l.daily].find(x => x.id === id); if (!it || !it.ready) return 0;
    if (id === 'bonus') m.bonus = true; else if (id === 'rep') m.rep++; else if (id === 'play20') m.w14.claimed = true;
    else if (id === 'notif') { S.notifDone = true; S.notifDay = dayKey(); } else m.claimed[id] = true;
    save(); grant(it.p, 'mission_' + id, silent); return it.p;
  },
};
const Sess = { told: new Set() };   // 같은 안내는 세션당 1회
// 판 종료 안내: 결과 화면 위 토스트 1회 (주 버튼은 그대로 '다음 스테이지'). 플레이 중에는 아무것도 띄우지 않음
function roundEndNotice() {
  const fresh = Missions.claimable().filter(x => !Sess.told.has(x.id));
  const welcome = !!Attend.today() && !S.login && !Sess.told.has('welcome');
  if (!fresh.length && !welcome) { nMoreNotice(); return; }
  fresh.forEach(x => Sess.told.add(x.id)); if (welcome) Sess.told.add('welcome');
  setTimeout(() => {
    if (S.login) toastToMission(`미션 달성! ${won(fresh.reduce((a, x) => a + x.p, 0))} 받을 수 있어요`, true);
    else toastToMission('받을 보상이 생겼어요 · 미션에서 확인해요');
  }, 700);
}
// 받을 보상이 새로 안 생긴 판 (Figma 5-4): 달성에 가장 가까운 미션 1개를 토스트로 → [미션]으로 흡수
// 후보 = 오늘 5판 · 20판 · 30분 · 5판마다 반복 (남은 비율이 가장 작은 것, 같으면 보상 큰 것)
// 예: '오늘 5판 플레이까지 2판 남았어요 · 3P' / '3판 더 하면 1P를 받아요'(반복). 알림 팝업이 뜰 첫 정식 판이면 안 띄움
function nearMission() {
  const m = Missions.state(), l = Missions.list(), c = [];
  for (const x of l.daily) {
    if (x.claimed || x.ready || !['play5', 'play20', 'time30'].includes(x.id)) continue;
    const left = x.max - x.cur; if (left > 0) c.push({ x, left, r: left / x.max, unit: x.id === 'time30' ? '분' : '판' });
  }
  const earned = Math.floor(m.plays / REP_EVERY);
  if (earned < REP_CAP && !l.rep.ready) { const left = REP_EVERY - m.plays % REP_EVERY; c.push({ x: l.rep, left, r: left / REP_EVERY, unit: '판', rep: true }); }
  c.sort((a, b) => a.r - b.r || b.x.p - a.x.p);
  return c[0] || null;
}
// mid = 1단계 성공 팝업(판이 아직 안 끝남): 판 수 미션은 '이번 판 포함' 남은 수 → 1판이면 '이번 판만 끝내면'
function nMoreNotice(mid) {
  if (S.alarmAsk === 1 && !Alarm.on()) return;
  const n = nearMission(); if (!n) return;
  if (mid && n.unit === '판' && n.left === 1) { setTimeout(() => toastToMission(n.rep ? `이번 판만 끝내면 ${won(n.x.p)}를 받아요` : `이번 판만 끝내면 ${n.x.name} ${won(n.x.p)}!`, true), 700); return; }
  const msg = n.rep ? `${n.left}판 더 하면 ${won(n.x.p)}를 받아요` : `${n.x.name}까지 ${n.left}${n.unit} 남았어요 · ${won(n.x.p)}`;
  setTimeout(() => toastToMission(msg, true), 700);
}
// 미션 팝업: 누른 화면 위에서 열림 (로비→로비 위, 게임→게임 위)
function openMissions(onDone) {
  Missions._onDone = onDone;
  const body = document.createElement('div'); body.className = 'mlist';
  const foot = '<div class="mnote">20판 플레이는 매일 14시, 나머지 일일 미션은 매일 0시에 초기화돼요</div>';
  const btn = (x) => {
    if (x.claimed) return '<button class="btn s done" disabled>완료</button>';
    if (x.ready) return S.login ? `<button class="btn s green" data-c="${x.id}">받기</button>` : `<button class="btn s red" data-login="${x.id}">로그인</button>`;
    if (x.apply) return '<button class="btn s blue tight" data-notif>알림켜기</button>';
    return '<button class="btn s" data-wait>진행 중</button>';
  };
  const bar = (x) => `<i class="mbar"><i style="width:${Math.round(Math.min(1, x.cur / x.max) * 100)}%"></i></i>`;
  const row = (x, wide) => `<div class="mrow ${wide ? 'wide' : ''} ${x.ready ? 'can' : ''}" data-id="${x.id}"><div class="minfo"><div class="mt"><b>${x.name}</b><span class="rp">${x.p}P</span></div>
    <div class="mm">${x.id === 'notif' ? '' : bar(x)}<span>${x.meta}</span></div></div>${btn(x)}</div>`;
  const render = () => {
    const l = Missions.list(), left = l.daily.filter(x => !x.claimed).length;
    let h = '';
    const ad = Attend.today();
    if (ad) h += `<div class="mrow wide mgift can" data-id="attend"><div class="minfo"><div class="mt"><b>출석 선물</b><span class="rp">${Attend.pay(ad)}P</span></div><div class="mm"><span>토스포인트 · ${ad}일차 출석 보상 · 오늘 받을 수 있어요</span></div></div>
        ${S.login ? '<button class="btn s green" data-c="attend">받기</button>' : '<button class="btn s red" data-login="attend">로그인하고 받기</button>'}</div>`;
    else { const ai = Attend.idx();   // 오늘 받은 뒤에도 출석 기간(7일) 동안은 줄을 남겨 내일 보상을 볼 수 있게
      if (ai >= 1 && ai <= 7 && Attend.st().got[ai]) { const nx = ai < 7 ? ai + 1 : 0;
        h += `<div class="mrow wide" data-id="attend"><div class="minfo"><div class="mt"><b>출석 선물</b>${nx ? `<span class="rp">내일 ${Attend.pay(nx)}P</span>` : ''}</div><div class="mm"><span>${nx ? `오늘 받았어요 · 내일(${nx}일차)에 또 받아요` : '7일 출석을 모두 마쳤어요'}</span></div></div>
        <button class="btn s blue" data-attview>출석표 보기</button></div>`; } }
    h += row(l.bonus, true);
    h += `<div class="mlab"><b>반복 미션</b><span>하루 동안 계속</span></div>${row(l.rep)}`;
    h += `<div class="mlab"><b>일일 미션</b><span>남은 ${left}개</span></div>${l.daily.map(x => row(x)).join('')}`;
    body.innerHTML = h;
    // 하나씩 받기: 받으면 다시 그리고, 다음으로 받을 수 있는 줄로 부드럽게 이동
    const claimOne = (id) => { const n = id === 'attend' ? Attend.claim() : Missions.claim(id, true); if (!n) return; Platform.haptic('tap'); rewardToast(n); render(); refreshLobby();
      requestAnimationFrame(() => { Pop.updFade && Pop.updFade(); const next = body.querySelector('.mrow.can'); if (next) setTimeout(() => Pop.reveal(next, true), 250); }); };
    body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => claimOne(b.dataset.c));
    // 미로그인: 누른 줄 기준으로 로그인 → 그 보상 하나만 받음 (나머지는 '받기'로 바뀌어 하나씩)
    body.querySelectorAll('[data-login]').forEach(b => b.onclick = async () => { if (Pop._busy) return; Sfx.pop(); Platform.haptic('tap'); Pop._busy = true;
      let ok = false; try { ok = await Platform.login(); } finally { Pop._busy = false; }
      if (!ok) return; S.login = true; save(); claimOne(b.dataset.login); });
    body.querySelectorAll('[data-notif]').forEach(b => b.onclick = async () => { Sfx.pop(); const r = await Alarm.ask();   // 켜면 다음 날부터 출석 2배도 같이
      if (r === 'newAgreement') {   // 동의하면 바로 지급 (받기 버튼 한 번 더 누르지 않게). 미로그인이면 이어서 로그인 → 지급
        if (!S.login) { let ok = false; Pop._busy = true; try { ok = await Platform.login(); } finally { Pop._busy = false; } if (ok) { S.login = true; save(); } }
        if (S.login) claimOne('notif'); else { render(); refreshLobby(); } }
      else if (r === 'alreadyAgreed') { toast('이미 알림을 받고 있어요'); render(); refreshLobby(); } });
    body.querySelectorAll('[data-wait]').forEach(b => b.onclick = () => { Sfx.pop(); toast('아직 진행 중이에요'); });
    body.querySelectorAll('[data-attview]').forEach(b => b.onclick = () => { Sfx.pop(); attendView(() => openMissions(Missions._onDone)); });
  };
  render();
  const close = () => { refreshLobby(); onDone && onDone(); };
  Pop.open({ title: '오늘의 미션', body, foot, cls: 'enter dk', onClose: close });
  const dlg = Pop.el; setTimeout(() => { if (Pop.el === dlg) Pop.reveal(body.querySelector('.mrow.can'), true); }, 550);
}
function openSettings(_pb) {
  const pausedBefore = _pb !== undefined ? _pb : G.paused; G.paused = true;
  const resume = () => { G.paused = pausedBefore; };
  const body = document.createElement('div'); body.className = 'slot setSlot';
  const tg = (k, label) => `<div class="srow">${label}<div class="sw ${S[k] ? 'on' : ''}" data-k="${k}"></div></div>`;
  const lk = (k, label) => `<button class="srow go" data-doc="${k}">${label}<span>›</span></button>`;
  body.innerHTML = `<div class="scard">${tg('sound', '효과음')}${tg('bgm', '배경음')}${tg('vibe', '진동')}</div>
    <div class="scard">${lk('terms', '이용약관')}${lk('privacy', '개인정보 처리방침')}${lk('oss', '오픈소스 라이선스')}</div>
    ${Screen.cur === 'play' ? '<div class="row2"><button class="btn m" data-h>홈으로</button><button class="btn m green" data-r>계속하기</button></div>' : ''}
    <div class="ver">버전 ${CFG.version}</div>`;
  body.querySelectorAll('.sw').forEach(s => s.onclick = () => { S[s.dataset.k] = !S[s.dataset.k]; s.classList.toggle('on', S[s.dataset.k]); save(); Sfx.pop(); if (s.dataset.k === 'bgm') Sfx.refreshBgm(); if (s.dataset.k === 'vibe') Platform.haptic('cut'); });
  // 약관·개인정보·라이선스: 새 팝업이 아니라 같은 팝업 안에서 페이지 전환, [설정으로 돌아가기]로 복귀 (Figma P03 가이드)
  body.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => { Sfx.pop(); openDoc(b.dataset.doc, () => openSettings(pausedBefore), resume); });
  const r = body.querySelector('[data-r]'); if (r) r.onclick = () => { Pop.close(); resume(); };
  testResetTap(body.querySelector('.ver'), () => openSettings(pausedBefore), resume);   // [테스트용 · 배포 전 삭제]
  const h = body.querySelector('[data-h]'); if (h) h.onclick = () => { Pop.close(); goLobby(); };   // 결과 전 홈 = 판 수에 안 셈
  Pop.open({ title: '설정', body, onClose: resume });
}
// ▼▼▼ [테스트용 · 실제 배포 전 삭제] 설정 팝업 '버전' 글자를 3초 안에 5번 누르면 → 신규 유저로 초기화 (토스 앱에서 재배포 없이 신규 동선 다시 보기)
function testResetTap(el, back, resume) {
  if (!el) return; let n = 0, t0 = 0;
  el.addEventListener('click', () => { const now = Date.now(); if (now - t0 > 3000) n = 0; t0 = now; n++; if (n < 5) return; n = 0;
    const b = document.createElement('div'); b.className = 'col';
    b.innerHTML = '<div class="slot"><div class="lead2">신규 유저로 초기화할까요?</div><div class="desc">[테스트용] 튜토리얼·출석·미션·로그인·알림 기록을 지우고<br>처음(인트로 → 튜토리얼)부터 다시 시작해요</div></div><div class="row2"><button class="btn" data-no>취소</button><button class="btn red" data-yes>초기화</button></div>';
    Pop.open({ title: '테스트 초기화', body: b, onClose: back });
    b.querySelector('[data-no]').onclick = () => { Sfx.pop(); Pop.close(); back(); };
    b.querySelector('[data-yes]').onclick = () => { const keep = { sound: S.sound, bgm: S.bgm, vibe: S.vibe };
      Store.save(Object.assign({ testBuild: TEST_BUILD_ID, tut: false }, keep)); location.reload(); };
  });
}
// ▲▲▲ [테스트용 끝]
// 약관 본문 (초안 — 운영사 정보·시행일은 출시 전 확정 필요)
const DOCS = {
  terms: { title: '이용약관', html: `<b>제1조 (목적)</b>
이 약관은 [운영사명](이하 "회사")가 제공하는 캐주얼 게임 "한입컷"(이하 "서비스")의 이용 조건과 절차, 회사와 이용자의 권리·의무를 정합니다.

<b>제2조 (서비스 내용)</b>
서비스는 음식을 정확하게 나누는 미니 게임, 랭킹, 미션 및 미션 보상(포인트) 지급 기능을 제공합니다. 회사는 운영상 필요한 경우 서비스 내용을 바꿀 수 있으며, 중요한 변경은 서비스 안에서 미리 알립니다.

<b>제3조 (포인트와 보상)</b>
1. 미션 보상으로 지급되는 포인트는 서비스가 입점한 플랫폼(예: 토스)의 정책에 따라 지급·사용됩니다.
2. 부정한 방법(자동화 도구, 기록 조작, 버그 악용 등)으로 얻은 기록과 보상은 회수되거나 이용이 제한될 수 있습니다.
3. 하루 광고 시청 횟수와 보상 지급 횟수에는 제한이 있을 수 있습니다.

<b>제4조 (광고)</b>
서비스에는 광고가 포함될 수 있으며, 일부 보상(예: 광고 보고 한 번 더)은 광고를 끝까지 시청한 경우에만 제공됩니다.

<b>제5조 (이용자의 의무)</b>
이용자는 다른 사람의 정보를 도용하거나, 서비스 운영을 방해하거나, 다른 이용자에게 불쾌감을 주는 닉네임을 사용해서는 안 됩니다. 회사는 이러한 닉네임을 변경하거나 랭킹에서 제외할 수 있습니다.

<b>제6조 (책임의 제한)</b>
회사는 천재지변, 플랫폼 장애 등 회사가 통제할 수 없는 사유로 서비스를 제공하지 못한 경우 책임을 지지 않습니다.

<b>제7조 (문의)</b>
서비스 이용 문의: [문의 이메일]

시행일: [2026년 ○월 ○일]` },
  privacy: { title: '개인정보 처리방침', html: `<b>1. 수집하는 개인정보</b>
서비스 제공을 위해 닉네임, 게임 기록(점수·연승·미션 진행 상황) 등 최소한의 정보를 수집합니다. 토스에서 이용하는 경우 보상 지급을 위해 토스가 제공하는 이용자 식별값을 함께 처리합니다.

<b>2. 이용 목적</b>
랭킹 제공, 미션 보상 지급, 부정 이용 방지, 서비스 개선을 위해 이용합니다.

<b>3. 보유 기간</b>
서비스 이용을 끝내거나 목적을 달성하면 지체 없이 파기합니다. 다만 관련 법령에 따라 보관해야 하는 정보는 그 기간 동안 보관합니다.

<b>4. 기기에 저장하는 정보</b>
효과음·배경음·진동 설정, 오늘의 미션 진행 상황 등은 이용자 기기 안에만 저장됩니다.

<b>5. 광고</b>
광고 제공 과정에서 광고 사업자가 광고 식별자 등 기기 정보를 처리할 수 있습니다. 기기 설정에서 맞춤형 광고를 끌 수 있습니다.

<b>6. 이용자의 권리</b>
이용자는 언제든지 자신의 정보 열람·정정·삭제를 요청할 수 있습니다.

<b>7. 개인정보 보호책임자</b>
[담당자명] · [문의 이메일]

시행일: [2026년 ○월 ○일]` },
  oss: { title: '오픈소스 라이선스', html: `<b>FluidR3 GM SoundFont</b>
Copyright © 2000-2002, 2008 Frank Wen
배경음 악기 소리 · MIT License

<b>Jua</b>
Copyright © Woowahan Brothers
글꼴 · SIL Open Font License 1.1` },
};
function openDoc(kind, back, resume) {
  const d = DOCS[kind]; const b = document.createElement('div'); b.className = 'slot docSlot';
  b.innerHTML = `<div class="docText">${d.html}</div><button class="btn green" data-ok>확인</button><button class="btn" data-back>설정으로 돌아가기</button>`;
  Pop.open({ title: d.title, body: b, onClose: resume });
  b.querySelector('[data-ok]').onclick = () => { Pop.close(); resume && resume(); };
  b.querySelector('[data-back]').onclick = () => { Sfx.pop(); back(); };
}
// ───────────────── 게임 흐름 ─────────────────
// 연속 클리어: 스테이지(3단계 한 세트)를 끊김 없이 깬 수가 기록. 실패 후 광고 이어하기는 유지, 처음부터/홈으로 가면 종료
function newGame() { G.stageNo = 1; G.clears = 0; G.runTotal = 0; startSet(); }
const usedFoods = new Set();  // 앱 종료 전까지 한 번 나온 음식은 다시 안 나옴 (메모리에만 보관)
function startSet() {
  let pool = FOODS.filter(f => !usedFoods.has(f.id));
  if (!pool.length) { usedFoods.clear(); pool = FOODS.filter(f => !G.food || f.id !== G.food.id); }  // 다 나오면 한 바퀴 새로 (바로 전 음식 제외)
  G.food = pool[Math.floor(Math.random() * pool.length)]; usedFoods.add(G.food.id);
  const def = G.food, tk = (G._loadTk = (G._loadTk || 0) + 1);
  FoodLoader.load(def).then(im => { if (tk !== G._loadTk) return; Food.set(def, im); beginSet(); })
    .catch(() => { if (tk !== G._loadTk) return; toast('음식을 불러오지 못했어요'); Food.set(def, null); beginSet(); });
}
function beginSet() { G.stage = 0; G.stageScores = []; G.adUsed = 0; G.playCounted = false; startStage();
}
// 한 판 = 3단계 성공(완료 화면) 또는 실패 창이 처음 뜬 때 1번 (광고 이어하기는 같은 판). 결과 전 홈 나가기·튜토리얼은 안 셈
function endGame() { if (!G.playCounted) { G.playCounted = true; Missions.addPlay(); S.plays = (S.plays || 0) + 1; save(); } }
// 결과 팝업에서 다음으로 넘어갈 때: ① 첫 정식 판 알림 팝업(1일차 수령 때 안 켠 유저, 1번) ② N판마다 팝업형 광고(다음 판으로 갈 때만) → next
function afterRound(next, toNextGame) {
  if (S.alarmAsk === 1 && !Alarm.on()) { S.alarmAsk = 2; save(); return alarmPopup(() => afterRound(next, toNextGame)); }
  const N = CFG.adEveryN;
  if (toNextGame && N > 0 && S.plays > 0 && S.plays % N === 0 && S.adAt !== S.plays) { S.adAt = S.plays; save(); return adPopup(next); }
  next();
}
// 알림 팝업 (Figma 2-3): [괜찮아요] → 다음, [알림켜기] → 토스 알림 동의 → 켜면 토스트 (Figma 2-5), 거절하면 그냥 다음
function alarmPopup(next) {
  const b = document.createElement('div'); b.className = 'col';
  b.innerHTML = `<div class="slot gslot"><img class="gift" data-a="ic_bell"><div class="big gbig">내일부터 매일 2배</div><div class="desc">알림을 켜면 출석 선물을<br>매일 2배로 받아요</div></div>
    <div class="row2"><button class="btn" data-no>괜찮아요</button><button class="btn green" data-yes>알림켜기</button></div>`;
  let done = false; const go = () => { if (done) return; done = true; Pop.close(); next(); };
  Pop.open({ title: '알림 받기', body: b, onClose: go }); Sfx.pop();
  b.querySelector('[data-no]').onclick = () => { Sfx.pop(); go(); };
  b.querySelector('[data-yes]').onclick = async () => { if (Pop._busy) return; Sfx.pop(); Pop._busy = true; let r = null;
    try { r = await Alarm.ask(); } finally { Pop._busy = false; }
    if (r === 'newAgreement' || r === 'alreadyAgreed') { go(); setTimeout(() => toast('알림을 켰어요 · 내일부터 매일 2배'), 200); } else go(); };
}
// N판마다 팝업형 광고 (Figma 6-1 결과 → 6-2 광고 → 6-3 다음 판, 전면 아님): 토스 광고 형식 확정 전 → 광고 자리 예시. X 또는 [계속하기]로 닫으면 다음 판
function adPopup(next) {
  const b = document.createElement('div'); b.className = 'col';
  b.innerHTML = `<div class="slot adslot"><div class="adbox"><span class="adtag">AD</span><span>광고 영역<br>(토스 광고 SDK 배너·이미지)</span></div></div>
    <button class="btn green" data-ok>계속하기</button>`;
  let done = false; const go = () => { if (done) return; done = true; Pop.close(); next(); };
  Pop.open({ title: '광고', body: b, onClose: go });
  b.querySelector('[data-ok]').onclick = () => { Sfx.pop(); go(); };
}
function goLobby() { if (G.tut) { G.tut = false; Tut.clear(); } G.flow = (G.flow || 0) + 1; G.state = 'lobby'; G.judge = null; Screen.show('lobby'); }
function startStage() {
  const st = CFG.stages[G.stage];
  Screen.show('play'); Pop.close(); Sfx.bgm('play');
  G.flow = (G.flow || 0) + 1; G.lines = []; G.cutsLeft = st.cuts; G.timeLeft = st.time; G.judge = null; G.trail = []; G.paused = false;
  G.state = 'countdown'; G.countT = 3; G._lastCount = 4; G.timerOn = false; $('ready').classList.add('hidden');
  $('bar').classList.remove('low'); $('barFill').style.width = '100%'; $('cdim').classList.remove('hidden'); $('ring').classList.remove('go');
  $('steps').innerHTML = [0, 1, 2].map(i => i === G.stage ? `<div class="step on">${i + 1}단계</div>` : `<div class="step ${i < G.stage ? 'done' : ''}">${i < G.stage ? '<svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><path d="M1.8 6.4 5.2 9.6 12.2 2.2" fill="none" stroke="#1f6512" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.8 6.4 5.2 9.6 12.2 2.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : i + 1}</div>`).join('');
  $('instr').textContent = TALKS[G.stage]; $('stageLabel').textContent = `그림을 ${['1/2', '1/3', '1/5'][G.stage]}로 나눠요`; $('stagePlank').textContent = `${G.stageNo}연승 도전 중!`; updateHint(); refreshPoints(); refreshLobby();
  if (G.tut) Tut.enter();   // 튜토리얼: 카운트다운·타이머 없이 바로 따라 하기
  else if (G.attPending) { G.attPending = false; if (Attend.today()) { G.paused = true; attendOffer('play', () => { G.paused = false; }); } }   // 카운트다운 멈추고 출석 팝업
}
function showCount(txt, go) {
  const c = $('count'); $('ring').classList.toggle('go', !!go); c.textContent = txt;
  c.animate([{ transform: 'scale(1.5)', opacity: 0.3 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  if (!go) Sfx.tick(false);
}
function startCutting() {
  const st = CFG.stages[G.stage];
  // 3·2·1 뒤에는 대기: 화면을 처음 터치하는 순간 타이머 시작 (그 전에 홈·미션판·랭킹·설정을 눌러볼 수 있음)
  G.state = 'cutting'; G.timerOn = false; $('cdim').classList.add('hidden'); $('ready').classList.remove('hidden'); updateHint(); Platform.haptic('tick');
}
function startTimer() {
  if (G.timerOn) return; G.timerOn = true; $('ready').classList.add('hidden'); Sfx.go(); Platform.haptic('tick'); updateHint();
}
function updateHint() {
  const st = CFG.stages[G.stage];
  $('hint').textContent = '';   // Figma: 게임 중 안내 문구(서브텍스트) 없음
  void st; refreshPoints();
}
function timeOver() {
  G.state = 'judging'; G.timeLeft = 0; Sfx.duck(true); Sfx.fail();
  failFx(); const tk = G.flow; const off = FX.slam({ text: '시간 초과', theme: 'fail', size: 42 }); setTimeout(() => { off(); if (tk !== G.flow) return; showFail({ reason: 'time', score: 0 }); }, 1000);
}

// 입력
function toLogical(e) { const r = app.getBoundingClientRect(); return { x: (e.clientX - r.left) / L.s, y: (e.clientY - r.top) / L.s }; }
app.addEventListener('pointerdown', (e) => {
  Sfx.unlock();
  if (G.state !== 'cutting' || G.paused || Pop.el) return;
  const p = toLogical(e); if (p.y < L.hdrTop + 44) return;
  if (G.tut) { if (!G.tutReady) return; } else startTimer();
  G.dragging = true; G.dragStart = p; G.dragCur = p; G.trail = [{ x: p.x, y: p.y, t: performance.now() }]; G._swish = false;
  try { app.setPointerCapture(e.pointerId); } catch (err) {}
});
app.addEventListener('pointermove', (e) => {
  if (!G.dragging) return; const p = toLogical(e); G.dragCur = p; G.trail.push({ x: p.x, y: p.y, t: performance.now() });
  if (!G._swish && Math.hypot(p.x - G.dragStart.x, p.y - G.dragStart.y) > 30) { G._swish = true; Sfx.swish(); }
});
const endDrag = (e) => {
  if (!G.dragging) return; G.dragging = false;
  const a = G.dragStart, b = G.dragCur || a; G.dragStart = null;
  if (G.state !== 'cutting') return;
  const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 40) return;
  const ox = Food.ox(), oy = Food.oy();
  const ln = { px: a.x - ox, py: a.y - oy, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len };
  if (!lineSplits(ln)) { toast(`${G.food.name}${josa(G.food.name, '을', '를')} 가로질러 밀어요`); return; }
  doCut(ln);
};
app.addEventListener('pointerup', endDrag); app.addEventListener('pointercancel', endDrag);

// 칼이 음식에 실제로 들어가고 나가는 두 점 (알파 마스크 기준)
function cutEdges(ln) {
  const seg = lineSegment(ln, 0); if (!seg || !Food.mask) return null; const [a, b] = seg; const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); let f = null, l = null;
  for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n, xi = x | 0, yi = y | 0;
    if (xi >= 0 && yi >= 0 && xi < Food.mw && yi < Food.mh && Food.mask[yi * Food.mw + xi]) { if (!f) f = [x, y]; l = [x, y]; } }
  return f ? [f, l] : null;
}
// 컷 확정 연출: 금빛 칼 광선 + 들어간·나간 자리 불꽃 + 가운데 빛 번짐 + 살짝 번쩍 (마지막 칼은 더 크게)
function cutFx(ln, last) {
  const ox = Food.ox(), oy = Food.oy(), seg = lineSegment(ln, 46);
  if (seg) FX.cutLine(ox + seg[0][0], oy + seg[0][1], ox + seg[1][0], oy + seg[1][1], last ? 0.9 : 0.72);
  const ed = cutEdges(ln);
  if (ed) {
    for (const [x, y] of ed) { const X = ox + x, Y = oy + y;
      FX.glints(X, Y, ['#ffffff', '#ffe58a', '#ffb347'], last ? 16 : 12, 220, 8); FX.streaks(X, Y, ['#fff6c8', '#ffd36a', '#ff9a2e'], last ? 16 : 10, 280); FX.bloom(X, Y, [255, 205, 110], 64, 0.38, 0.85); }
    const mx = ox + (ed[0][0] + ed[1][0]) / 2, my = oy + (ed[0][1] + ed[1][1]) / 2;
    FX.dark(mx, my, last ? 0.3 : 0.2, last ? 0.6 : 0.45);  // 잠깐 어둡게 → 빛이 또렷
    FX.rays(mx, my, [255, 214, 120], last ? 0.7 : 0.5, last ? 16 : 10, last ? 190 : 130);
    FX.bloom(mx, my, [255, 236, 170], last ? 170 : 120, 0.5, 0.55); FX.wave(mx, my, [255, 220, 140], last ? 150 : 110, 0.42, last ? 7 : 5);
    if (last) FX.embers(mx, my, ['#ffd36a', '#ffb347', '#fff1c0'], 18, 160);
  }
  FX.flash('#fff3d0', last ? 0.24 : 0.14); G.shakeT = last ? 0.24 : 0.17;
}
function doCut(ln) {
  if (G.tut) Tut.clear();
  G.lines.push(ln); G.cutsLeft--; G.flash.push({ ln, t: 0 }); G.shakeT = 0.15;
  const seg = lineSegment(ln, 0); if (seg) crumbs(Food.ox() + seg[0][0], Food.oy() + seg[0][1], Food.ox() + seg[1][0], Food.oy() + seg[1][1], 22);
  cutFx(ln, G.cutsLeft <= 0);
  Sfx.cut(); Sfx.shing(); Platform.haptic('cut'); updateHint();
  if (G.cutsLeft <= 0) { G.state = 'judging'; const tk = G.flow; setTimeout(() => { if (tk === G.flow) judge(); }, 420); }
}

function judge() {
  const tk = G.flow; if (G.state !== 'judging') return;
  const st = CFG.stages[G.stage];
  const res = computePieces(G.lines);
  const timeRatio = Math.max(0, G.timeLeft / st.time);
  const sc = scoreOf(st, res, timeRatio);
  if (G.tut && !sc.ok) { sc.ok = true; sc.score = Math.max(sc.score, st.pass); }   // 튜토리얼은 무조건 통과
  // 조각 그룹 (서명별) + 벌어지는 방향
  const bySig = new Map();
  for (const cp of res.comps) { const g = bySig.get(cp.sig); if (!g || cp.area > g.area) bySig.set(cp.sig, cp); }
  const AMT = res.pieces.length > 3 ? 4 : 5;  // 칼 선마다 양쪽으로 벌어짐 → 모든 칼 자국이 같은 폭으로 보임
  const offOf = (sig) => G.lines.reduce((o, ln, k) => { const sgn = (sig >> k) & 1 ? 1 : -1; return { x: o.x + sgn * ln.dy * AMT, y: o.y - sgn * ln.dx * AMT }; }, { x: 0, y: 0 });
  const groups = [...bySig.values()].map(cp => { const o = offOf(cp.sig); return { poly: regionPoly(cp.sig, G.lines), ox: o.x, oy: o.y }; });
  G.judge = { res, sc, groups }; G.splitT = 0; Sfx.split();
  // 조각별 % 칩
  const ox = Food.ox(), oy = Food.oy(), ideal = res.total / st.pieces;
  const order = [...res.pieces].sort((a, b) => a.cx - b.cx);
  res.pieces.forEach((p, i) => setTimeout(() => {
    const o = offOf(p.sig), many = res.pieces.length > 3, yo = many ? (order.indexOf(p) % 2 ? 22 : -22) : 0;
    const chip = document.createElement('div'); chip.className = 'toast'; chip.style.cssText = `animation:none;top:${oy + p.cy + o.y + yo}px;left:${ox + p.cx + o.x}px;font-size:${res.pieces.length > 3 ? 14 : 18}px;padding:3px 10px;border:2px solid ${Math.abs(p.area / ideal - 1) < 0.06 ? '#5ccf3c' : '#ff5b5b'};z-index:6`;
    chip.textContent = fmt(p.area / res.total * 100) + '%'; chip.dataset.chip = 1; $('play').appendChild(chip);
    chip.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.12)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    Sfx.pop(i);
  }, 220 + i * 90));
  const wait = 260 + res.pieces.length * 90 + 450; Sfx.roll((wait - 250) / 1000);
  G.stageScores[G.stage] = sc.score;
  setTimeout(() => {
    Sfx.duck(true);
    if (sc.ok) {
      const perfect = sc.score >= CFG.perfect, last = G.stage >= 2;
      const result = () => {
        const off = FX.slam(perfect ? { text: 'PERFECT', theme: 'perfect', size: 48 } : { text: last ? '모두 성공!' : '성공!', theme: last ? 'final' : 'success' });
        setTimeout(() => { off(); if (tk !== G.flow) return; if (G.tut) Tut.done(); else if (!last) showStageClear(sc, res); else showFinal(sc); }, 950);
      };
      if (perfect) CatSlash.play(result); else result();  // PERFECT면 자른 직후 고양이 칼 휘두르기 1초 → 결과
    } else {
      failFx(); Sfx.fail();
      const off = FX.slam({ text: sc.reason === 'count' ? `${res.pieces.length}조각!` : '아쉬워요', theme: 'fail', size: 42 });
      setTimeout(() => { off(); if (tk !== G.flow) return; showFail(Object.assign({ reason: sc.reason || 'score' }, sc), res); }, 1000);
    }
  }, wait);
}
function clearChips() { $('play').querySelectorAll('[data-chip]').forEach(c => c.remove()); }
function failFx() {
  G.failShakeT = 0.45;
  const v = document.createElement('div'); v.style.cssText = 'position:absolute;inset:0;z-index:25;pointer-events:none;background:radial-gradient(ellipse at center,rgba(255,91,91,0) 55%,rgba(255,60,60,.55) 100%)';
  app.appendChild(v); v.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 650 }).onfinish = () => v.remove();
}
function countUp(el, to, suffix, ms = 600, done) { const t0 = performance.now(); let lt = 0; const f = (t) => { const k = Math.min(1, (t - t0) / ms); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))) + suffix; if (t - lt > 70 && k < 1) { lt = t; Sfx.count(k); } if (k < 1) requestAnimationFrame(f); else done && done(); }; requestAnimationFrame(f); }
function starsHTML(n) { return `<div class="stars">${[0, 1, 2].map(i => `<img class="${i === 1 ? 'mid' : ''} ${i < n ? 'pop-in' : ''}" style="animation-delay:${0.25 + i * 0.15}s" data-a="${i < n ? 'star_on' : 'star_off'}">`).join('')}</div>`; }
function showStageClear(sc, res) {
  const st = CFG.stages[G.stage]; const perfect = sc.score >= CFG.perfect;
  const pct = res.pieces.map(p => fmt(p.area / res.total * 100) + '%');
  const errPct = fmt(res.pieces.reduce((a, p) => a + Math.abs(p.area / res.total - 1 / st.pieces), 0) / st.pieces * 100);
  const body = `<div class="col"><div class="slot"><div class="big" data-n>0.0점</div><div class="lead">기준 점수 ${st.pass}점 · 통과!</div>
    <div class="chips">${pct.map((p, i) => `<span class="chip ${i % 2 ? 'p' : ''}">${p}</span>`).join('')}<span class="chip r">오차 ${errPct}%</span></div>
    <button class="btn green" data-next>${G.stage + 2}단계 도전</button><button class="btn" data-stop>그만하기</button></div></div>`;
  const stop = () => { clearChips(); Pop.close(); endRun(); goLobby(); };   // 결과 전 그만두기 = 판 수에 안 셈
  const next = () => { clearChips(); G.stage++; startStage(); };
  const d = Pop.open({ title: `${G.stage + 1}단계 성공!`, body, onClose: next });  // X = 다음 단계 (흐름 안 끊기게)
  if (G.stage === 0) nMoreNotice(true);   // 판 중간 쉬는 타이밍(1단계 성공)에 가장 가까운 미션 1번
  const num = d.querySelector('[data-n]'); countUp(num, sc.score, '점', 600, () => FX.bump(num));
  confetti(perfect ? 60 : 40); Sfx.success();
  d.querySelector('[data-next]').onclick = next;
  d.querySelector('[data-stop]').onclick = stop;
}
function isBetter(c, sc) { return c > (S.bestClear || 0) || (c === (S.bestClear || 0) && c > 0 && sc > (S.best || 0)); }
function endRun() { if (isBetter(G.clears, G.runTotal)) { S.bestClear = G.clears; S.best = G.runTotal; save(); Platform.submitScore(S.bestClear, S.best); } rankNotice(); }
// 실패 창 (Figma 6-4 · 6-6): 광고 이어하기 = 실패한 단계부터 다시(같은 판). 횟수는 한 판·하루 기준 어드민 값
function showFail(sc, again) {
  endGame();   // 판 종료 → 미션 진행 집계 (광고 이어하기를 해도 같은 판이라 두 번 세지 않음)
  const st = CFG.stages[G.stage], leftDay = adLeftToday(), leftGame = CFG.adRetryPerGame - G.adUsed, canAd = leftDay > 0 && leftGame > 0;
  const lead = sc.reason === 'time' ? '시간이 다 됐어요' : sc.reason === 'count' ? `${G.judge.res.pieces.length}조각이 됐어요 (목표 ${st.pieces}조각)` : `기준 ${st.pass}점까지 ${fmt(st.pass - sc.score)}점 모자라요`;
  const scoreLine = sc.reason === 'score' ? `<div class="big" data-n>${fmt(sc.score)}점</div>` : `<img class="gift" data-a="ad_clapper" style="animation:none">`;
  const cnt = Number.isFinite(leftDay) ? `오늘 남은 이어하기 ${leftDay}회<br>` : '';
  const info = canAd ? `<div class="lead2">광고를 보면 ${G.stage + 1}단계부터 다시 해요</div><div class="desc">${cnt}광고 시청은 선택이에요</div>`
    : leftDay <= 0 ? '<div class="lead2">오늘 이어하기를 다 썼어요</div><div class="desc">이어하기 광고는 하루 정해진 횟수까지예요<br>처음부터 다시 도전해요</div>'
    : `<div class="lead2">이번 판 이어하기를 다 썼어요</div><div class="desc">이어하기 광고는 한 판에 ${CFG.adRetryPerGame}번까지예요<br>처음부터 다시 도전해요</div>`;
  const btns = canAd ? '<div class="row2"><button class="btn" data-restart>처음부터</button><button class="btn green" data-ad>광고 보기 <span class="ad">AD</span></button></div>'
    : '<div class="row2"><button class="btn" data-home>홈으로</button><button class="btn green" data-restart>처음부터 다시</button></div>';
  const body = `<div class="col"><div class="slot">${scoreLine}<div class="lead">${lead}</div>${info}</div>${btns}</div>`;
  const home = () => { clearChips(); endRun(); afterRound(goLobby, false); };
  const d = Pop.open({ title: '아쉬워요!', body, cls: again ? 'enter' : 'up', onClose: home });
  const num = d.querySelector('[data-n]'); if (num) { num.style.color = '#ffe9a8'; if (!again) setTimeout(() => FX.bump(num, false), 300); }
  const ad = d.querySelector('[data-ad]');
  if (ad) ad.onclick = () => { if (ad.classList.contains('disabled')) return; Sfx.pop(); ad.classList.add('disabled'); watchContinueAd(sc, () => ad.classList.remove('disabled')); };
  const h = d.querySelector('[data-home]'); if (h) h.onclick = () => { Sfx.pop(); Pop.close(); home(); };
  d.querySelector('[data-restart]').onclick = () => { Sfx.pop(); Pop.close(); clearChips(); endRun(); afterRound(newGame, true); };
  if (!again) roundEndNotice();
}
// 이어하기 광고 (Figma 6-5 · 6-7): 끝까지 봄 → 그 단계부터 다시 / 중간에 닫음 → 실패 창 그대로 / 못 불러옴 → 실패 안내(횟수 차감 없음)
async function watchContinueAd(sc, back) {
  const r = await Platform.showRewardedAd();
  if (r === 'done') { G.adUsed++; countAd(); clearChips(); startStage(); return; }
  if (r === 'closed') { back(); return; }
  const b = document.createElement('div'); b.className = 'col';
  b.innerHTML = `<div class="slot"><img class="gift" data-a="ad_clapper" style="animation:none"><div class="lead2">지금은 광고를 볼 수 없어요</div><div class="desc">잠시 후 다시 시도해 주세요<br>이어하기 횟수는 줄지 않아요</div></div>
    <button class="btn green" data-retry>다시 시도</button><button class="linkb" data-back>실패 창으로 돌아가기</button>`;
  const toFail = () => { Pop.close(); showFail(sc, true); };
  Pop.open({ title: '광고 불러오기 실패', body: b, onClose: toFail });
  b.querySelector('[data-retry]').onclick = () => { Sfx.pop(); Pop.close(); watchContinueAd(sc, () => showFail(sc, true)); };
  b.querySelector('[data-back]').onclick = () => { Sfx.pop(); toFail(); };
}
function showFinal(sc) {
  endGame();
  const total = G.stageScores.reduce((a, b) => a + (b || 0), 0); G.runTotal += total; G.clears = G.stageNo;
  const isBest = isBetter(G.clears, G.runTotal); endRun();
  const m = Missions.state();
  const body = `<div class="col"><div class="slot"><div class="big" data-n>0.0점</div><div class="lead">${G.stageScores.map(fmt).join(' + ')}</div>
    <div class="chips"><span class="chip">${isBest ? `최고 기록! ${G.clears}연승` : `최고 ${S.bestClear}연승`}</span></div>
    <button class="btn green" data-next>다음 스테이지</button></div></div>`;
  $('instr').textContent = '모든 단계를\n성공했어요!'; $('hint').textContent = '연승 기록이 랭킹에 올라가요';
  const nextSet = () => { Pop.close(); clearChips(); G.stageNo++; afterRound(startSet, true); };
  const d = Pop.open({ title: '모든 단계 성공!', body, onClose: nextSet });  // X = 다음 스테이지
  const num = d.querySelector('[data-n]'), chip = d.querySelector('.chips .chip'); if (isBest) chip.style.visibility = 'hidden';
  countUp(num, total, '점', 900, () => { FX.bump(num); if (isBest) setTimeout(() => { chip.style.visibility = ''; chip.classList.add('best'); FX.stampEl(chip, [255, 216, 74]); }, 260); });
  confetti(80); Sfx.fanfare(); FX.fireworks(5);
  d.querySelector('[data-next]').onclick = nextSet;
  roundEndNotice();
}

// ───────────────── 튜토리얼 (신규 유저: 로딩 → 로비 없이 바로) ─────────────────
// 1단계 한 번, 따라 하기로 무조건 통과(타이머 없음). 끝나면 출석 1일차 선물 + 로그인 제안. 중간에 나가면 다음 접속 때 처음부터
const Tut = {
  start() {
    G.tut = true; G.stageNo = 1; G.clears = 0; G.runTotal = 0;
    const def = FOODS[0]; usedFoods.add(def.id); G.food = def;
    const go = (im) => { Food.set(def, im); G.stage = 0; G.stageScores = []; G.adUsed = 0; G.playCounted = true; startStage(); };
    FoodLoader.load(def).then(go).catch(() => go(null));
  },
  // 1-2: 보상 안내 팝업 (Figma 1-2, 말풍선 대체) — 튜토리얼 전에 출석 선물 5P 예고. [시작하기] 또는 X → 1-3 따라 하기 안내. 로그인·알림은 묻지 않음
  enter() {
    G.state = 'cutting'; G.timerOn = false; G.tutReady = false; $('cdim').classList.add('hidden'); $('ready').classList.add('hidden'); updateHint();
    let gone = false;
    const next = () => { if (gone) return; gone = true; Pop.close(); if (G.tut && G.state === 'cutting') setTimeout(() => this.guide(), 120); };
    const foot = '<button class="btn green" data-start>시작하기</button>';
    const d = Pop.open({ title: '출석 선물', body: giftSlot(`토스포인트 ${won(Attend.amt(1))}`, '튜토리얼을 끝내면 받을 수 있어요<br>한 번 따라 해 볼까요?'), foot, onClose: next });
    d.querySelector('[data-start]').onclick = () => { Sfx.pop(); next(); };
  },
  bubble(html, y) {
    const b = document.createElement('div'); b.className = 'tutBub'; b.style.top = y + 'px';
    b.innerHTML = `<img data-a="mascot" alt=""><span>${html}</span>`; assetImgs(b); $('play').appendChild(b);
    b.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' }); return b;
  },
  guide() {
    G.tutReady = true;
    // Figma 1-3: 밝힌 원 = 음식 반지름 + 14 / 시작 = 원 위 가장자리(흰 링 54 + 손가락 34) / 점선 4px(10·8) 끝 화살표 = 원 아래 가장자리
    const r = Math.max(Food.w, Food.h) / 2 + 14, x = L.foodCX, y = L.foodCY, y0 = y - r, yb = y + r, tip = yb + 9;
    const g = document.createElement('div'); g.className = 'tutGuide';
    g.innerHTML = `<div class="tutDim" style="background:radial-gradient(circle at ${x}px ${y}px, rgba(255,240,200,.0) ${r - 1}px, rgba(0,0,0,.55) ${r}px)"></div>
      <svg class="tutLine" width="360" height="${L.H}" viewBox="0 0 360 ${L.H}"><line x1="${x}" y1="${y0 + 17}" x2="${x}" y2="${yb}" stroke="#fff" stroke-width="4" stroke-dasharray="10 8"/>
        <path d="M${x - 9} ${yb - 5} L${x + 9} ${yb - 5} L${x} ${tip} Z" fill="#fff"/><circle cx="${x}" cy="${y0}" r="26" fill="none" stroke="#fff" stroke-width="2"/></svg>
      <i class="tutFinger" style="left:${x}px;top:${y0}px"></i>`;
    $('play').appendChild(g);
    const dy = yb - 12 - y0;
    g.querySelector('.tutFinger').animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(.88)', opacity: 1, offset: .18 },
      { transform: `translate(-50%,calc(-50% + ${dy}px)) scale(.88)`, opacity: 1, offset: .75 }, { transform: `translate(-50%,calc(-50% + ${dy}px)) scale(1)`, opacity: 0, offset: .9 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: 1700, iterations: Infinity, easing: 'ease-in-out' });
    const b = this.bubble('여기를 쭉~ 그어볼래?', Math.min(L.H - L.bottom - 130, Math.max(tip + 17, L.H - L.bottom - 154))); g.appendChild(b);
  },
  clear() { $('play').querySelectorAll('.tutGuide,.tutBub,.tutIntroDim,.tutSkip').forEach(e => e.remove()); },
  // 1-4: 튜토리얼 완료 → 출석 1일차 팝업. 닫으면 미션 창에서 받을 수 있음
  done() {
    this.clear(); G.tut = false; S.tut = true; Attend.begin(); save();
    clearChips(); welcomeOffer();   // 튜토리얼은 판 수에 안 셈 → 첫 판 플레이는 다음 정식 판에서 달성
  },
};

// ───────────────── 랭킹 (Figma P10-1 시상대) ─────────────────
// 서버 연결 전: 예시 순위 + 내 최고 기록. 아바타 = 토스 게임 프로필(profileImageUri), 없으면 기본 그림
const RANK_SAMPLE = ['별빛토끼', '정글탐험가', '바다소년', '코인수집가', '구름이', '파송송마동탁', '빵순이', '칼잡이고양이', '반반장인', '토핑요정', '소금왕', '붕어사냥꾼', '느긋한판다', '오늘도한입', '피자러버', '바삭바삭', '단팥마스터', '노릇노릇', '한입더', '슈크림',
  '쫀득이', '말랑곰', '치즈폭탄', '버터향', '꿀호떡', '딱반', '정확왕', '스피드킹', '느림보', '초보요리사'].map((n, i) => { const c = Math.max(1, 34 - i - (i > 10 ? i - 10 : 0)); return { n, c, s: Math.round(c * (258 - (i % 4) * 6) * 10) / 10 }; });
const rankCmp = (a, b) => b.c - a.c || b.s - a.s;
// 내 전체 랭킹 순위 (0 = 기록 없음 = 랭킹 밖). 랭킹 팝업과 같은 계산(같은 기록이면 내가 뒤)
function myRank() { if (!(S.bestClear > 0)) return 0; const me = { c: S.bestClear, s: S.best || 0 }; return RANK_SAMPLE.filter(x => rankCmp(x, me) <= 0).length + 1; }
// 랭킹 변동 토스트 → [랭킹]으로 흡수 (미션 토스트와 같은 UI). 처음 오름 / 순위 오름 / 순위 내려감(서버 연결 후 다른 유저에게 밀릴 때)
// 판 결과 화면이면 미션 안내(0.7초) 다음 차례로 줄 섬. 같은 순위면 아무것도 안 띄움
function rankNotice(delay = 750) {
  const r = myRank(), prev = S.lastRank || 0; if (!r || r === prev) return;
  S.lastRank = r; save();
  const msg = !prev ? `랭킹에 올랐어요! 지금 ${r}위` : r < prev ? `랭킹 ${r}위로 올랐어요 (▲${prev - r})` : `랭킹 ${r}위로 내려갔어요 · 다시 도전해요`;
  setTimeout(() => toastToRank(msg), delay);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 시상대 카드 배경 (Figma P10-1 'Rectangle 34·35' 그대로: 방패 모양 + 사선 그라데이션 + soft-light 세로 그라데이션 + 안쪽 2px 테두리 + 그림자)
const POD_C = {
  1: { a: ['#F34858', '#EE727D', '#E54755', '#EE727D', '#DA4652'], b: ['#CA343D', '#F1646B'], line: '#FF7D89' },
  2: { a: ['#AB61FF', '#7700FF', '#AB61FF', '#7700FF', '#AB61FF'], b: ['#7700FF', '#A658FF'], line: '#BA7DFF' },
  3: { a: ['#38C75D', '#1D8838', '#38C75D', '#1D8838', '#38C75D'], b: ['#187EC6', '#44B1EA'], line: '#4FDE73' },
};
const POD_OUT = 'M8 36C8 20.9151 8 13.3726 12.6863 8.68629C17.3726 4 24.9151 4 40 4H68C83.0849 4 90.6274 4 95.3137 8.68629C100 13.3726 100 20.9151 100 36V100.776C100 111.98 100 117.582 96.9492 121.786C93.8985 125.99 88.5725 127.726 77.9207 131.2L63.9207 135.765C59.0021 137.369 56.5428 138.171 54 138.171C51.4572 138.171 48.9979 137.369 44.0793 135.765L30.0793 131.2C19.4275 127.726 14.1015 125.99 11.0508 121.786C8 117.582 8 111.98 8 100.776V36Z';
const POD_IN = 'M32 1H55.5117C63.0825 1 68.6606 1.0024 72.9355 1.57715C77.1815 2.14804 79.9928 3.26723 82.1191 5.39355C84.2454 7.5199 85.3647 10.3312 85.9355 14.5771C86.5103 18.852 86.5117 24.4294 86.5117 32V93.3652C86.5117 98.9574 86.5105 103.068 86.1406 106.307C85.7736 109.52 85.0526 111.773 83.6777 113.68C82.3028 115.586 80.3918 116.98 77.459 118.343C74.5026 119.716 70.603 121.015 65.2969 122.78L53.541 126.691C48.4738 128.377 46.1479 129.138 43.7559 129.138C41.3638 129.138 39.0378 128.377 33.9707 126.691L22.2148 122.78C16.9086 121.015 13.0091 119.716 10.0527 118.343C7.11991 116.98 5.20886 115.586 3.83398 113.68C2.45911 111.773 1.73809 109.52 1.37109 106.307C1.00119 103.068 1 98.9574 1 93.3652V32C1 24.4294 1.00243 18.852 1.57715 14.5771C2.14803 10.331 3.26718 7.51993 5.39355 5.39355C7.51993 3.26718 10.331 2.14803 14.5771 1.57715C18.852 1.00243 24.4294 1 32 1Z';
function podBg(r) {
  const c = POD_C[r], st = [0, 0.240385, 0.5, 0.759615, 1];
  return `<svg class="pbg" width="92" height="135" viewBox="0 0 92 135" aria-hidden="true"><defs>
    <linearGradient id="pga${r}" x1="8" y1="4" x2="83.6583" y2="131.061" gradientUnits="userSpaceOnUse">${c.a.map((col, i) => `<stop offset="${st[i]}" stop-color="${col}"/>`).join('')}</linearGradient>
    <linearGradient id="pgb${r}" x1="54" y1="4" x2="54" y2="139" gradientUnits="userSpaceOnUse"><stop stop-color="${c.b[0]}"/><stop offset="1" stop-color="${c.b[1]}"/></linearGradient></defs>
    <g transform="translate(-8,-4)"><path d="${POD_OUT}" fill="url(#pga${r})"/><path d="${POD_OUT}" fill="url(#pgb${r})" style="mix-blend-mode:soft-light"/></g>
    <path transform="translate(2,2)" d="${POD_IN}" stroke="${c.line}" stroke-width="2" fill="none"/></svg>`;
}
// 랭킹 팝업 맨 아래 산정 기준 (Figma 4-1)
const RANK_RULE = '<div class="rrule">랭킹산정 기준: 연승 순, 같으면 점수 합계 순</div>';
// 업데이트 전부터 기록이 있던 유저: 지금 순위를 조용히 저장(첫 실행에 '올랐어요'가 뜨지 않게)
if (S.lastRank === undefined) { S.lastRank = myRank(); save(); }
function openRanking(opt = {}) {
  const pausedBefore = opt.pb !== undefined ? opt.pb : G.paused; G.paused = true; const resume = () => { G.paused = pausedBefore; };
  const back = (tab) => () => openRanking({ tab, pb: pausedBefore });   // 닉네임 변경·친구 등록 뒤 같은 탭으로 돌아옴
  const me = { n: S.nick || '나', c: S.bestClear || 0, s: S.bestClear ? S.best || 0 : 0, me: true, img: S.profileImg || '' };
  const list = [...RANK_SAMPLE, me].sort(rankCmp); const myRank = list.indexOf(me) + 1;
  const val = (x) => x.none ? '기록 없음' : `${x.c}연승`;
  const av = (x) => `<span class="rav">${x.img ? `<img src="${esc(x.img)}" alt="">` : '<img data-a="mascot" alt="">'}</span>`;
  const pod = (x, r) => `<div class="pod p${r}">${podBg(r)}${x ? `<img class="pcrown" data-a="rank_${r}" alt="${r}위">${av(x)}<b>${esc(x.n)}</b><span class="psc">${val(x)}</span>` : ''}</div>`;
  // 친구: 기기에 저장한 닉네임 목록 (서버 연결 전 — 기록은 예시 순위에 있는 이름만 보임)
  const friendList = () => { const f = (S.friends || []).map(n => { const r = RANK_SAMPLE.find(x => x.n === n); return r ? { n, c: r.c, s: r.s } : { n, c: -1, s: 0, none: true }; }); return [...f, me].sort(rankCmp); };
  const head = document.createElement('div'); head.className = 'rhead';
  const body = document.createElement('div'); body.className = 'rcard';
  const foot = document.createElement('div'); foot.className = 'rfoot';
  const meRow = (rank) => `<div class="rme"><span class="rno">${rank}</span><div class="rnm"><small>내 순위</small><b>${esc(me.n)}</b></div><span class="rsc">${val(me)}</span>
      <button class="rbtn" data-edit aria-label="닉네임 변경"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#4a2c10"/></svg></button></div>`;
  const render = (tab) => {
    head.innerHTML = `<div class="tabs"><button class="tab ${tab === 'all' ? 'on' : ''}" data-t="all">전체</button><button class="tab ${tab === 'friend' ? 'on' : ''}" data-t="friend">친구</button></div>
      ${tab === 'all' ? `<div class="podium">${pod(list[1], 2)}${pod(list[0], 1)}${pod(list[2], 3)}</div>` : ''}`;
    if (tab === 'all') {
      body.className = 'rcard';
      body.innerHTML = list.slice(3).map((x, i) => `<div class="rrow ${x.me ? 'mine' : ''}"><span class="no">${i + 4}</span><b>${esc(x.n)}</b><span class="rv">${val(x)}</span></div>`).join('');
      foot.innerHTML = meRow(me.c ? myRank : '-') + RANK_RULE;
    } else {
      const fl = friendList(), n = (S.friends || []).length;
      body.className = 'rcard rfriend';
      // Figma P10-2 · P10-3: 맨 위 Base M 버튼(카드 위 10px) · 빈 상태 문구는 남은 영역 가운데 · 친구 줄 끝 원형 ✕(Theme Round Button MS) · 내 줄 어두운 바탕
      body.innerHTML = `<button class="btn m radd" data-add>+ 친구 추가하기</button>` +
        (n ? fl.map((x, i) => `<div class="rrow ${x.me ? 'mine' : ''}"><span class="no">${i + 1}</span><b>${esc(x.n)}</b><span class="rv${x.none ? ' none' : ''}">${val(x)}</span>${x.me ? '' : `<button class="rbtn rdel" data-del="${esc(x.n)}" aria-label="친구 삭제"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M5 5l14 14M19 5L5 19" stroke="#4a2c10" stroke-width="4" stroke-linecap="round"/></svg></button>`}</div>`).join('')
          : '<div class="rfempty">닉네임으로 친구를 추가하면<br>여기서 함께 순위를 볼 수 있어요</div>');
      foot.innerHTML = meRow(n ? fl.indexOf(me) + 1 : '-') + RANK_RULE;
    }
    assetImgs(head); assetImgs(body);
    head.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { if (b.dataset.t === tab) return; Sfx.pop(); render(b.dataset.t); });
    foot.querySelector('[data-edit]').onclick = () => { Sfx.pop(); editNick(back(tab)); };
    const add = body.querySelector('[data-add]'); if (add) add.onclick = () => { Sfx.pop(); addFriend(back('friend')); };
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Sfx.pop(); S.friends = (S.friends || []).filter(x => x !== b.dataset.del); save(); toast('친구 목록에서 지웠어요'); render('friend'); });
    const sb = Pop.el && Pop.el.querySelector('.pbody'); if (sb) sb.scrollTop = 0;
    requestAnimationFrame(() => { const mine = tab === 'all' && body.querySelector('.rrow.mine'); if (mine) Pop.reveal(mine); Pop.updFade && Pop.updFade(); });
  };
  render('all');
  const d = Pop.open({ title: '랭킹', head, body, foot, cls: 'enter dk', onClose: resume });
  // 높이는 '전체' 탭 기준으로 고정 → 친구 탭으로 바꿔도 팝업 크기 그대로
  const pop = d.querySelector('.pop'); pop.style.height = pop.offsetHeight + 'px'; pop.classList.add('fixh');
  if (opt.tab === 'friend') render('friend');
  // 토스 게임 프로필(닉네임·프로필 이미지)이 있으면 반영
  if (!S.profileImg && Platform.getProfile) Platform.getProfile().then(p => { if (p && p.profileImageUri) { S.profileImg = p.profileImageUri; save(); me.img = p.profileImageUri; if (Pop.el === d && head.querySelector('.tab.on[data-t="all"]')) render('all'); } }).catch(() => {});
}
// 한 줄 입력 팝업 (닉네임 변경 P11 모양): 텍스트 필드 + [취소][저장]
function textDialog({ title, value = '', placeholder, desc, okLabel = '저장', onSave, after }) {
  const b = document.createElement('div'); b.className = 'slot';
  b.innerHTML = `<div class="nick dark"><input maxlength="12" placeholder="${placeholder}" value="${esc(value)}"></div><div class="desc">${desc}</div>
    <div class="row2"><button class="btn" data-c>취소</button><button class="btn green" data-s>${okLabel}</button></div>`;
  Pop.open({ title, body: b, onClose: () => after && after() });
  const inp = b.querySelector('input'), ok = () => { const v = inp.value.trim(); if (onSave(v) === false) return; Pop.close(); after && after(); };
  b.querySelector('[data-c]').onclick = () => { Sfx.pop(); Pop.close(); after && after(); };
  b.querySelector('[data-s]').onclick = ok; inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
}
const NICK_RE = /^[가-힣a-zA-Z0-9]{2,12}$/;
function editNick(after) {
  textDialog({ title: '닉네임 변경', value: S.nick || '', placeholder: '닉네임을 입력하세요', desc: '2~12자 · 한글/영문/숫자', after,
    onSave: (v) => { if (!NICK_RE.test(v)) { toast('2~12자 한글/영문/숫자로 써 주세요'); return false; } S.nick = v; save(); refreshLobby(); toast('닉네임을 바꿨어요'); } });
}
// 친구 등록: 닉네임으로 추가 (서버 연결 전에는 기기에만 저장)
const FRIEND_MAX = 30;
function addFriend(after) {
  textDialog({ title: '친구 등록', placeholder: '친구 닉네임을 입력하세요', desc: '친구의 닉네임을 정확히 써 주세요', after,
    onSave: (v) => {
      const f = S.friends || (S.friends = []);
      if (!NICK_RE.test(v)) { toast('2~12자 한글/영문/숫자로 써 주세요'); return false; }
      if (v === S.nick) { toast('내 닉네임은 친구로 등록할 수 없어요'); return false; }
      if (f.includes(v)) { toast('이미 등록한 친구예요'); return false; }
      if (f.length >= FRIEND_MAX) { toast(`친구는 ${FRIEND_MAX}명까지 등록할 수 있어요`); return false; }
      f.push(v); save(); toast(`${v}님을 친구로 등록했어요`);
    } });
}

// 광고 일일 상한 + 가짜 광고(웹 테스트용)
function adLeftToday() { if (S.adDay !== dayKey()) { S.adDay = dayKey(); S.adCount = 0; } return CFG.adDailyCap - S.adCount; }
function countAd() { adLeftToday(); S.adCount++; save(); }
const FakeAd = {
  // 웹 테스트: 5초 전에 닫으면 'closed', 주소에 ?adfail=1 이면 'error'(불러오기 실패)
  show() { return new Promise((res) => {
    if (new URLSearchParams(location.search).has('adfail')) { setTimeout(() => res('error'), 300); return; }
    Sfx.suspend(); const el = document.createElement('div'); el.id = 'ad';
    el.innerHTML = '<div class="x" data-x>5초</div><div class="t">AD</div><div class="s">테스트 광고 · 실제 광고 SDK 자리</div>';
    app.appendChild(el); let left = 5; const x = el.querySelector('[data-x]');
    x.onclick = () => { clearInterval(iv); el.remove(); Sfx.resume(); res('closed'); };
    const iv = setInterval(() => { left--; if (left > 0) x.textContent = left + '초'; else { clearInterval(iv); x.textContent = '보상 받기 ✕'; x.onclick = () => { el.remove(); Sfx.resume(); res('done'); }; } }, 1000);
  }); },
};

// ───────────────── 인트로 영상 ─────────────────
// 소리 없이 자동재생(모바일 자동재생 조건), 끝나면 마지막 장면에서 멈춤 → 터치하면 로비
// 화면 비율: 세로 폰(가로/세로 ≤ 0.66)은 꽉 채움(cover), 폴드 펼침·태블릿처럼 넓으면 영상 전체(contain) + 뒤에 흐린 배경
const Intro = {
  start(done) {
    const el = $('intro'), v = $('introVideo'); let finished = false, ended = false;
    el.querySelector('.ibg').style.backgroundImage = `url(${ASSETS.intro_end})`;
    const end = () => { if (finished) return; finished = true; el.classList.add('out'); setTimeout(() => { el.remove(); done && done(); }, 350); };
    const showEnd = () => { ended = true; el.classList.add('ended'); };
    if (!v || !v.canPlayType('video/mp4')) { end(); return; }
    v.muted = true; v.loop = false;
    v.addEventListener('ended', showEnd);
    v.addEventListener('error', showEnd);
    $('introSkip').onclick = (e) => { e.stopPropagation(); Sfx.unlock(); end(); };
    // 재생 시작: 웹은 바로. 토스는 토스 첫 화면(게임 등급 안내 등, 감지 API 없음)이 끝날 시간을 기다렸다가 — 그동안은 첫 장면 정지
    let started = false;
    const go = () => {
      if (started || finished) return; started = true;
      const p = v.play(); if (p && p.catch) p.catch(showEnd);  // 저전력 모드 등으로 자동재생 막히면 마지막 장면 + 터치 안내
      setTimeout(() => { if (!ended && v.currentTime === 0) showEnd(); }, 1500);
    };
    el.onclick = () => { if (ended) { Sfx.unlock(); end(); } else if (!started) go(); else if (v.paused) v.play().catch(showEnd); };   // 기다리는 중 터치 = 바로 재생
    v.poster = ASSETS.intro_first;
    const wait = window.__gameChannel === 'toss' ? CFG.tossIntroWait : 0;
    if (!wait) go();
    else {
      const t0 = performance.now();
      const arm = () => { if (document.hidden || started) return; setTimeout(() => { if (!document.hidden) go(); }, Math.max(400, wait - (performance.now() - t0))); };
      document.addEventListener('visibilitychange', () => { if (!document.hidden) arm(); });   // 화면이 가려졌다 보이면 그때부터 다시 잼
      arm();
    }
  },
};

// ───────────────── 시작 ─────────────────
// [게임 시작] → 인게임 진입 순간 그날 출석 팝업 1번 (Figma 4-2 · 4-4, 로비에서는 안 띄움)
$('btnStart').onclick = () => { Sfx.unlock(); Sfx.pop(); G.attPending = !!Attend.today() && S.attShown !== dayKey(); newGame(); };
$('btnMission').onclick = () => { Sfx.pop(); openMissions(); };
$('btnNick').onclick = () => { Sfx.pop(); const v = $('nickInput').value.trim();
  if (!NICK_RE.test(v)) { toast('2~12자 한글/영문/숫자로 써 주세요'); return; } S.nick = v; save(); $('nickInput').blur(); toast('닉네임을 바꿨어요'); };
$('nickInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnNick').click(); });
$('rewardChip').onclick = (e) => { e.stopPropagation(); Sfx.pop(); openMissions(); };
const pauseFor = (fn) => { const was = G.paused; G.paused = true; fn(() => { G.paused = was; }); };
$('navHome').onclick = () => { if (G.state === 'judging') return; Sfx.pop(); if (G.state === 'cutting' || G.state === 'countdown') { pauseFor((resume) => { const b = document.createElement('div'); b.className = 'col';
  b.innerHTML = '<div class="slot"><div class="lead">지금 그만두면 이번 판이 끝나요</div><div class="row2"><button class="btn" data-no>계속하기</button><button class="btn green" data-yes>홈으로</button></div></div>';
  Pop.open({ title: '홈으로 갈까요?', body: b, onClose: resume }); b.querySelector('[data-no]').onclick = () => { Pop.close(); resume(); }; b.querySelector('[data-yes]').onclick = () => { Pop.close(); $('cdim').classList.add('hidden'); clearChips(); goLobby(); }; }); }
  else { clearChips(); goLobby(); } };   // 결과 전 홈 = 판 수에 안 셈
$('btnMis').onclick = () => { if (G.state === 'judging') return; Sfx.pop(); if (app.classList.contains('inPlay')) pauseFor((resume) => { openMissions(resume); }); else openMissions(); };
for (const id of ['play']) $(id).querySelector('.nav').addEventListener('pointerdown', e => e.stopPropagation());
$('btnSet2').onclick = () => { Sfx.pop(); openSettings(); };
$('btnRank').onclick = () => { if (G.state === 'judging') return; Sfx.pop(); openRanking(); };
$('navSet').onclick = () => { if (G.state === 'judging') return; Sfx.pop(); openSettings(); };
for (const id of ['hdr']) $(id).addEventListener('pointerdown', e => e.stopPropagation());
window.addEventListener('tossinsets', () => { L._fitted = false; fit(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { G._hiddenPause = G.paused; G.paused = true; Sfx.suspend(); } else { G.paused = G._hiddenPause || !!Pop.el && G.state === 'cutting'; Sfx.resume(); } });
addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 250));
document.addEventListener('focusout', (e) => { if (e.target && e.target.tagName === 'INPUT') setTimeout(() => { window.scrollTo(0, 0); fit(); }, 120); });
assetImgs(); document.querySelectorAll('[data-bg]').forEach(el => { el.style.backgroundImage = `url(${ASSETS[el.dataset.bg]})`; });
if (!S.nick) { S.nick = '한입' + (1000 + Math.floor(Math.random() * 9000)); save(); }  // 기본 닉네임: 한입 + 숫자 4자리
Food.set(FOODS[0], null); fit(); refreshPoints(); Screen.show('lobby');
FoodLoader.load(FOODS[0]).then(im => { if (Food.def === FOODS[0] && !Food.img) Food.set(FOODS[0], im); }).catch(() => {});
requestAnimationFrame(loop);
// 첫 방문 보상 (하루 1번, 팝업과 동시에 지급)
// 신규(튜토리얼 기록 없음) = 로비 없이 바로 튜토리얼 / 그 외 = 로비. 진입 직후 로그인·자동 팝업 없음
const afterIntro = () => { Sfx.preload(); CatSlash.preload(); FoodLoader.preloadAll(); if (!S.tut) Tut.start(); };  // 진입 직후 자동 팝업 금지(토스 검수) → 방문 보상 팝업 없음, 웰컴 기프트는 게임 SDK
Intro.start(afterIntro);
document.addEventListener('pointerdown', () => Sfx.unlock(), { capture: true });
// 디버그/QA 훅
window.__bb = { nearMission, nMoreNotice, Tut, Attend, Alarm, attendOffer, attendView, afterRound, alarmPopup, adPopup, showFail, showFinal, openMissions, roundEndNotice, CatSlash, FoodLoader, Intro, FOODS, startSet, openRanking, G, S, CFG, Food, Missions, computePieces, scoreOf, doCut, judge, startStage, newGame, L };
