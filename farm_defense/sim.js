// 밸런스 시뮬레이션 (개발용): node sim.js [분]
// 실제 전투 엔진(game-core.js)을 그대로 돌리고, 웨이브가 끝날 때마다 '힘 대비 가장 싼 강화'를 사는 사용자를 가정한다.
// 훠이(탭)는 쓰지 않는다 = 방치만 했을 때의 진행 속도.
const core = require('./src/game-core.js');
const minutes = Number(process.argv[2] || 60);
const s = core.initSave({});
const ctx = { levels: s.levels, seeds: 0, boost: 1 };
const B = core.createBattle(ctx);
const dt = 1 / 30;
let t = 0, fails = 0, lastPrint = -1, cleared = 0;
const marks = {};

function spend() {
  for (;;) {
    let best = null, bestScore = 0;
    for (const d of core.DEFENDERS) {
      if (s.maxStage < d.unlock) continue;
      const lv = s.levels[d.id], cost = core.upgradeCost(d, lv);
      if (cost > s.crops) continue;
      // 초당 힘 증가량 / 비용
      const gain = (core.power(d, lv + 1) - core.power(d, lv)) / d.interval;
      const score = gain / cost;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (!best) return;
    core.levelUp(s, best.id, 1);
  }
}

B.start(s.stage);
while (t < minutes * 60) {
  B.step(dt); t += dt;
  for (const e of B.drain()) {
    if (e.type === 'scared') s.crops += e.reward;
    if (e.type === 'cleared') {
      cleared++; s.stage++; s.maxStage = Math.max(s.maxStage, s.stage);
      if (!marks[s.stage] && [5, 10, 11, 20, 21, 30, 31, 40, 50].includes(s.stage)) marks[s.stage] = t;
      spend(); B.start(s.stage);
    }
    if (e.type === 'failed') { fails++; s.stage = Math.max(1, s.stage - 1); spend(); B.start(s.stage); }
  }
  const m = Math.floor(t / 60);
  if (m % 5 === 0 && m !== lastPrint) {
    lastPrint = m;
    const lv = core.DEFENDERS.map(d => `${d.name} ${s.levels[d.id]}`).join(', ');
    console.log(`${String(m).padStart(3)}분  스테이지 ${String(s.stage).padStart(3)} (최고 ${s.maxStage})  채소 ${core.korNum(s.crops).padStart(7)}  ${lv}  물러남 ${fails}`);
  }
}
console.log('\n처음 도달한 시각:');
for (const [st, sec] of Object.entries(marks)) console.log(`  스테이지 ${st}: ${(sec / 60).toFixed(1)}분`);
console.log(`막아 낸 웨이브 ${cleared}, 물러남 ${fails}`);
