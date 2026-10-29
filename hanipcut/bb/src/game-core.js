/* Shared game rules. No DOM, platform API, or external dependencies. */
(function (root) {
  'use strict';
  const ITEMS = Object.freeze({
    helper: { name: '도우미', icon: '✦', price: 30, desc: '같은 면적으로 나누는 실선 가이드. 이번 판 성공 또는 실패까지 유지돼요.' },
    stopwatch: { name: '스탑워치', icon: '◷', price: 20, desc: '현재 단계의 시간을 멈춰요. 다음 단계나 재도전에는 해제돼요.' },
    magnifier: { name: '돋보기', icon: '⌕', price: 30, desc: '선을 그리는 동안 조각의 면적 %를 보여줘요. 이번 판 성공 또는 실패까지 유지돼요.' },
  });
  const natural = (n, fallback) => Number.isSafeInteger(n) && n >= 0 ? n : fallback;
  function initWallet(s) {
    s.coins = natural(s.coins, 50);
    delete s.hearts; delete s.heartAt;
    const old = s.items && typeof s.items === 'object' ? s.items : {};
    s.items = Object.fromEntries(Object.keys(ITEMS).map(k => [k, natural(old[k], 1)]));
    return s;
  }
  function buy(s, key) {
    const item = Object.hasOwn(ITEMS, key) ? ITEMS[key] : null;
    const price = item && item.price;
    if (!price || s.coins < price) return false;
    s.coins -= price;
    s.items[key]++;
    return true;
  }
  function consume(s, key) {
    if (!Object.hasOwn(ITEMS, key) || !s.items || !(s.items[key] > 0)) return false;
    s.items[key]--; return true;
  }
  const stageCount = round => round > 0 && round % 3 === 0 ? 4 : 3;

  // Connect endpoints through transparent background only. No virtual connector
  // crosses any food pixel, including holes and concave/disconnected artwork.
  const extensionCache = new WeakMap();
  function outsideRoute(food, point) {
    const { mw:w, mh:h, mask } = food, x = Math.floor(point.x), y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= w || y >= h || mask[y*w+x]) return [];
    const parent = new Int32Array(w*h).fill(-1), queue = new Int32Array(w*h);
    const start = y*w+x; parent[start] = start; queue[0] = start; let head = 0, tail = 1, end = -1;
    while (head < tail) {
      const i = queue[head++], ix = i%w, iy = (i/w)|0;
      if (ix === 0 || iy === 0 || ix === w-1 || iy === h-1) { end = i; break; }
      for (const j of [i-1,i+1,i-w,i+w]) if (parent[j] === -1 && !mask[j]) { parent[j] = i; queue[tail++] = j; }
    }
    if (end < 0) return [];
    const route = []; let i = end;
    while (true) { route.push({ x:i%w+0.5, y:((i/w)|0)+0.5 }); if (i === start) break; i = parent[i]; }
    route.reverse(); const p = route[route.length-1];
    route.push({ x:p.x < 1 ? -1 : p.x > w-1 ? w+1 : p.x, y:p.y < 1 ? -1 : p.y > h-1 ? h+1 : p.y });
    return route;
  }
  function extended(food, path) {
    const cached = extensionCache.get(path);
    if (cached && cached.mask === food.mask) return cached.points;
    const points = path.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (points.length < 2) return [];
    const a = outsideRoute(food, points[0]), b = outsideRoute(food, points[points.length-1]);
    const result = [...a.reverse(), ...points, ...b];
    extensionCache.set(path, { mask:food.mask, points:result }); return result;
  }
  function split(food, paths, crumbRatio = 0.015) {
    const { mw:w, mh:h, mask } = food, n = w*h;
    const right = new Uint8Array(n), down = new Uint8Array(n);
    for (const path of paths) {
      const points = extended(food,path);
      for (let k=1;k<points.length;k++) {
        // Tiny translation makes crossings through pixel centers deterministic.
        const ax=points[k-1].x+1e-7, ay=points[k-1].y+2e-7;
        const bx=points[k].x+1e-7, by=points[k].y+2e-7, dx=bx-ax, dy=by-ay;
        if (Math.abs(dy)>1e-10) for (let y=Math.max(0,Math.ceil(Math.min(ay,by)-0.5)); y<=Math.min(h-1,Math.floor(Math.max(ay,by)-0.5));y++) {
          const t=(y+0.5-ay)/dy; if (t<0 || t>=1) continue;
          const x=Math.floor(ax+t*dx-0.5); if(x>=0 && x<w-1) right[y*w+x]=1;
        }
        if (Math.abs(dx)>1e-10) for (let x=Math.max(0,Math.ceil(Math.min(ax,bx)-0.5));x<=Math.min(w-1,Math.floor(Math.max(ax,bx)-0.5));x++) {
          const t=(x+0.5-ax)/dx; if(t<0 || t>=1) continue;
          const y=Math.floor(ay+t*dy-0.5); if(y>=0 && y<h-1) down[y*w+x]=1;
        }
      }
    }
    const labels = new Int32Array(n).fill(-1), queue = new Int32Array(n), comps=[]; let id=0,total=0;
    for(let start=0;start<n;start++) {
      if(labels[start]>=0) continue;
      let head=0,tail=1,area=0,sx=0,sy=0; queue[0]=start; labels[start]=id;
      while(head<tail) {
        const i=queue[head++], x=i%w,y=(i/w)|0;
        if(mask[i]) {area++;sx+=x+0.5;sy+=y+0.5;}
        const add=j=>{if(labels[j]<0){labels[j]=id;queue[tail++]=j;}};
        if(x>0&&!right[i-1])add(i-1); if(x<w-1&&!right[i])add(i+1);
        if(y>0&&!down[i-w])add(i-w); if(y<h-1&&!down[i])add(i+w);
      }
      if(area) {comps.push({sig:id,area,cx:sx/area,cy:sy/area});total+=area;} id++;
    }
    const pieces=comps.filter(p=>total && p.area/total>=crumbRatio).sort((a,b)=>b.area-a.area);
    return { labels,comps,pieces,total };
  }
  function guides(food, count) {
    const columns = new Int32Array(food.mw); let total=0;
    for(let y=0;y<food.mh;y++)for(let x=0;x<food.mw;x++)if(food.mask[y*food.mw+x]){columns[x]++;total++;}
    const paths=[];let sum=0,next=1;
    for(let x=0;x<food.mw && next<count;x++) {sum+=columns[x];while(next<count && sum>=total*next/count){paths.push([{x:x+1,y:-16},{x:x+1,y:food.mh+16}]);next++;}}
    return paths;
  }
  const api={ ITEMS,stageCount,initWallet,buy,consume,split,guides };
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GameCore=api;
})(globalThis);
