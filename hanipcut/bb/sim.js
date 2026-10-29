const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('file://' + __dirname + '/dist/index.html'); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const { Food, CFG, computePieces, scoreOf } = __bb; CFG.stages[2].K = 1.0; CFG.stages[2].pass = 80;
    const col = new Array(Food.mw).fill(0); for (let y = 0; y < Food.mh; y++) for (let x = 0; x < Food.mw; x++) if (Food.mask[y * Food.mw + x]) col[x]++;
    const q = (n) => { const xs = []; let acc = 0, k = 1; for (let x = 0; x < Food.mw; x++) { acc += col[x]; if (acc >= Food.total * k / n && xs.length < n - 1) { xs.push(x + 1); k++; } } return xs; };
    const g = () => { let u = 0, v = 0; while (!u) u = Math.random(); v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const out = {};
    for (const sigma of [4, 7, 10]) { out['σ' + sigma + 'px'] = CFG.stages.map((st, si) => {
      const ideal = q(st.pieces); let pass = 0, sum = 0; const N = 300;
      for (let i = 0; i < N; i++) {
        const lines = ideal.map(x => { const a = g() * 3 * Math.PI / 180, cx=x+g()*sigma;
          return [{x:cx-Math.tan(a)*(Food.mh/2+20),y:-20},{x:cx+Math.tan(a)*(Food.mh/2+20),y:Food.mh+20}]; });
        const t = si === 2 ? 0.45 : 0.5; const sc = scoreOf(st, computePieces(lines), t); sum += sc.score; if (sc.ok) pass++;
      }
      return `${si + 1}단계 통과 ${Math.round(pass / N * 100)}% 평균 ${(sum / N).toFixed(1)}`; }); }
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); await b.close();
})();
