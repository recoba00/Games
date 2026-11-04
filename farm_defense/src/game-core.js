/* 텃밭 지키기 — 규칙·공식·전투 엔진. DOM, 플랫폼 API, 외부 의존성 없음 (node 테스트·시뮬레이션에서 그대로 사용). */
(function (root) {
  'use strict';

  // ── 전장 크기 (논리 좌표, 화면에서는 비율 맞춰 확대) ──
  // 휴대폰 세로 화면에서 위 숲(등장)부터 아래 텃밭까지 한 화면에 들어오는 높이
  const FIELD = Object.freeze({ W: 390, H: 420, SPAWN_Y: -24, DEF_Y: 296, FENCE_Y: 340 });

  // ── 공식 (기획서 '전투·재화 설계') ──
  const F = Object.freeze({
    FEAR_BASE: 10, FEAR_GROWTH: 1.15, BOSS_FEAR: 8,
    REWARD_BASE: 2, REWARD_GROWTH: 1.12, BOSS_REWARD: 10,
    COST_GROWTH: 1.12,
    BONUS_LEVELS: [25, 50, 100, 200],     // 달성 보너스: 레벨마다 힘 ×2
    SEED_BONUS: 0.02,                    // 황금 씨앗 1개당 +2% (M2)
    SHOO_RATIO: 0.2,                     // 훠이 1번 = 수비대 힘 합의 20%
    SHOO_MIN: 2,
    SHOO_RADIUS: 60,
    ANIMALS_PER_WAVE: 10, BOSS_ESCORTS: 6, SPAWN_INTERVAL: 2.5,
    FENCE_MAX: 10,
    WAVE_SECONDS: 30,                    // 다녀온 사이 수확 계산용 평균 웨이브 길이
    AWAY_EFFICIENCY: 0.5, AWAY_MAX_SEC: 8 * 3600, AWAY_MIN_SEC: 60,
  });

  // ── 수비대 (M1: 2종) ──
  const DEFENDERS = Object.freeze([
    { id: 'scarecrow', name: '허수아비', role: '한 마리씩 지푸라기를 던져 쫓아요', atk: 5, cost: 10, unlock: 1, interval: 1.0, range: 270, ranged: true, x: 120, startLv: 1 },
    { id: 'jindo', name: '진돗개', role: '가까이 온 동물을 짖어서 쫓아요', atk: 12, cost: 50, unlock: 3, interval: 0.7, range: 125, ranged: false, x: 270, startLv: 0 },
  ]);
  const DEF_BY_ID = Object.freeze(Object.fromEntries(DEFENDERS.map(d => [d.id, d])));

  // ── 동물 (M1: 2종 + 보스) ──
  const ANIMALS = Object.freeze({
    sparrow: { name: '참새', speed: 21, r: 15, dmg: 1 },
    rabbit: { name: '토끼', speed: 15, r: 18, dmg: 1 },
    boar: { name: '멧돼지 대장', speed: 12, r: 32, dmg: 5, boss: true },
  });

  const isBoss = s => s > 0 && s % 10 === 0;
  const fear = s => F.FEAR_BASE * Math.pow(F.FEAR_GROWTH, s - 1) * (isBoss(s) ? F.BOSS_FEAR : 1);
  const reward = (s, seeds = 0) => F.REWARD_BASE * Math.pow(F.REWARD_GROWTH, s - 1) * (isBoss(s) ? F.BOSS_REWARD : 1) * (1 + F.SEED_BONUS * seeds);

  // lv → lv+1 비용. lv 0 → 1 은 고용 비용(= base)
  const upgradeCost = (def, lv) => def.cost * Math.pow(F.COST_GROWTH, lv);
  // lv 에서 k 번 연속 강화 총액 (등비수열 합)
  const bulkCost = (def, lv, k) => k <= 0 ? 0 : def.cost * Math.pow(F.COST_GROWTH, lv) * (Math.pow(F.COST_GROWTH, k) - 1) / (F.COST_GROWTH - 1);
  function maxAffordable(def, lv, crops) {
    const first = upgradeCost(def, lv);
    if (!(crops >= first)) return 0;
    let k = Math.floor(Math.log(crops * (F.COST_GROWTH - 1) / first + 1) / Math.log(F.COST_GROWTH));
    while (k > 0 && bulkCost(def, lv, k) > crops + 1e-9) k--;   // 부동소수 오차 보정 (양쪽)
    while (bulkCost(def, lv, k + 1) <= crops + 1e-9) k++;
    return k;
  }
  function bonusMult(lv) { let m = 1; for (const step of F.BONUS_LEVELS) if (lv >= step) m *= 2; return m; }
  const power = (def, lv, seeds = 0, boost = 1) => def.atk * lv * bonusMult(lv) * (1 + F.SEED_BONUS * seeds) * boost;
  function totalPower(levels, seeds = 0, boost = 1) {
    let t = 0; for (const d of DEFENDERS) t += power(d, levels[d.id] || 0, seeds, boost); return t;
  }
  const shooValue = (levels, seeds = 0, boost = 1) => Math.max(F.SHOO_MIN, F.SHOO_RATIO * totalPower(levels, seeds, boost));

  // 다녀온 사이 수확: 마지막으로 막아 낸 스테이지(현재 - 1) 수입의 50%, 최대 8시간
  function awayHarvest(stage, seconds, seeds = 0) {
    if (!(seconds >= F.AWAY_MIN_SEC)) return 0;
    const s = Math.max(1, stage - 1);
    const s2 = isBoss(s) ? s - 1 : s;   // 보스 스테이지는 앞 스테이지 기준
    const perSec = reward(s2, seeds) * F.ANIMALS_PER_WAVE / F.WAVE_SECONDS;
    return perSec * Math.min(seconds, F.AWAY_MAX_SEC) * F.AWAY_EFFICIENCY;
  }

  // 한국식 단위: 9,999 / 1.2만 / 3,450만 / 1.2억 / 3.4조
  const UNITS = [[1e16, '경'], [1e12, '조'], [1e8, '억'], [1e4, '만']];
  function korNum(v) {
    if (!isFinite(v)) return '0';
    v = Math.floor(v);
    for (const [u, name] of UNITS) {
      if (v >= u) {
        const q = v / u;
        if (q >= 1000) return Math.floor(q).toLocaleString('ko-KR') + name;
        return (q >= 100 ? Math.floor(q) : Math.floor(q * 10) / 10) + name;
      }
    }
    return v.toLocaleString('ko-KR');
  }

  // ── 저장 데이터 기본값/정리 ──
  const natural = (n, fb) => Number.isFinite(n) && n >= 0 ? n : fb;
  function initSave(s) {
    s = s && typeof s === 'object' ? s : {};
    s.crops = natural(s.crops, 0);
    s.stage = Math.max(1, Math.floor(natural(s.stage, 1)));
    s.maxStage = Math.max(s.stage, Math.floor(natural(s.maxStage, 1)));
    s.seeds = Math.floor(natural(s.seeds, 0));
    const old = s.levels && typeof s.levels === 'object' ? s.levels : {};
    s.levels = Object.fromEntries(DEFENDERS.map(d => [d.id, Math.max(d.startLv, Math.floor(natural(old[d.id], d.startLv)))]));
    s.bulk = [1, 10, 'max'].includes(s.bulk) ? s.bulk : 1;
    s.savedAt = natural(s.savedAt, 0);
    return s;
  }
  // 강화(고용). k 번 또는 'max'. 성공한 횟수 반환
  function levelUp(s, id, k) {
    const def = DEF_BY_ID[id]; if (!def) return 0;
    if (s.maxStage < def.unlock) return 0;
    const lv = s.levels[id] || 0;
    const n = k === 'max' ? maxAffordable(def, lv, s.crops) : (bulkCost(def, lv, k) <= s.crops ? k : 0);
    if (n <= 0) return 0;
    s.crops -= bulkCost(def, lv, n);
    if (s.crops < 0) s.crops = 0;
    s.levels[id] = lv + n;
    return n;
  }

  // ── 결정적 난수 (스테이지마다 같은 동물 순서 → 테스트 가능) ──
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ── 전투 엔진 ──
  // ctx: { levels, seeds, boost } 를 매 프레임 읽음 (강화 즉시 반영)
  function createBattle(ctx) {
    const B = {
      stage: 1, state: 'idle', fenceHp: F.FENCE_MAX,
      animals: [], shots: [], events: [], t: 0,
      _left: 0, _spawnT: 0, _rand: null, _uid: 0, _cd: {},
    };
    B.start = function (stage) {
      B.stage = stage; B.state = 'running'; B.fenceHp = F.FENCE_MAX;
      B.animals = []; B.shots = []; B._cd = {};
      B._rand = rng(stage * 9973 + 17);
      B._left = isBoss(stage) ? 1 + F.BOSS_ESCORTS : F.ANIMALS_PER_WAVE;
      B._bossSpawned = false;
      B._spawnT = 0.6;
      B.events.push({ type: 'stage', stage, boss: isBoss(stage) });
    };
    // 보스 웨이브: 졸개 3마리 → 멧돼지 대장 → 졸개 3마리. 졸개는 앞 스테이지 세기
    function spawn() {
      const bossWave = isBoss(B.stage), total = 1 + F.BOSS_ESCORTS;
      const boss = bossWave && !B._bossSpawned && (total - B._left) === Math.floor(F.BOSS_ESCORTS / 2);
      if (boss) B._bossSpawned = true;
      const kind = boss ? 'boar' : (B._rand() < 0.5 ? 'sparrow' : 'rabbit');
      const s = bossWave && !boss ? B.stage - 1 : B.stage;
      const a = ANIMALS[kind], fm = fear(s);
      const x = boss ? FIELD.W / 2 : 40 + B._rand() * (FIELD.W - 80);
      B.animals.push({ id: ++B._uid, kind, x, y: FIELD.SPAWN_Y, r: a.r, speed: a.speed * (0.9 + B._rand() * 0.2), dmg: a.dmg, boss: !!a.boss,
        fear: 0, fearMax: fm, reward: reward(s, ctx.seeds || 0), fleeing: 0, gone: false, hitT: 0, phase: B._rand() * 6.28 });
      B._left--;
    }
    function scare(a, amt, by) {
      if (a.gone || a.fleeing) return;
      a.fear += amt; a.hitT = 0.18;
      if (a.fear >= a.fearMax) {
        a.fleeing = 0.0001;
        B.events.push({ type: 'scared', x: a.x, y: a.y, reward: a.reward, boss: a.boss, kind: a.kind, by });
      }
    }
    B.scare = scare;
    const active = () => B.animals.filter(a => !a.gone && !a.fleeing);
    B.activeCount = () => active().length;
    function nearest(x, y, range) {
      let best = null, bd = range;
      for (const a of B.animals) {
        if (a.gone || a.fleeing || a.y < -10) continue;
        const d = Math.hypot(a.x - x, a.y - y);
        if (d < bd) { bd = d; best = a; }
      }
      return best;
    }
    // 훠이: 탭한 곳 근처의 가장 가까운 동물 (없으면 화면 전체에서 가장 앞선 동물 대신 아무것도 안 함)
    B.shoo = function (x, y) {
      if (B.state !== 'running') return false;
      const a = nearest(x, y, F.SHOO_RADIUS + 20);
      B.events.push({ type: 'shoo', x, y, hit: !!a });
      if (a) scare(a, shooValue(ctx.levels, ctx.seeds || 0, ctx.boost || 1), 'shoo');
      return !!a;
    };
    B.step = function (dt) {
      B.t += dt;
      // 도망 중/연출 갱신은 상태와 무관하게 진행
      for (const a of B.animals) {
        a.phase += dt * (a.kind === 'sparrow' ? 14 : 7);
        if (a.hitT > 0) a.hitT -= dt;
        if (a.fleeing) { a.fleeing += dt; a.y -= 160 * dt; if (a.fleeing > 0.9) a.gone = true; }
      }
      for (const s of B.shots) {
        const t = s.target, tx = t.x, ty = t.y, d = Math.hypot(tx - s.x, ty - s.y), mv = 560 * dt;
        if (d <= mv || t.gone || t.fleeing) { s.done = true; if (!t.gone && !t.fleeing) scare(t, s.amt, s.by); }
        else { s.x += (tx - s.x) / d * mv; s.y += (ty - s.y) / d * mv; }
      }
      B.shots = B.shots.filter(s => !s.done);
      if (B.state !== 'running') { B.animals = B.animals.filter(a => !a.gone); return; }

      if (B._left > 0) { B._spawnT -= dt; if (B._spawnT <= 0) { spawn(); B._spawnT = F.SPAWN_INTERVAL; } }
      for (const a of B.animals) {
        if (a.gone || a.fleeing) continue;
        a.y += a.speed * dt;
        if (a.y >= FIELD.FENCE_Y - a.r * 0.4) {
          a.gone = true; B.fenceHp -= a.dmg;
          B.events.push({ type: 'fence', x: a.x, y: FIELD.FENCE_Y, dmg: a.dmg, hp: Math.max(0, B.fenceHp) });
          if (B.fenceHp <= 0) {
            B.state = 'failed';
            for (const b of B.animals) if (!b.gone && !b.fleeing) b.fleeing = 0.0001;   // 남은 동물은 숲으로 돌아감 (보상 없음)
            B.events.push({ type: 'failed', stage: B.stage });
            break;
          }
        }
      }
      if (B.state === 'running') {
        for (const d of DEFENDERS) {
          const lv = ctx.levels[d.id] || 0; if (lv <= 0) continue;
          B._cd[d.id] = (B._cd[d.id] || 0) - dt;
          if (B._cd[d.id] > 0) continue;
          const tgt = nearest(d.x, FIELD.DEF_Y, d.range);
          if (!tgt) { B._cd[d.id] = 0; continue; }
          B._cd[d.id] = d.interval;
          const amt = power(d, lv, ctx.seeds || 0, ctx.boost || 1);
          if (d.ranged) B.shots.push({ x: d.x, y: FIELD.DEF_Y - 40, target: tgt, amt, by: d.id });
          else scare(tgt, amt, d.id);
          B.events.push({ type: 'attack', by: d.id, x: d.x, tx: tgt.x, ty: tgt.y });
        }
        if (B._left <= 0 && active().length === 0) { B.state = 'cleared'; B.events.push({ type: 'cleared', stage: B.stage }); }
      }
      B.animals = B.animals.filter(a => !a.gone);
    };
    B.drain = function () { const e = B.events; B.events = []; return e; };
    return B;
  }

  const api = { FIELD, F, DEFENDERS, DEF_BY_ID, ANIMALS, isBoss, fear, reward, upgradeCost, bulkCost, maxAffordable,
    bonusMult, power, totalPower, shooValue, awayHarvest, korNum, initSave, levelUp, rng, createBattle };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameCore = api;
})(globalThis);
