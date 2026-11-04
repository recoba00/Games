// node --test tests/game-core.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/game-core.js');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`);

function runStage(levels, stage, maxSec = 300, shooEvery = 0) {
  const B = core.createBattle({ levels, seeds: 0, boost: 1 });
  B.start(stage);
  const ev = []; let t = 0, nextShoo = shooEvery;
  while (B.state === 'running' && t < maxSec) {
    B.step(1 / 30); t += 1 / 30;
    if (shooEvery && t >= nextShoo) { nextShoo += shooEvery; const a = B.animals.find(x => !x.fleeing); if (a) B.shoo(a.x, a.y); }
    ev.push(...B.drain());
  }
  return { B, ev, t };
}

test('formulas match the design doc', () => {
  near(core.fear(1), 10); near(core.fear(2), 11.5); near(core.fear(10), 10 * 1.15 ** 9 * 8);
  near(core.reward(1), 2); near(core.reward(10), 2 * 1.12 ** 9 * 10);
  assert.equal(core.isBoss(10), true); assert.equal(core.isBoss(9), false); assert.equal(core.isBoss(0), false);
  near(core.fear(10) / core.fear(9), 9.2, 1e-3);
});

test('bonus levels double power at 25/50/100/200', () => {
  const d = core.DEF_BY_ID.scarecrow;
  near(core.power(d, 24), 5 * 24); near(core.power(d, 25), 5 * 25 * 2); near(core.power(d, 50), 5 * 50 * 4);
  near(core.power(d, 200), 5 * 200 * 16);
});

test('bulk cost equals the sum of single upgrades and maxAffordable never overspends', () => {
  const d = core.DEF_BY_ID.jindo;
  let sum = 0; for (let i = 0; i < 10; i++) sum += core.upgradeCost(d, 3 + i);
  near(core.bulkCost(d, 3, 10), sum, 1e-9);
  for (const crops of [0, 49, 50, 106, 1234, 98765.4]) {
    const k = core.maxAffordable(d, 0, crops);
    assert.ok(core.bulkCost(d, 0, k) <= crops + 1e-9);
    assert.ok(core.bulkCost(d, 0, k + 1) > crops + 1e-9);
  }
});

test('levelUp spends crops, respects unlock stage and supports max', () => {
  const s = core.initSave({ crops: 1000 });
  assert.equal(s.levels.scarecrow, 1); assert.equal(s.levels.jindo, 0);
  assert.equal(core.levelUp(s, 'jindo', 1), 0, 'locked until stage 3');
  s.maxStage = 3;
  assert.equal(core.levelUp(s, 'jindo', 1), 1); near(s.crops, 950); assert.equal(s.levels.jindo, 1);
  const before = s.crops, n = core.levelUp(s, 'scarecrow', 'max');
  assert.ok(n > 0); near(before - s.crops, core.bulkCost(core.DEF_BY_ID.scarecrow, 1, n), 1e-9);
  assert.equal(core.levelUp(s, 'nope', 1), 0);
  assert.equal(core.levelUp(core.initSave({ crops: 5 }), 'scarecrow', 10), 0, 'cannot afford');
});

test('initSave repairs broken data', () => {
  const s = core.initSave({ crops: -5, stage: 0, maxStage: 'x', levels: { scarecrow: -1, jindo: 4.7 }, bulk: 7 });
  assert.equal(s.crops, 0); assert.equal(s.stage, 1); assert.equal(s.maxStage, 1);
  assert.deepEqual(s.levels, { scarecrow: 1, jindo: 4 }); assert.equal(s.bulk, 1);
});

test('korean number format', () => {
  assert.equal(core.korNum(0), '0'); assert.equal(core.korNum(9999), '9,999');
  assert.equal(core.korNum(12345), '1.2만'); assert.equal(core.korNum(3450000), '345만');
  assert.equal(core.korNum(12345678), '1,234만'); assert.equal(core.korNum(1.26e8), '1.2억');
  assert.equal(core.korNum(3.4e12), '3.4조'); assert.equal(core.korNum(NaN), '0');
});

test('away harvest: none under 60s, capped at 8 hours, uses last cleared stage', () => {
  assert.equal(core.awayHarvest(5, 30), 0);
  const perSec = core.reward(4) * 10 / 30 * 0.5;
  near(core.awayHarvest(5, 600), perSec * 600);
  near(core.awayHarvest(5, 24 * 3600), perSec * 8 * 3600);
  near(core.awayHarvest(11, 600), core.reward(9) * 10 / 30 * 0.5 * 600, 1e-9);   // 직전이 보스면 그 앞 스테이지 기준
  assert.equal(core.awayHarvest(1, -100), 0);
});

test('stage 1 is cleared by the starting scarecrow alone and pays 10 animals', () => {
  const { B, ev } = runStage({ scarecrow: 1, jindo: 0 }, 1);
  assert.equal(B.state, 'cleared');
  const scared = ev.filter(e => e.type === 'scared');
  assert.equal(scared.length, 10);
  near(scared.reduce((s, e) => s + e.reward, 0), 20);
  assert.ok(ev.some(e => e.type === 'stage' && e.stage === 1));
});

test('a weak team loses the fence on a hard stage and remaining animals leave without paying', () => {
  const { B, ev } = runStage({ scarecrow: 1, jindo: 0 }, 25);
  assert.equal(B.state, 'failed');
  assert.ok(ev.some(e => e.type === 'failed' && e.stage === 25));
  assert.ok(B.fenceHp <= 0);
});

test('boss wave = 6 escorts + 1 boss, and the boss pays 10x', () => {
  const { B, ev } = runStage({ scarecrow: 60, jindo: 60 }, 10);
  assert.equal(B.state, 'cleared');
  const scared = ev.filter(e => e.type === 'scared');
  assert.equal(scared.length, 7);
  const boss = scared.filter(e => e.boss);
  assert.equal(boss.length, 1); near(boss[0].reward, core.reward(10));
});

test('shoo hits only an animal near the tap and helps clear faster', () => {
  const B = core.createBattle({ levels: { scarecrow: 1, jindo: 0 } });
  B.start(1);
  for (let i = 0; i < 40; i++) B.step(1 / 30);
  const a = B.animals[0];
  assert.equal(B.shoo(a.x + 300, a.y), false, 'far tap misses');
  assert.equal(B.shoo(a.x, a.y), true); assert.ok(a.fear > 0);
  const lazy = runStage({ scarecrow: 3, jindo: 0 }, 8), busy = runStage({ scarecrow: 3, jindo: 0 }, 8, 300, 0.3);
  const lazyHits = lazy.ev.filter(e => e.type === 'fence').length, busyHits = busy.ev.filter(e => e.type === 'fence').length;
  assert.ok(busyHits <= lazyHits, `tapping should not make it worse (${busyHits} vs ${lazyHits})`);
});

test('same stage spawns the same animals (deterministic)', () => {
  const kinds = () => { const B = core.createBattle({ levels: { scarecrow: 1 } }); B.start(7); const out = []; for (let i = 0; i < 900; i++) { B.step(1 / 30); for (const a of B.animals) if (!out.includes(a.id + a.kind)) out.push(a.id + a.kind); } return out.join(); };
  assert.equal(kinds(), kinds());
});
