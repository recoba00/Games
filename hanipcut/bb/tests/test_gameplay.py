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
          S.coins=100; S.items={helper:3,stopwatch:3,magnifier:3}; S.cutMode='straight';
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

    def draw_bent_gesture(self):
        box = self.page.evaluate('({x:Food.ox(),y:Food.oy(),w:Food.w,h:Food.h,s:L.s,left:app.getBoundingClientRect().left})')
        points = [(box['x']-8,box['y']+box['h']*.4), (box['x']+box['w']*.3,box['y']+box['h']*.4),
                  (box['x']+box['w']*.5,box['y']+box['h']*.7), (box['x']+box['w']*.7,box['y']+box['h']*.4),
                  (box['x']+box['w']+8,box['y']+box['h']*.4)]
        def move(p): self.page.mouse.move(box['left']+p[0]*box['s'],p[1]*box['s'],steps=8)
        move(points[0]); self.page.mouse.down()
        for p in points[1:]: move(p)
        return move

    def test_default_straight_pointer_and_automatic_judgment(self):
        self.draw_bent_gesture()
        self.assertEqual(self.page.evaluate('G.dragPath.length'), 2)
        self.page.mouse.up()
        self.assertEqual(self.page.evaluate('G.lines.length'), 1)
        self.assertEqual(self.page.evaluate('G.lines[0].length'), 2)
        self.assertEqual(self.page.evaluate('G.state'), 'judging')
        self.assertEqual(self.page.locator('#btnJudge,[data-item="undo"],#btnHearts,#btnShop').count(), 0)

    def test_toggle_curve_keeps_full_pointer_path_and_existing_cuts(self):
        self.page.evaluate("G.stage=1;startStage();G.state='cutting';useBooster('magnifier')")
        self.page.locator('#btnCutMode').click()
        self.draw_bent_gesture()
        self.assertGreater(self.page.evaluate('G.dragPath.length'), 5)
        self.page.mouse.up()
        self.assertEqual(self.page.evaluate('G.state'), 'cutting')
        self.assertGreater(self.page.evaluate('G.lines[0].length'), 5)
        self.assertIn('%', self.page.locator('#areaPreview').inner_text())
        self.page.locator('#btnCutMode').click()
        self.assertEqual(self.page.evaluate('S.cutMode'), 'straight')
        self.assertEqual(self.page.evaluate('G.lines.length'), 1)
        self.assertEqual(self.page.evaluate('G.cutsLeft'), 1)

    def test_item_scope_and_no_duplicate_consumption(self):
        result = self.page.evaluate("""() => {
          useBooster('helper'); useBooster('helper'); useBooster('magnifier'); useBooster('stopwatch');
          G.timerOn=true; const before=G.timeLeft; update(.5);
          const frozen=G.timeLeft===before, helper=S.items.helper;
          G.stage=1; startStage();
          return {helper,frozen,effects:G.effects,freeze:G.frozen};
        }""")
        self.assertEqual(result['helper'], 2)
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

    def test_three_ads_per_round_then_new_game_without_hearts(self):
        r = self.page.evaluate("""async () => {
          Platform.showRewardedAd=async ()=>'done'; S.adCount=10000;
          for(let i=0;i<4;i++){G.state='failed';await watchContinueAd({reason:'time'},()=>{});}
          const ads=G.adUsed;
          showFail({reason:'time',score:0});const advertised=!!Pop.el.querySelector('[data-ad]');
          const hearts=!!Pop.el.querySelector('[data-heart]');
          Pop.el.querySelector('[data-restart]').click();
          return {ads,advertised,hearts,state:G.state};
        }""")
        self.assertEqual(r, {'ads':3,'advertised':False,'hearts':False,'state':'loading'})

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
          for(const p of GameCore.guides(Food,5))doCut(p);
        }""")
        self.page.wait_for_function("Pop.el?.querySelector('h3')?.textContent==='3단계 성공!'", timeout=12000)
        self.page.locator('[data-next]').click()
        self.assertEqual(self.page.evaluate('G.stage'), 3)
        self.assertTrue(self.page.evaluate('G.effects.helper'))
        self.page.evaluate("G.state='cutting';G.timerOn=false;document.getElementById('cdim').classList.add('hidden');refreshBoosters();refreshPreview()")
        (ROOT / 'tests/screenshots').mkdir(exist_ok=True)
        self.page.screenshot(path=str(ROOT / 'tests/screenshots/seven-piece-stage.png'))
        self.page.evaluate("for(const p of GameCore.guides(Food,7))doCut(p)")
        self.page.wait_for_function("Pop.el?.querySelector('h3')?.textContent==='모든 단계 성공!'", timeout=12000)
        self.assertEqual(self.page.evaluate('S.coins'), 100)
        self.assertEqual(self.page.evaluate('G.clears'), 3)
        self.assertEqual(self.page.evaluate('G.effects'), {'helper':False,'magnifier':False})

    def test_reward_once_wallet_persistence_and_small_layout(self):
        r = self.page.evaluate("""() => {
          G.stageScores=[90,90,90]; G.stageNo=1; G.runTotal=0;
          showFinal({score:90}); const first=S.coins; showFinal({score:90});
          save(); return {first,second:S.coins};
        }""")
        self.assertEqual(r, {'first':100,'second':100})
        self.page.reload(); self.page.wait_for_function('!!window.__bb')
        self.assertEqual(self.page.evaluate('S.coins'), 100)
        self.page.set_viewport_size({'width':360,'height':640})
        self.page.evaluate("document.getElementById('intro')?.remove(); G.tut=false; Pop.close(); G.stageNo=3; G.stage=3; startStage(); G.state='cutting'; refreshBoosters()")
        boxes = self.page.evaluate("""() => ['boosterBar','btnCutMode','walletHud'].map(id=>{
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

    def test_empty_item_coin_use_pauses_timer_and_charges_once(self):
        self.page.evaluate("S.items.helper=0;G.timerOn=true;refreshBoosters()")
        self.assertFalse(self.page.locator('[data-item="helper"]').is_disabled())
        self.page.locator('[data-item="helper"]').click()
        self.assertTrue(self.page.evaluate('G.paused'))
        self.assertIn('30', self.page.locator('[data-item-coin]').inner_text())
        self.page.evaluate("window.itemTime=G.timeLeft;update(1)")
        self.assertTrue(self.page.evaluate('G.timeLeft===window.itemTime'))
        self.page.locator('[data-item-coin]').click()
        self.assertEqual(self.page.evaluate('({coins:S.coins,count:S.items.helper,on:G.effects.helper,paused:G.paused})'),
                         {'coins':70,'count':0,'on':True,'paused':False})
        self.page.evaluate("useBooster('helper')")
        self.assertEqual(self.page.evaluate('S.coins'), 70)

    def test_empty_item_close_and_insufficient_coins_do_not_charge(self):
        self.page.evaluate("S.items.stopwatch=0;S.coins=19;useBooster('stopwatch')")
        self.assertTrue(self.page.locator('[data-item-coin]').is_disabled())
        self.assertFalse(self.page.locator('[data-item-ad]').is_disabled())
        self.page.locator('[data-x]').click()
        self.assertEqual(self.page.evaluate('({coins:S.coins,on:G.frozen,paused:G.paused})'),
                         {'coins':19,'on':False,'paused':False})

    def test_coin_use_at_exact_price_for_all_three_items(self):
        for key, price in [('helper',30),('stopwatch',20),('magnifier',30)]:
            with self.subTest(item=key):
                self.page.evaluate("""({key,price}) => {
                  Pop.close();G.effects={helper:false,magnifier:false};G.frozen=false;G.paused=false;
                  S.items[key]=0;S.coins=price;useBooster(key);
                }""", {'key':key,'price':price})
                self.assertFalse(self.page.locator('[data-item-coin]').is_disabled())
                self.page.locator('[data-item-coin]').click()
                self.assertEqual(self.page.evaluate('S.coins'), 0)
                self.assertEqual(self.page.evaluate('(key)=>S.items[key]',key), 0)
                self.assertTrue(self.page.evaluate("(key)=>key==='stopwatch'?G.frozen:G.effects[key]",key))

    def test_web_ad_close_then_complete_applies_only_the_requested_item(self):
        self.page.evaluate("S.items.stopwatch=0;useBooster('stopwatch')")
        self.page.locator('[data-item-ad]').click()
        self.assertTrue(self.page.evaluate('G.paused'))
        self.page.locator('#ad [data-x]').click()
        self.assertFalse(self.page.evaluate('G.frozen'))
        self.page.locator('[data-item-ad]').click()
        self.page.wait_for_function("document.querySelector('#ad [data-x]')?.textContent==='보상 받기 ✕'")
        self.page.locator('#ad [data-x]').click()
        self.assertTrue(self.page.evaluate('G.frozen'))
        self.assertFalse(self.page.evaluate('G.paused'))
        self.assertEqual(self.page.evaluate('S.items'), {'helper':3,'stopwatch':0,'magnifier':3})
        self.assertEqual(self.page.evaluate('S.coins'), 100)

    def test_item_ad_return_from_background_resumes_after_visibility_event(self):
        r = self.page.evaluate("""async () => {
          S.items.helper=0;let resolve;Platform.showRewardedAd=()=>new Promise(r=>resolve=r);
          useBooster('helper');Pop.el.querySelector('[data-item-ad]').click();
          Object.defineProperty(document,'hidden',{configurable:true,value:true});
          document.dispatchEvent(new Event('visibilitychange'));
          resolve('done');await new Promise(r=>setTimeout(r,0));
          const during={on:G.effects.helper,paused:G.paused};
          Object.defineProperty(document,'hidden',{configurable:true,value:false});
          document.dispatchEvent(new Event('visibilitychange'));
          const after={on:G.effects.helper,paused:G.paused,coins:S.coins,count:S.items.helper};
          const controls=['btnCutMode','[data-item="stopwatch"]','[data-item="magnifier"]'].map(s=>document.querySelector(s.startsWith('[')?s:'#'+s).disabled);
          delete document.hidden;return {during,after,controls};
        }""")
        self.assertEqual(r, {'during':{'on':True,'paused':True},
                             'after':{'on':True,'paused':False,'coins':100,'count':0},'controls':[False,False,False]})

    def test_empty_item_ad_outcomes_duplicate_click_and_stale_completion(self):
        r = self.page.evaluate("""async () => {
          S.items.magnifier=0;
          for(const result of ['closed','error']) {
            Platform.showRewardedAd=async()=>result;useBooster('magnifier');
            Pop.el.querySelector('[data-item-ad]').click();
            await new Promise(r=>setTimeout(r,0));
            if(G.effects.magnifier||S.coins!==100||!G.paused)throw Error('failed ad applied item');
            Pop.el.querySelector('[data-x]').click();
          }
          let resolve;Platform.showRewardedAd=()=>new Promise(r=>resolve=r);useBooster('magnifier');
          const ad=Pop.el.querySelector('[data-item-ad]');ad.click();ad.click();resolve('done');
          await new Promise(r=>setTimeout(r,0));
          const applied={on:G.effects.magnifier,count:S.items.magnifier,coins:S.coins,paused:G.paused};
          S.items.stopwatch=0;useBooster('stopwatch');Pop.el.querySelector('[data-item-ad]').click();
          goLobby();resolve('done');await new Promise(r=>setTimeout(r,0));
          return {applied,stale:G.frozen,state:G.state,coins:S.coins,adUsed:G.adUsed};
        }""")
        self.assertEqual(r, {'applied':{'on':True,'count':0,'coins':100,'paused':False},
                             'stale':False,'state':'lobby','coins':100,'adUsed':0})

    def test_every_five_play_mission_pays_point_and_coins_once_per_claim(self):
        r = self.page.evaluate("""() => {
          S.m=null;S.points=0;S.login=true;
          for(let i=0;i<4;i++)Missions.addPlay();
          const early=Missions.claim('rep',true);Missions.addPlay();openMissions();
          const label=Pop.el.querySelector('[data-id="rep"]').textContent;
          Pop.el.querySelector('[data-id="rep"] [data-c]').click();
          const first={points:S.points,coins:S.coins};const duplicate=Missions.claim('rep',true);
          for(let i=0;i<5;i++)Missions.addPlay();Missions.claim('rep',true);save();
          return {early,label,first,duplicate,points:S.points,coins:S.coins};
        }""")
        self.assertEqual(r['early'], 0);self.assertEqual(r['duplicate'], 0)
        self.assertEqual(r['first'], {'points':1,'coins':110})
        self.assertIn('코인 10',r['label'])
        self.assertEqual((r['points'],r['coins']), (2,120))
        self.page.reload();self.page.wait_for_function('!!window.__bb')
        self.assertEqual(self.page.evaluate('S.coins'), 120)

    def test_repeat_claim_backlog_cap_and_daily_reset_preserve_wallet(self):
        r = self.page.evaluate("""() => {
          S.m=null;S.points=0;
          for(let i=0;i<55;i++)Missions.addPlay();
          for(let i=0;i<12;i++)Missions.claim('rep',true);
          const capped={points:S.points,coins:S.coins,ready:Missions.list().rep.ready};
          S.m.day='2000-01-01';Missions.state();
          const reset={points:S.points,coins:S.coins,ready:Missions.list().rep.ready};
          for(let i=0;i<5;i++)Missions.addPlay();Missions.claim('rep',true);
          return {capped,reset,points:S.points,coins:S.coins};
        }""")
        self.assertEqual(r, {'capped':{'points':10,'coins':200,'ready':False},
                             'reset':{'points':10,'coins':200,'ready':False},'points':11,'coins':210})

    def test_cut_mode_persists_but_tutorial_uses_straight(self):
        self.page.locator('#btnCutMode').click()
        self.assertEqual(self.page.locator('#btnCutMode').get_attribute('aria-pressed'), 'true')
        self.page.reload();self.page.wait_for_function('!!window.__bb')
        self.assertEqual(self.page.evaluate('S.cutMode'), 'curve')
        r = self.page.evaluate("""() => {
          document.getElementById('intro')?.remove();G.tut=true;G.state='cutting';refreshBoosters();
          toggleCutMode();return {mode:cutMode(),saved:S.cutMode,disabled:document.getElementById('btnCutMode').disabled};
        }""")
        self.assertEqual(r, {'mode':'straight','saved':'curve','disabled':True})


if __name__ == '__main__': unittest.main()
