const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/game-core.js');
const rect = (w = 100, h = 100) => ({ mw: w, mh: h, mask: new Uint8Array(w * h).fill(1), total: w * h });
const path = (...points) => points.map(([x, y]) => ({ x, y }));

test('bonus stage occurs only on rounds 3, 6, 9, 12 and resets on new run', () => {
  assert.deepEqual(Array.from({ length: 12 }, (_, i) => core.stageCount(i + 1)), [3,3,4,3,3,4,3,3,4,3,3,4]);
  assert.equal(core.stageCount(1), 3);
});
test('wallet initializes missing fields without changing existing points or valid inventory', () => {
  const s = { points: 123, coins: 7, items: { undo: 4 }, hearts: 2, heartAt: 100 };
  core.initWallet(s, 100);
  assert.equal(s.points, 123); assert.equal(s.coins, 7); assert.equal(s.items.undo, 4);
  assert.equal(s.items.helper, 1); assert.equal(s.hearts, 2);
});
test('heart recharge preserves partial interval and caps offline credit', () => {
  const s = {}; core.initWallet(s, 100);
  assert.equal(s.hearts, 5); assert.equal(s.coins, 50);
  core.consumeHeart(s, 100); assert.equal(s.hearts, 4);
  core.regenerateHearts(s, 100 + 25 * 60e3); assert.equal(s.hearts, 5);
  core.consumeHeart(s, 100 + 25 * 60e3);
  core.regenerateHearts(s, 100 + 30 * 60e3); assert.equal(s.hearts, 4);
  core.regenerateHearts(s, 100 + 45 * 60e3); assert.equal(s.hearts, 5);
});
test('purchase and consumption are atomic; insufficient coins or full hearts do not charge', () => {
  const s = {}; core.initWallet(s, 0);
  assert.equal(core.buy(s, 'heart', 0), false); assert.equal(s.coins, 50);
  assert.equal(core.buy(s, 'helper', 0), true); assert.equal(s.coins, 20); assert.equal(s.items.helper, 2);
  assert.equal(core.buy(s, 'magnifier', 0), false); assert.equal(s.coins, 20);
  assert.equal(core.buy(s, '__proto__', 0), false);
  assert.equal(core.consume(s, 'undo'), true); assert.equal(core.consume(s, 'undo'), false);
  core.rewardRound(s, true); assert.equal(s.coins, 50); assert.equal(s.points, undefined);
});
test('curved path uses its full shape instead of endpoint chord and conserves area', () => {
  const food = rect();
  const curved = core.split(food, [path([-2,20],[25,20],[25,70],[75,70],[75,20],[102,20])]);
  const straight = core.split(food, [path([-2,20],[102,20])]);
  assert.equal(curved.pieces.length, 2);
  assert.equal(curved.pieces.reduce((n,p) => n + p.area, 0), 10000);
  assert.notDeepEqual(curved.pieces.map(p => p.area), straight.pieces.map(p => p.area));
});
test('seven parallel cuts, crossing cuts, duplicates, internal strokes and closed loops', () => {
  const food = rect(140,100);
  const bands = Array.from({ length:6 }, (_,i) => path([20*(i+1),-2],[20*(i+1),102]));
  assert.equal(core.split(food,bands).pieces.length,7);
  assert.ok(core.split(food,bands).pieces.every(p => p.area === 2000));
  const v = path([70,-2],[70,102]), h = path([-2,50],[142,50]);
  assert.equal(core.split(food,[v,h]).pieces.length,4);
  assert.equal(core.split(food,[v,v]).pieces.length,2);
  assert.equal(core.split(food,[path([30,20],[100,80])]).pieces.length,1);
  const loop = path([30,20],[100,20],[100,80],[30,80],[30,20]);
  assert.equal(core.split(food,[loop]).pieces.length,2);
});
test('disconnected artwork stays grouped by cut region and transparent endpoints route outside', () => {
  const food = rect(); food.mask.fill(0);
  for (let y=10;y<90;y++) for(let x=10;x<90;x++) if (y<40 || y>=60) food.mask[y*100+x]=1;
  food.total = 4800;
  assert.equal(core.split(food,[]).pieces.length,1);
  const result = core.split(food,[path([50,5],[50,95])]);
  assert.equal(result.pieces.length,2);
  assert.deepEqual(result.pieces.map(p=>p.area),[2400,2400]);
  assert.equal(result.total,4800);
});
test('guide paths divide alpha area into requested equal bands', () => {
  const food = rect(140,100);
  const guides = core.guides(food,7);
  assert.equal(guides.length,6);
  const result = core.split(food,guides);
  assert.equal(result.pieces.length,7);
  assert.ok(result.pieces.every(p=>Math.abs(p.area-2000)<=100));
});
