"""Browser regression tests for rules, actual gestures, inventory and ad races."""
import functools
import http.server
from pathlib import Path
import os
import subprocess
import threading
import unittest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class GameplayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(['python', '-X', 'utf8', 'build.py'], cwd=ROOT, check=True,
                       env={**os.environ, 'PYTHONUTF8': '1'}, capture_output=True)
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / 'dist'))
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(channel='msedge')

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 390, 'height': 844})
        self.page = self.context.new_page(); self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' and m.text.startswith(('render ', 'update ')) else None)
        self.page.goto(f'http://127.0.0.1:{self.server.server_port}/')
        self.page.wait_for_function('!!window.__bb')
        self.page.evaluate("""() => {
          document.getElementById('intro')?.remove(); Pop.close();
          G.tut=false; S.tut=true; S.attShown=dayKey(); S.alarmAsk=2;
          G.stageNo=1; G.clears=0; G.runTotal=0; G.stage=0;
          S.coins=100; S.hearts=5; S.items={undo:3,helper:3,stopwatch:3,magnifier:3};
          G.effects={helper:false,magnifier:false}; G.adUsed=0; G.roundRewarded=false;
          G.food=FOODS[0]; Food.set(FOODS[0],null); startStage();
          G.state='cutting'; G.timerOn=false; G.paused=false;
          document.getElementById('cdim').classList.add('hidden'); refreshBoosters?.();
        }""")

    def tearDown(self):
        self.assertEqual(self.errors, [])
        self.context.close()

    def test_rule_data_and_bonus(self):
        self.assertEqual(self.page.evaluate('CFG.stages.slice(0,3).map(s=>s.time)'), [30,30,24])
        self.assertEqual(self.page.evaluate('CFG.adRetryPerGame'), 3)
        self.page.evaluate("G.stageNo=3; G.stage=3; startStage()")
        self.assertEqual(self.page.locator('#steps .step').count(), 4)
        self.assertIn('1/7', self.page.locator('#stageLabel').inner_text())
        self.assertEqual(self.page.evaluate('G.cutsLeft'), 6)

    def test_curved_pointer_preview_undo_and_confirm(self):
        self.page.evaluate("useBooster('magnifier'); G.timerOn=false")
        box = self.page.evaluate('({x:Food.ox(),y:Food.oy(),w:Food.w,h:Food.h,s:L.s,left:app.getBoundingClientRect().left})')
        points = [(box['x']-8,box['y']+box['h']*.4), (box['x']+box['w']*.3,box['y']+box['h']*.4),
                  (box['x']+box['w']*.5,box['y']+box['h']*.7), (box['x']+box['w']*.7,box['y']+box['h']*.4),
                  (box['x']+box['w']+8,box['y']+box['h']*.4)]
        def move(p): self.page.mouse.move(box['left']+p[0]*box['s'],p[1]*box['s'],steps=8)
        move(points[0]); self.page.mouse.down()
        for p in points[1:]: move(p)
        self.assertGreater(self.page.evaluate('G.dragPath.length'), 5)
        self.page.mouse.up()
        self.assertEqual(self.page.evaluate('G.lines.length'), 1)
        self.assertEqual(self.page.evaluate('G.state'), 'cutting')
        self.assertTrue(self.page.locator('#btnJudge').is_visible())
        self.assertIn('%', self.page.locator('#areaPreview').inner_text())
        before = self.page.evaluate('G.timeLeft')
        self.page.locator('[data-item="undo"]').click()
        self.assertEqual(self.page.evaluate('G.lines.length'), 0)
        self.assertEqual(self.page.evaluate('G.cutsLeft'), 1)
        self.assertLessEqual(self.page.evaluate('G.timeLeft'), before)

    def test_item_scope_and_no_duplicate_consumption(self):
        result = self.page.evaluate("""() => {
          useBooster('undo'); const undo=S.items.undo;
          useBooster('helper'); useBooster('helper'); useBooster('magnifier'); useBooster('stopwatch');
          G.timerOn=true; const before=G.timeLeft; update(.5);
          const frozen=G.timeLeft===before, helper=S.items.helper;
          G.stage=1; startStage();
          return {undo,helper,frozen,effects:G.effects,freeze:G.frozen};
        }""")
        self.assertEqual(result['undo'], 3); self.assertEqual(result['helper'], 2)
        self.assertTrue(result['frozen']); self.assertTrue(result['effects']['helper'])
        self.assertTrue(result['effects']['magnifier']); self.assertFalse(result['freeze'])
        self.page.evaluate("showFail({reason:'time',score:0})")
        self.assertEqual(self.page.evaluate('G.effects'), {'helper':False,'magnifier':False})

    def test_ads_only_done_counts_and_stale_completion_is_ignored(self):
        r = self.page.evaluate("""async () => {
          G.state='judging'; Platform.showRewardedAd=async ()=>'closed';
          await watchContinueAd({reason:'time'},()=>{}); const closed=G.adUsed;
          Platform.showRewardedAd=async ()=>'error'; await watchContinueAd({reason:'time'},()=>{}); const error=G.adUsed;
          Pop.close(); Platform.showRewardedAd=async ()=>'done';
          S.adCount=9999; await watchContinueAd({reason:'time'},()=>{}); const done=G.adUsed;
          G.state='judging'; let resolve; Platform.showRewardedAd=()=>new Promise(r=>resolve=r);
          const a=watchContinueAd({reason:'time'},()=>{}), b=watchContinueAd({reason:'time'},()=>{});
          goLobby(); resolve('done'); await Promise.all([a,b]);
          return {closed,error,done,after:G.adUsed,state:G.state};
        }""")
        self.assertEqual(r, {'closed':0,'error':0,'done':1,'after':1,'state':'lobby'})

    def test_three_ads_per_round_and_heart_retry_independently(self):
        r = self.page.evaluate("""async () => {
          Platform.showRewardedAd=async ()=>'done'; S.adCount=10000;
          for(let i=0;i<4;i++){G.state='failed';await watchContinueAd({reason:'time'},()=>{});}
          const ads=G.adUsed;
          showFail({reason:'time',score:0});const advertised=!!Pop.el.querySelector('[data-ad]');
          Pop.el.querySelector('[data-heart]').click();
          return {ads,advertised,hearts:S.hearts,state:G.state,adUsed:G.adUsed};
        }""")
        self.assertEqual(r, {'ads':3,'advertised':False,'hearts':4,'state':'countdown','adUsed':3})

    def test_pointer_cancel_multitouch_and_resize_discard_gesture(self):
        r = self.page.evaluate("""() => {
          const r=app.getBoundingClientRect(),x=r.left+180*L.s,y=L.foodCY*L.s;
          const send=(type,id,extra={})=>app.dispatchEvent(new PointerEvent(type,{pointerId:id,clientX:x,clientY:y,bubbles:true,isPrimary:true,...extra}));
          send('pointerdown',1);send('pointerdown',2,{isPrimary:false});const owner=G.pointerId;
          send('pointercancel',1);const cancelled=!G.dragging&&G.lines.length===0;
          send('pointerdown',3);fit();const resized=!G.dragging;
          send('pointerup',3);return {owner,cancelled,resized,lines:G.lines.length};
        }""")
        self.assertEqual(r, {'owner':1,'cancelled':True,'resized':True,'lines':0})

    def test_all_food_guides_and_real_fourth_stage_completion(self):
        results = self.page.evaluate("""async () => {
          const bad=[];
          for(const def of FOODS){
            const im=await FoodLoader.load(def);Food.set(def,im);
            for(const n of [2,3,5,7]){
              const res=computePieces(GameCore.guides(Food,n));
              if(res.pieces.length!==n||res.total!==Food.total)bad.push({id:def.id,n,count:res.pieces.length,total:res.total});
            }
          }
          return bad;
        }""")
        self.assertEqual(results, [])
        self.page.evaluate("""() => {
          G.food=FOODS[0];Food.set(FOODS[0],null);G.stageNo=3;G.stage=2;G.stageScores=[90,90];
          startStage();G.state='cutting';G.timerOn=false;useBooster('helper');useBooster('magnifier');
          for(const p of GameCore.guides(Food,5))doCut(p);confirmCuts();
        }""")
        self.page.wait_for_function("Pop.el?.querySelector('h3')?.textContent==='3단계 성공!'", timeout=12000)
        self.page.locator('[data-next]').click()
        self.assertEqual(self.page.evaluate('G.stage'), 3)
        self.assertTrue(self.page.evaluate('G.effects.helper'))
        self.page.evaluate("G.state='cutting';G.timerOn=false;document.getElementById('cdim').classList.add('hidden');refreshBoosters();refreshPreview()")
        (ROOT / 'tests/screenshots').mkdir(exist_ok=True)
        self.page.screenshot(path=str(ROOT / 'tests/screenshots/seven-piece-stage.png'))
        self.page.evaluate("for(const p of GameCore.guides(Food,7))doCut(p);confirmCuts()")
        self.page.wait_for_function("Pop.el?.querySelector('h3')?.textContent==='모든 단계 성공!'", timeout=12000)
        self.assertEqual(self.page.evaluate('S.coins'), 130)
        self.assertEqual(self.page.evaluate('G.clears'), 3)
        self.assertEqual(self.page.evaluate('G.effects'), {'helper':False,'magnifier':False})

    def test_reward_once_wallet_persistence_and_small_layout(self):
        r = self.page.evaluate("""() => {
          G.stageScores=[90,90,90]; G.stageNo=1; G.runTotal=0;
          showFinal({score:90}); const first=S.coins; showFinal({score:90});
          save(); return {first,second:S.coins};
        }""")
        self.assertEqual(r, {'first':120,'second':120})
        self.page.reload(); self.page.wait_for_function('!!window.__bb')
        self.assertEqual(self.page.evaluate('S.coins'), 120)
        self.page.set_viewport_size({'width':360,'height':640})
        self.page.evaluate("document.getElementById('intro')?.remove(); G.tut=false; Pop.close(); G.stageNo=3; G.stage=3; startStage(); G.state='cutting'; refreshBoosters()")
        boxes = self.page.evaluate("""() => ['boosterBar','btnJudge','walletHud'].map(id=>{
          const r=document.getElementById(id).getBoundingClientRect(); return {id,x:r.x,y:r.y,right:r.right,bottom:r.bottom};
        })""")
        for b in boxes:
            self.assertGreaterEqual(b['x'],0,b); self.assertLessEqual(b['right'],360,b)
            self.assertGreaterEqual(b['y'],0,b); self.assertLessEqual(b['bottom'],640,b)

    def test_magnifier_survives_settings_and_resize(self):
        self.page.evaluate("G.stage=1;startStage();G.state='cutting';G.paused=false;useBooster('magnifier');doCut(GameCore.guides(Food,3)[0]);openSettings()")
        self.page.locator('[data-r]').click()
        self.assertEqual(self.page.evaluate('G.preview?.pieces.length'), 2)
        self.page.set_viewport_size({'width':360,'height':640})
        self.page.wait_for_function('L.H===640')
        self.assertEqual(self.page.evaluate('G.preview?.pieces.length'), 2)

    def test_recharged_heart_enables_failed_screen_continue(self):
        self.page.evaluate("S.hearts=0;S.heartAt=Date.now();showFail({reason:'time',score:0})")
        self.assertTrue(self.page.locator('[data-heart]').is_disabled())
        self.page.evaluate('S.heartAt=Date.now()-GameCore.HEART_MS;refreshWallet()')
        self.assertFalse(self.page.locator('[data-heart]').is_disabled())


if __name__ == '__main__': unittest.main()
