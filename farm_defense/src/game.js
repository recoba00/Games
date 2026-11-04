/* 텃밭 지키기 — 화면, 입력, 저장. 규칙과 전투는 game-core.js */
'use strict';
const CFG = { version: 'v0.1.0', saveKey: 'farmdef.save.v1', autosaveSec: 5 };
const core = window.GameCore;
const { FIELD, DEFENDERS, DEF_BY_ID } = core;
const $ = id => document.getElementById(id);

// ── 저장 ──
if (new URLSearchParams(location.search).has('reset')) {
  try { localStorage.removeItem(CFG.saveKey); } catch (e) {}
  history.replaceState(null, '', location.pathname);
}
let firstVisit = false;
function load() {
  try { const raw = localStorage.getItem(CFG.saveKey); if (raw) return JSON.parse(raw); } catch (e) {}
  firstVisit = true; return {};
}
const S = core.initSave(load());
function save() {
  S.savedAt = Date.now();
  try { localStorage.setItem(CFG.saveKey, JSON.stringify(S)); } catch (e) {}
}
const ctxB = { levels: S.levels, seeds: S.seeds, boost: 1 };
const B = core.createBattle(ctxB);

// ── 캔버스 ──
const cv = $('game'), g = cv.getContext('2d');
let dpr = 1, scale = 1, ox = 0, oy = 0;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  // 전장 전체(숲 → 텃밭)가 들어오도록 맞추고, 남는 세로 공간은 위쪽 숲, 남는 가로 공간은 양옆 풀밭으로 채움
  scale = Math.min(w / FIELD.W, h / FIELD.H);
  ox = (w - FIELD.W * scale) / 2; oy = h - FIELD.H * scale;
}
window.addEventListener('resize', resize);
const toField = (cx, cy) => ({ x: (cx - ox) / scale, y: (cy - oy) / scale });

// ── 연출 상태 ──
const fx = { floats: [], rings: [], banner: null, shake: 0, barks: {}, swing: {} };
function floatText(x, y, text, opt = {}) {
  fx.floats.push({ x, y, text, t: 0, life: opt.life || 1.1, size: opt.size || 22, color: opt.color || '#fff', leaf: !!opt.leaf, rise: opt.rise ?? 46 });
}
function banner(text, sub, boss) { fx.banner = { text, sub, boss, t: 0, life: boss ? 2.4 : 1.4 }; }

// ── 그리기: 배경 ──
function drawBackground() {
  const W = FIELD.W, L = -300, R = W + 300, top = 54;
  // 숲 (위쪽, 화면이 길면 더 위로 이어짐)
  g.fillStyle = '#3f7a37'; g.fillRect(L, -900, R - L, 900 + top + 10);
  for (let i = -6; i < 15; i++) {
    const x = i * 48 + 10, y = 18 + (((i % 2) + 2) % 2) * 12;
    g.fillStyle = '#2f6a2c'; circle(x, y, 32);
    g.fillStyle = '#4c8d40'; circle(x - 8, y - 9, 18);
  }
  // 풀밭
  const grd = g.createLinearGradient(0, top, 0, FIELD.FENCE_Y);
  grd.addColorStop(0, '#9fcf78'); grd.addColorStop(1, '#c4e39a');
  g.fillStyle = grd; g.fillRect(L, top, R - L, FIELD.FENCE_Y - top);
  g.fillStyle = 'rgba(255,255,255,.12)';
  for (let y = top + 30; y < FIELD.FENCE_Y - 20; y += 50) g.fillRect(L, y, R - L, 16);
  g.fillStyle = '#5c9a48';
  for (let i = -10; i < 24; i++) circle(i * 30, top + 2, 14);
  // 텃밭 (울타리 아래)
  g.fillStyle = '#8a5a2e'; g.fillRect(L, FIELD.FENCE_Y, R - L, FIELD.H - FIELD.FENCE_Y + 60);
  for (let r = 0; r < 3; r++) {
    const y = FIELD.FENCE_Y + 18 + r * 24;
    g.fillStyle = '#74491f'; g.fillRect(L, y + 8, R - L, 5);
    for (let i = -6; i < 15; i++) {
      const x = 22 + i * 44 + (r % 2) * 22;
      g.fillStyle = '#4fae45'; circle(x, y, 10);
      g.fillStyle = '#7fd06b'; circle(x - 3, y - 3, 5);
    }
  }
}
function drawFence(hpRatio) {
  const y = FIELD.FENCE_Y, W = FIELD.W;
  g.save();
  g.fillStyle = '#b07a42'; g.strokeStyle = '#6e4420'; g.lineWidth = 2;
  roundRect(-300, y - 14, W + 600, 8, 3); g.fill(); g.stroke();
  roundRect(-300, y - 2, W + 600, 8, 3); g.fill(); g.stroke();
  for (let x = 8 - 34 * 8; x < W + 34 * 8; x += 34) {
    const broken = hpRatio < 1 && (((x * 7) % 10 + 10) % 10) / 10 > hpRatio;
    g.fillStyle = broken ? '#8b6a4a' : '#c98b4a';
    roundRect(x - 5, y - 24 + (broken ? 8 : 0), 10, broken ? 24 : 32, 3); g.fill(); g.stroke();
  }
  g.restore();
}

// ── 그리기: 수비대 ──
function drawScarecrow(c, x, y, s, swing = 0, alpha = 1) {
  c.save(); c.globalAlpha = alpha; c.translate(x, y); c.scale(s, s);
  c.lineCap = 'round';
  c.strokeStyle = '#7a4b22'; c.lineWidth = 6; line(c, 0, -20, 0, 34);                 // 기둥
  c.save(); c.rotate(-0.25 * swing);
  c.strokeStyle = '#7a4b22'; c.lineWidth = 5; line(c, -30, -8, 30, -8);              // 팔 막대
  c.fillStyle = '#4f7fc4'; c.strokeStyle = '#2f5a94'; c.lineWidth = 2;
  roundRectC(c, -24, -16, 48, 30, 6); c.fill(); c.stroke();                          // 셔츠
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2;
  line(c, -12, -16, -12, 14); line(c, 8, -16, 8, 14); line(c, -24, 0, 24, 0);       // 체크무늬
  c.fillStyle = '#f2c94c';
  for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 30, -8); c.lineTo(sx * 40, -15); c.lineTo(sx * 40, -1); c.closePath(); c.fill(); }
  c.restore();
  c.fillStyle = '#f3dcb0'; c.strokeStyle = '#b8935c'; c.lineWidth = 2;
  c.beginPath(); c.arc(0, -30, 14, 0, 6.283); c.fill(); c.stroke();                 // 얼굴
  c.fillStyle = '#3b2410'; dot(c, -5, -32, 2); dot(c, 5, -32, 2);
  c.strokeStyle = '#3b2410'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, -28, 6, 0.3, 2.84); c.stroke();
  c.fillStyle = '#e6b23a'; c.strokeStyle = '#a57618';
  c.beginPath(); c.ellipse(0, -40, 24, 6, 0, 0, 6.283); c.fill(); c.stroke();        // 밀짚모자 챙
  c.beginPath(); c.ellipse(0, -46, 12, 10, 0, Math.PI, 0); c.fill(); c.stroke();
  c.fillStyle = '#d4553a'; c.fillRect(-12, -45, 24, 4);
  c.restore();
}
function drawJindo(c, x, y, s, bark = 0, alpha = 1) {
  c.save(); c.globalAlpha = alpha; c.translate(x, y); c.scale(s, s);
  c.fillStyle = '#f4ead6'; c.strokeStyle = '#b9a27a'; c.lineWidth = 2;
  c.beginPath(); c.ellipse(16, 14, 8, 14, 0.6, 0, 6.283); c.fill(); c.stroke();      // 말린 꼬리
  c.beginPath(); c.ellipse(0, 12, 22, 22, 0, 0, 6.283); c.fill(); c.stroke();        // 몸
  c.translate(0, -bark * 4);
  for (const sx of [-1, 1]) {                                                     // 쫑긋 귀
    c.beginPath(); c.moveTo(sx * 6, -26); c.lineTo(sx * 16, -42); c.lineTo(sx * 18, -20); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#f2b8a6'; c.beginPath(); c.moveTo(sx * 9, -26); c.lineTo(sx * 15, -36); c.lineTo(sx * 15, -24); c.closePath(); c.fill(); c.fillStyle = '#f4ead6';
  }
  c.beginPath(); c.arc(0, -14, 18, 0, 6.283); c.fill(); c.stroke();                  // 머리
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, -7, 9, 7, 0, 0, 6.283); c.fill();
  c.fillStyle = '#3b2410'; dot(c, -7, -18, 2.6); dot(c, 7, -18, 2.6); dot(c, 0, -10, 3.4);
  if (bark > 0.2) { c.fillStyle = '#a0301a'; c.beginPath(); c.ellipse(0, -3, 4, 3 * bark, 0, 0, 6.283); c.fill(); }
  c.fillStyle = '#d4553a'; roundRectC(c, -14, 2, 28, 5, 2); c.fill();                  // 빨간 목줄
  c.restore();
}
function drawDefender(c, id, x, y, s, anim, alpha) {
  if (id === 'scarecrow') drawScarecrow(c, x, y, s, anim, alpha);
  else drawJindo(c, x, y, s, anim, alpha);
}

// ── 그리기: 동물 (화면 아래 = 텃밭 쪽을 보고 내려옴) ──
const ANIMAL_DRAW = 1.4;   // 타깃 연령 고려해 크게 (판정 크기와 별개)
function drawAnimal(a) {
  const run = a.fleeing > 0, alpha = run ? Math.max(0, 1 - a.fleeing / 0.9) : 1;
  const bob = a.kind === 'rabbit' ? -Math.abs(Math.sin(a.phase)) * 6 : Math.sin(a.phase) * 1.5;
  const jx = a.hitT > 0 ? Math.sin(a.hitT * 90) * 2.5 : 0;
  g.save(); g.globalAlpha = alpha; g.translate(a.x + jx, a.y + bob); g.scale(ANIMAL_DRAW, ANIMAL_DRAW);
  const r = a.r;
  if (a.kind === 'sparrow') {
    const fl = Math.sin(a.phase) * 0.5;
    g.fillStyle = '#8a5a30';
    for (const sx of [-1, 1]) { g.save(); g.rotate(sx * (0.4 + fl)); g.beginPath(); g.ellipse(sx * r * 0.9, 0, r * 0.7, r * 0.35, 0, 0, 6.283); g.fill(); g.restore(); }
    g.fillStyle = '#a8763f'; circle(0, 0, r);
    g.fillStyle = '#f0dcb8'; g.beginPath(); g.ellipse(0, r * 0.25, r * 0.6, r * 0.55, 0, 0, 6.283); g.fill();
    g.fillStyle = '#5a3a1a'; g.beginPath(); g.ellipse(0, -r * 0.55, r * 0.75, r * 0.35, 0, 0, 6.283); g.fill();
    g.fillStyle = '#f0a43a'; g.beginPath(); g.moveTo(-4, 0); g.lineTo(4, 0); g.lineTo(0, 7); g.closePath(); g.fill();
    g.fillStyle = '#1e1208'; dot(g, -6, -4, 2.4); dot(g, 6, -4, 2.4);
  } else if (a.kind === 'rabbit') {
    g.fillStyle = '#efe8dc'; g.strokeStyle = '#b8ab95'; g.lineWidth = 1.5;
    for (const sx of [-1, 1]) {
      g.beginPath(); g.ellipse(sx * 7, -r - 8, 5.5, 15, sx * 0.15, 0, 6.283); g.fill(); g.stroke();
      g.fillStyle = '#f4b9b0'; g.beginPath(); g.ellipse(sx * 7, -r - 7, 2.6, 10, sx * 0.15, 0, 6.283); g.fill(); g.fillStyle = '#efe8dc';
    }
    g.beginPath(); g.ellipse(0, 4, r, r * 0.95, 0, 0, 6.283); g.fill(); g.stroke();
    g.fillStyle = '#1e1208'; dot(g, -6, -1, 2.6); dot(g, 6, -1, 2.6);
    g.fillStyle = '#e88f8f'; dot(g, 0, 5, 2.4);
    g.fillStyle = '#f7c8c0'; dot(g, -10, 7, 3); dot(g, 10, 7, 3);
  } else {
    // 멧돼지 대장
    g.fillStyle = '#6b4226'; g.strokeStyle = '#3e2412'; g.lineWidth = 2;
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * r * 0.45, -r * 0.7); g.lineTo(sx * r * 0.85, -r * 1.05); g.lineTo(sx * r * 0.85, -r * 0.45); g.closePath(); g.fill(); g.stroke(); }
    g.beginPath(); g.ellipse(0, 0, r, r * 0.92, 0, 0, 6.283); g.fill(); g.stroke();
    g.fillStyle = '#d4553a'; g.fillRect(-r * 0.8, -r * 0.55, r * 1.6, 7);            // 대장 머리띠
    g.fillStyle = '#e7a88f'; g.beginPath(); g.ellipse(0, r * 0.3, r * 0.42, r * 0.3, 0, 0, 6.283); g.fill(); g.stroke();
    g.fillStyle = '#3e2412'; dot(g, -5, r * 0.3, 3); dot(g, 5, r * 0.3, 3);
    g.fillStyle = '#fffaf0';
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * r * 0.35, r * 0.45); g.quadraticCurveTo(sx * r * 0.6, r * 0.5, sx * r * 0.55, r * 0.1); g.lineTo(sx * r * 0.45, r * 0.4); g.closePath(); g.fill(); }
    g.fillStyle = '#1e1208'; dot(g, -r * 0.35, -r * 0.15, 3.5); dot(g, r * 0.35, -r * 0.15, 3.5);
    g.strokeStyle = '#1e1208'; g.lineWidth = 3; line(g, -r * 0.55, -r * 0.35, -r * 0.2, -r * 0.25); line(g, r * 0.55, -r * 0.35, r * 0.2, -r * 0.25);
  }
  if (run) {                                                   // 놀람 말풍선 (다치지 않고 도망)
    g.fillStyle = '#ffe14d'; g.strokeStyle = '#3b2410'; g.lineWidth = 2;
    g.beginPath(); g.arc(r * 0.9, -r - 10, 11, 0, 6.283); g.fill(); g.stroke();
    g.fillStyle = '#3b2410'; g.font = '18px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', r * 0.9, -r - 9);
  } else if (a.hitT > 0) {
    g.fillStyle = 'rgba(255,255,255,.45)'; circle(0, 0, r * 0.9);
  }
  g.restore();
  // 겁 게이지
  if (!run && (a.fear > 0 || a.boss)) {
    const w = Math.max(36, a.r * 2.4), x = a.x - w / 2, y = a.y - (a.r + (a.kind === 'rabbit' ? 26 : 10)) * ANIMAL_DRAW;
    g.fillStyle = 'rgba(59,36,16,.75)'; roundRect(x - 2, y - 2, w + 4, 10, 5); g.fill();
    g.fillStyle = a.boss ? '#ff8a3d' : '#ffd23f'; roundRect(x, y, w * Math.min(1, a.fear / a.fearMax), 6, 3); g.fill();
  }
}

// ── 그리기 도우미 ──
function circle(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); }
function dot(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); }
function line(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function roundRectC(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, Math.max(0, w), h, r); else c.rect(x, y, Math.max(0, w), h); }
const roundRect = (x, y, w, h, r) => roundRectC(g, x, y, w, h, r);
function outlinedText(text, x, y, size, color, stroke = '#3b2410') {
  g.font = `${size}px Jua, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = Math.max(3, size / 5); g.strokeStyle = stroke; g.strokeText(text, x, y);
  g.fillStyle = color; g.fillText(text, x, y);
}

// ── 한 프레임 ──
function render(dt) {
  const w = cv.width, h = cv.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#3f7a37'; g.fillRect(0, 0, w, h);
  const sh = fx.shake > 0 ? (Math.random() - 0.5) * fx.shake * 10 : 0;
  g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + sh), dpr * oy);
  drawBackground();
  // 수비대
  for (const d of DEFENDERS) {
    const lv = S.levels[d.id] || 0, unlocked = S.maxStage >= d.unlock;
    if (!unlocked) continue;
    const anim = d.id === 'jindo' ? (fx.barks[d.id] || 0) : (fx.swing[d.id] || 0);
    drawDefender(g, d.id, d.x, FIELD.DEF_Y, 1.3, anim, lv > 0 ? 1 : 0.35);
    if (lv <= 0) outlinedText('고용하면 와요', d.x, FIELD.DEF_Y + 30, 16, '#fff');
  }
  // 동물 (뒤에 있는 것부터)
  const list = B.animals.slice().sort((a, b) => a.y - b.y);
  for (const a of list) drawAnimal(a);
  // 지푸라기
  for (const s of B.shots) {
    g.fillStyle = '#f2c94c'; g.strokeStyle = '#a57618'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(s.x, s.y, 6, 0, 6.283); g.fill(); g.stroke();
  }
  drawFence(Math.max(0, B.fenceHp) / core.F.FENCE_MAX);
  // 훠이 원
  for (const r of fx.rings) {
    const k = r.t / r.life;
    g.strokeStyle = `rgba(255,255,255,${1 - k})`; g.lineWidth = 4;
    g.beginPath(); g.arc(r.x, r.y, 16 + k * core.F.SHOO_RADIUS, 0, 6.283); g.stroke();
  }
  // 떠오르는 글자
  for (const f of fx.floats) {
    const k = f.t / f.life;
    g.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    const y = f.y - f.rise * Math.min(1, k * 1.6);
    if (f.leaf) {
      g.save(); g.translate(f.x - f.size * 0.9, y); g.rotate(-0.78);
      g.fillStyle = '#4fae45'; g.strokeStyle = '#2c7329'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(0, 0, f.size * 0.32, f.size * 0.2, 0, 0, 6.283); g.fill(); g.stroke(); g.restore();
      outlinedText(f.text, f.x + 6, y, f.size, f.color);
    } else outlinedText(f.text, f.x, y, f.size, f.color);
    g.globalAlpha = 1;
  }
  // 스테이지 안내
  if (fx.banner) {
    const b = fx.banner, k = b.t / b.life, a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
    g.globalAlpha = Math.max(0, a);
    const y = 150;
    g.fillStyle = b.boss ? 'rgba(160,48,26,.92)' : 'rgba(59,36,16,.85)';
    roundRect(30, y - 46, FIELD.W - 60, b.sub ? 96 : 70, 20); g.fill();
    outlinedText(b.text, FIELD.W / 2, y - (b.sub ? 12 : 0) - 10, b.boss ? 28 : 32, b.boss ? '#ffe14d' : '#fff', 'rgba(0,0,0,0)');
    if (b.sub) outlinedText(b.sub, FIELD.W / 2, y + 24, 19, '#fff3d6', 'rgba(0,0,0,0)');
    g.globalAlpha = 1;
  }
}

// ── 전투 이벤트 → 연출·재화 ──
let nextStartAt = 0;
function handleEvents() {
  for (const e of B.drain()) {
    switch (e.type) {
      case 'stage':
        if (e.boss) banner('멧돼지 대장이 내려와요!', '울타리를 지켜 주세요', true);
        else banner(`스테이지 ${e.stage}`);
        refreshHud();
        break;
      case 'scared':
        S.crops += e.reward;
        floatText(e.x, e.y - 10, '+' + core.korNum(e.reward), { leaf: true, size: e.boss ? 30 : 22, life: e.boss ? 1.6 : 1.1 });
        if (e.boss) toast('멧돼지 대장을 쫓아냈어요!');
        cropsDirty = true;
        break;
      case 'attack':
        if (e.by === 'jindo') { fx.barks.jindo = 1; floatText(e.x + 30, FIELD.DEF_Y - 40, '멍!', { size: 20, life: 0.6, rise: 16 }); }
        else fx.swing[e.by] = 1;
        break;
      case 'shoo':
        fx.rings.push({ x: e.x, y: e.y, t: 0, life: 0.45 });
        floatText(e.x, e.y - 20, '훠이!', { size: 24, life: 0.7, rise: 24, color: e.hit ? '#fff' : '#fff3d6' });
        break;
      case 'fence':
        fx.shake = 0.35;
        floatText(e.x, e.y - 30, '냠냠', { size: 20, color: '#ffd9cf' });
        refreshFence();
        break;
      case 'cleared':
        S.stage = e.stage + 1; S.maxStage = Math.max(S.maxStage, S.stage);
        save(); refreshHud(); refreshList(true);
        nextStartAt = now() + 900;
        break;
      case 'failed':
        S.stage = Math.max(1, e.stage - 1);
        save(); refreshHud();
        toast('울타리가 무너졌어요. 한 단계 뒤에서 힘을 길러요');
        nextStartAt = now() + 1800;
        break;
    }
  }
}
const now = () => performance.now();

// ── 화면 정보 갱신 ──
let cropsDirty = true;
function refreshHud() {
  $('stageNum').textContent = S.stage;
  $('stagePill').classList.toggle('boss', core.isBoss(S.stage));
  $('stagePill').setAttribute('aria-label', `스테이지 ${S.stage}${core.isBoss(S.stage) ? ', 멧돼지 대장' : ''}`);
  refreshFence();
}
function refreshFence() {
  const k = Math.max(0, B.fenceHp) / core.F.FENCE_MAX, el = $('fenceFill');
  el.style.width = (k * 100) + '%'; el.classList.toggle('low', k <= 0.3);
}
function refreshCrops() { $('cropCount').textContent = core.korNum(S.crops); cropsDirty = false; }

// ── 수비대 목록 ──
const rows = {};
function buildList() {
  const root = $('defList');
  for (const d of DEFENDERS) {
    const row = document.createElement('div'); row.className = 'row';
    const pc = document.createElement('canvas'); pc.width = 128; pc.height = 128; pc.setAttribute('aria-hidden', 'true');
    const info = document.createElement('div'); info.className = 'info';
    info.innerHTML = `<div class="name">${d.name}</div><div class="lv"></div><div class="role">${d.role}</div>`;
    const btn = document.createElement('button'); btn.className = 'buy';
    btn.addEventListener('click', () => onBuy(d.id));
    row.append(pc, info, btn); root.append(row);
    rows[d.id] = { row, pc, lv: info.querySelector('.lv'), btn, drawnLv: -1, sig: '' };
  }
}
function onBuy(id) {
  const n = core.levelUp(S, id, S.bulk);
  if (!n) return;
  const d = DEF_BY_ID[id], lv = S.levels[id];
  if (lv === n) toast(`${d.name}가 텃밭을 지키러 왔어요!`);
  else if (core.bonusMult(lv) > core.bonusMult(lv - n)) toast(`${d.name} ${lv}레벨 달성! 힘 2배`);
  fx.swing[id] = 1; fx.barks[id] = 1;
  cropsDirty = true; save(); refreshList(true);
}
function refreshList(force) {
  for (const d of DEFENDERS) {
    const r = rows[d.id], lv = S.levels[d.id] || 0, unlocked = S.maxStage >= d.unlock;
    let k = S.bulk === 'max' ? core.maxAffordable(d, lv, S.crops) : S.bulk;
    const showK = Math.max(1, k), cost = core.bulkCost(d, lv, showK);
    const can = unlocked && (S.bulk === 'max' ? k > 0 : cost <= S.crops);
    const verb = lv === 0 ? '고용' : '강화';
    const sig = [lv, unlocked, can, showK, Math.floor(cost)].join('|');
    if (!force && sig === r.sig) continue;
    r.sig = sig;
    r.row.classList.toggle('locked', !unlocked);
    r.lv.textContent = lv > 0 ? `${lv}레벨 · 힘 ${core.korNum(core.power(d, lv, S.seeds))}` : (unlocked ? '아직 고용 전' : '');
    r.btn.disabled = !can;
    if (!unlocked) r.btn.innerHTML = `스테이지 ${d.unlock}에서<br>만나요`;
    else r.btn.innerHTML = `${verb}${showK > 1 ? ' ' + showK + '번' : ''}<small>채소 ${core.korNum(cost)}</small>`;
    r.btn.setAttribute('aria-label', unlocked ? `${d.name} ${verb}, 채소 ${core.korNum(cost)}` : `${d.name}, 스테이지 ${d.unlock}에서 만나요`);
    if (r.drawnLv !== (unlocked ? 1 : 0)) {
      r.drawnLv = unlocked ? 1 : 0;
      const c = r.pc.getContext('2d'); c.clearRect(0, 0, 128, 128);
      c.save(); c.scale(2, 2); drawDefender(c, d.id, 32, 40, 0.68, 0, unlocked ? 1 : 0.3); c.restore();
    }
  }
}
function setBulk(v) {
  S.bulk = v;
  document.querySelectorAll('.bulk button').forEach(b => b.classList.toggle('on', String(v) === b.dataset.bulk));
  refreshList(true);
}
document.querySelectorAll('.bulk button').forEach(b => b.addEventListener('click', () => {
  const v = b.dataset.bulk === 'max' ? 'max' : Number(b.dataset.bulk); setBulk(v); save();
}));

// ── 토스트 ──
let toastTimer = 0;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── 팝업 (한 번에 하나, 열려 있는 동안 전투 멈춤) ──
const popQueue = []; let popOpen = false;
function popup(html, buttons) { popQueue.push({ html, buttons }); if (!popOpen) nextPop(); }
function nextPop() {
  const p = popQueue.shift(); const root = $('popRoot');
  if (!p) { popOpen = false; root.innerHTML = ''; return; }
  popOpen = true;
  root.innerHTML = `<div class="dim"><div class="pop" role="dialog" aria-modal="true">${p.html}<div class="btns"></div></div></div>`;
  const box = root.querySelector('.btns');
  for (const b of p.buttons) {
    const el = document.createElement('button'); el.className = 'btn' + (b.sub ? ' sub' : ''); el.textContent = b.label;
    el.addEventListener('click', () => { if (b.onClick) b.onClick(); nextPop(); });
    box.append(el);
  }
  box.querySelector('button')?.focus();
}
function showHelp() {
  popup(`<h2>텃밭을 지켜 주세요</h2><ul>
    <li>동물들이 숲에서 텃밭으로 내려와요.</li>
    <li>수비대가 알아서 쫓아내고, 쫓아낸 동물은 채소를 남겨요.</li>
    <li>채소로 수비대를 강화하면 더 멀리 가요.</li>
    <li>화면을 누르면 '훠이!' 하고 함께 쫓을 수 있어요. 꾹 누르고 있어도 돼요.</li>
    <li>울타리가 무너지면 한 단계 뒤에서 다시 힘을 길러요.</li></ul>`,
  [{ label: '알겠어요' }]);
}
$('btnHelp').addEventListener('click', showHelp);

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}시간${m ? ' ' + m + '분' : ''}` : `${Math.max(1, m)}분`;
}
function checkAway() {
  if (!S.savedAt) return;
  const sec = Math.max(0, (Date.now() - S.savedAt) / 1000);
  const amt = core.awayHarvest(S.stage, sec, S.seeds);
  if (amt < 1) return;
  const capped = sec > core.F.AWAY_MAX_SEC;
  popup(`<h2>다녀오셨어요?</h2>
    <p>${fmtDuration(Math.min(sec, core.F.AWAY_MAX_SEC))} 동안 수비대가 텃밭을 지켰어요${capped ? '<br>(창고는 8시간까지 채워져요)' : ''}</p>
    <div class="big"><i class="leaf"></i>+${core.korNum(amt)}</div>`,
  [{ label: '받기', onClick: () => { S.crops += amt; cropsDirty = true; save(); toast(`채소 ${core.korNum(amt)}을 받았어요`); } }]);
}

// ── 입력: 훠이 (탭, 꾹 누르면 반복) ──
let hold = null;
function pointerPos(ev) { const r = cv.getBoundingClientRect(); return toField(ev.clientX - r.left, ev.clientY - r.top); }
cv.addEventListener('pointerdown', ev => {
  if (popOpen) return;
  ev.preventDefault(); cv.setPointerCapture?.(ev.pointerId);
  const p = pointerPos(ev); B.shoo(p.x, p.y);
  hold = { id: ev.pointerId, p, t: 0 };
});
cv.addEventListener('pointermove', ev => { if (hold && ev.pointerId === hold.id) hold.p = pointerPos(ev); });
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) cv.addEventListener(t, ev => { if (hold && ev.pointerId === hold.id) hold = null; });
const HOLD_REPEAT = 0.22;

// ── 메인 루프 ──
let last = now(), saveT = 0, listT = 0;
function frame() {
  const t = now(); let dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (popOpen) dt = 0;
  if (dt > 0) {
    B.step(dt);
    if (hold) { hold.t += dt; if (hold.t >= HOLD_REPEAT) { hold.t = 0; B.shoo(hold.p.x, hold.p.y); } }
    handleEvents();
    if (B.state !== 'running' && nextStartAt && t >= nextStartAt) { nextStartAt = 0; B.start(S.stage); refreshFence(); }
    for (const f of fx.floats) f.t += dt; fx.floats = fx.floats.filter(f => f.t < f.life);
    for (const r of fx.rings) r.t += dt; fx.rings = fx.rings.filter(r => r.t < r.life);
    if (fx.banner) { fx.banner.t += dt; if (fx.banner.t >= fx.banner.life) fx.banner = null; }
    if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt);
    for (const k in fx.barks) fx.barks[k] = Math.max(0, fx.barks[k] - dt * 4);
    for (const k in fx.swing) fx.swing[k] = Math.max(0, fx.swing[k] - dt * 5);
    saveT += dt; if (saveT >= CFG.autosaveSec) { saveT = 0; save(); }
  }
  if (cropsDirty) refreshCrops();
  listT += 1 / 60; if (listT > 0.2) { listT = 0; refreshList(false); }
  render(dt);
  requestAnimationFrame(frame);
}

// ── 저장 시점: 화면이 가려질 때 바로 ──
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
  else { checkAway(); last = now(); }
});
window.addEventListener('pagehide', save);

// ── 시작 ──
function boot() {
  resize(); buildList(); setBulk(S.bulk); refreshHud(); refreshCrops();
  if (firstVisit) {
    popup(`<h2>동물들이 텃밭을 노려요!</h2><p>수비대와 함께 텃밭을 지켜 주세요.<br>쫓아낸 동물은 채소를 남기고 가요.</p>`,
      [{ label: '지키러 가기' }]);
  } else checkAway();
  B.start(S.stage);
  save();
  requestAnimationFrame(frame);
}
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(boot, boot);
window.__farm = { S, B, core, CFG };   // 개발용 (콘솔 확인)
