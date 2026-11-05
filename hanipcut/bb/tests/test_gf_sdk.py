"""지팩토리 게임 SDK(gf-sdk) 연결 테스트.

A. 게임 쪽 배선: 웹 빌드에 가짜 GfSDK + window.__gfConfig 를 넣어(토스 빌드가 넣는 것과 같은 자리) 판 신고·광고·지급·화면 전환을 확인
B. 실제 토스 번들(ait/dist): vendor SDK 가 실리고 브라우저(토스 밖)에서도 게임이 멈추지 않는지
"""
import functools
import http.server
import json
import os
import subprocess
import threading
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
AIT = ROOT.parent / 'ait'

MOCK = r"""
(() => {
  const calls = window.__gfCalls = [];
  const rec = (name, ...a) => { calls.push([name, ...a]); };
  window.__gfMock = { adResult: { rewarded: true, noFill: false }, owns: true };
  const view = { sync(v) { rec('view.sync'); }, open() {}, update() {}, close() {}, freeze() {}, isOpen: () => false };
  window.GfSDK = {
    init(o) { rec('init', o); window.__gfInit = o; return Promise.reject(Object.assign(new Error('deferred'), { code: 'LOGIN_DEFERRED' })); },
    on(ev) { rec('on', ev); },
    log(n, d) { rec('log', n, d); return Promise.resolve(); },
    getSession: () => null,
    ad: { preload: (o) => { rec('ad.preload', o); return Promise.resolve(true); }, showRewarded: (o) => { rec('ad.showRewarded', o); return Promise.resolve(window.__gfMock.adResult); } },
    reward: {
      createView: (o) => { rec('createView', o); return view; },
      isV2: () => true,
      beginRound: () => rec('beginRound'), setRoundActive: (b) => rec('setRoundActive', b),
      gameEnd: () => { rec('gameEnd'); return Promise.resolve({}); },
      beforeResultAction: () => { rec('beforeResultAction'); return new Promise(r => { window.__gfReleaseResult = r; }); },
    },
    onboarding: {
      beforePlay: () => { rec('beforePlay'); return new Promise(r => { window.__gfReleasePlay = r; }); },
      previewGift: () => { rec('previewGift'); return Promise.resolve(); },
      tutorialComplete: () => { rec('tutorialComplete'); return Promise.resolve(); },
    },
    promoHub: { open: () => rec('promoHub.open'), ackItem: (i) => rec('ackItem', i), ownsGrant: () => window.__gfMock.owns,
      openNotificationSettings: () => rec('openNotificationSettings') },
    leaderboard: { open: () => rec('leaderboard.open'), submit: (s) => { rec('leaderboard.submit', s); return Promise.resolve({ ok: true, rank: { all: { before: 9, after: 4 } } }); } },
  };
})();
"""


def serve(directory):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


class GfWiringTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(['python', '-X', 'utf8', 'build.py'], cwd=ROOT, check=True, env={**os.environ, 'PYTHONUTF8': '1'}, capture_output=True)
        cls.server = serve(ROOT / 'dist')
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(channel='msedge')

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close()

    def open(self, cfg, tut=True):
        self.context = self.browser.new_context(viewport={'width': 390, 'height': 844})
        self.page = self.context.new_page(); self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        base = {'gameId': 'hanipcut', 'appName': 'hanipcut', 'env': 'test', 'apiBase': 'https://api.gfactory.ai', 'ads': {'rv': 'rv-test'}}
        self.page.add_init_script(f'window.__gfConfig={json.dumps({**base, **cfg})};' + MOCK)
        if tut:
            self.page.add_init_script("localStorage.setItem('bb_save_v1', JSON.stringify({tut:true,bestClear:0}))")
        self.page.goto(f'http://127.0.0.1:{self.server.server_port}/')
        self.page.wait_for_function('!!window.__bb && !!window.__gfInit')
        self.page.evaluate("() => { document.getElementById('intro')?.remove(); Pop.close(); }")

    def tearDown(self):
        self.assertEqual(self.errors, [])
        self.context.close()

    def calls(self, name=None):
        c = self.page.evaluate('window.__gfCalls')
        return [x for x in c if x[0] == name] if name else c

    def test_init_options_full_switches(self):
        self.open({'promotionCode': 'HANIPCUT', 'leaderboardEntryUrl': 'intoss://hanipcut'})
        o = self.page.evaluate('window.__gfInit')
        self.assertEqual((o['gameId'], o['platform']), ('hanipcut', 'toss'))
        self.assertEqual(o['toss']['loginTiming'], 'explicit')
        self.assertEqual(o['reward']['promotionCode'], 'HANIPCUT')
        self.assertEqual((o['reward']['hub']['uxVersion'], o['reward']['hub']['badge']), (2, False))
        self.assertEqual((o['leaderboard']['scoreLabel'], o['leaderboard']['badge']), ('연승', False))
        self.assertEqual(self.calls('createView')[0][1]['badge'], False)
        self.assertEqual(self.page.evaluate('[Gf.on, Gf.reward, Gf.board]'), [True, True, True])

    def test_switches_off_keep_game_own_screens(self):
        self.open({'promotionCode': '', 'leaderboardEntryUrl': ''})
        o = self.page.evaluate('window.__gfInit')
        self.assertNotIn('reward', o); self.assertNotIn('leaderboard', o)
        self.assertEqual(o['toss']['loginTiming'], 'explicit')
        self.page.locator('#btnMission').click()
        self.assertEqual(self.page.evaluate("Pop.el && Pop.el.dataset.t"), '오늘의 미션')
        self.page.evaluate('Pop.close()'); self.page.locator('#btnRank').click()
        self.assertEqual(self.page.evaluate("Pop.el && Pop.el.dataset.t"), '랭킹')
        self.assertEqual(self.calls('promoHub.open') + self.calls('leaderboard.open'), [])

    def test_buttons_open_sdk_screens(self):
        self.open({'promotionCode': 'HANIPCUT', 'leaderboardEntryUrl': 'intoss://hanipcut'})
        self.page.locator('#btnMission').click(); self.page.locator('#btnMis').click(); self.page.locator('#btnRank').click()
        self.assertEqual(len(self.calls('promoHub.open')), 2)
        self.assertEqual(len(self.calls('leaderboard.open')), 1)
        self.assertFalse(self.page.evaluate('!!Pop.el'))
        self.page.locator('#btnSet2').click(); self.page.locator('[data-notif-off]').click()
        self.assertEqual(len(self.calls('openNotificationSettings')), 1)

    def test_start_waits_for_before_play_then_counts_round(self):
        self.open({'promotionCode': 'HANIPCUT'})
        self.page.locator('#btnStart').click(); self.page.locator('#btnStart').click()
        self.assertEqual(len(self.calls('beforePlay')), 1)
        self.assertEqual(self.page.evaluate('G.state'), 'lobby')
        self.page.evaluate('window.__gfReleasePlay()')
        self.page.wait_for_function("G.state === 'cutting' || G.state === 'countdown'")   # 음식 로드 뒤 판 시작
        self.assertEqual(len(self.calls('beginRound')), 1)
        self.page.wait_for_function("window.__gfCalls.some(c => c[0] === 'setRoundActive' && c[1] === true)")

    def fail_now(self, after_ms):
        # 시계를 after_ms 앞으로 민 뒤 시간 초과로 실패
        self.page.evaluate(f"() => {{ Pop.close(); G.state='cutting'; G.paused=false; __gfShift({after_ms}); timeOver(); }}")
        self.page.wait_for_function("G.state === 'failed'", timeout=5000)

    def test_round_end_once_with_ten_second_rule(self):
        self.open({'promotionCode': 'HANIPCUT'})
        # 판 시작 시각을 조작할 수 있게 Date.now 를 밀어 주는 도우미
        self.page.evaluate("() => { let off = 0; const n = Date.now.bind(Date); Date.now = () => n() + off; window.__gfShift = (ms) => { off += ms; }; }")
        self.page.evaluate("() => { newGame(); }")
        self.page.wait_for_function("G.state === 'countdown' || G.state === 'cutting'")
        self.fail_now(3000)                       # 3초 실패 = 판 아님(보류)
        self.assertEqual(self.calls('gameEnd'), [])
        self.page.evaluate("() => { G.adUsed++; Pop.close(); clearChips(); startStage(); }")   # 이어하기(같은 판)
        self.fail_now(9000)                       # 시작부터 12초 → 1판
        self.assertEqual(len(self.calls('gameEnd')), 1)
        self.page.evaluate("() => { G.adUsed++; Pop.close(); clearChips(); startStage(); }")
        self.fail_now(9000)                       # 같은 판 다시 실패 → 추가 신고 없음
        self.assertEqual(len(self.calls('gameEnd')), 1)
        self.assertEqual(len(self.calls('beginRound')), 1)

    def test_win_counts_and_result_buttons_wait_for_sdk(self):
        self.open({'promotionCode': 'HANIPCUT', 'leaderboardEntryUrl': 'intoss://hanipcut'})
        self.page.evaluate("() => { newGame(); }")
        self.page.wait_for_function("G.state === 'countdown' || G.state === 'cutting'")
        self.page.evaluate("() => { Pop.close(); G.stageScores=[80,80,80]; G.stage=2; showFinal({score:80}); }")
        self.assertEqual(len(self.calls('gameEnd')), 1)
        self.assertEqual(self.calls('leaderboard.submit'), [['leaderboard.submit', 1]])
        self.page.wait_for_function("[...document.querySelectorAll('.ttoast')].some(t => t.textContent.includes('랭킹 4위로 올랐어요 (▲5)'))", timeout=4000)
        self.page.locator('[data-next]').click()
        self.assertEqual(len(self.calls('beforeResultAction')), 1)
        self.assertEqual(self.page.evaluate('G.stageNo'), 2)
        self.assertEqual(len(self.calls('beginRound')), 1)          # SDK 안내가 닫히기 전에는 다음 판이 시작되지 않음
        self.page.evaluate('window.__gfReleaseResult()')
        self.page.wait_for_function("window.__gfCalls.filter(c => c[0] === 'beginRound').length === 2")

    def test_rewarded_ad_results(self):
        self.open({'promotionCode': ''})
        for res, want in [({'rewarded': True, 'noFill': False}, 'done'), ({'rewarded': False, 'noFill': True}, 'error'), ({'rewarded': False, 'noFill': False}, 'closed')]:
            self.page.evaluate(f'window.__gfMock.adResult = {json.dumps(res)}')
            self.assertEqual(self.page.evaluate('Platform.showRewardedAd()'), want)
        self.assertEqual(self.calls('ad.showRewarded')[0][1], {'adGroupId': 'rv-test'})

    def test_item_grants_once_and_unknown_waits(self):
        self.open({'promotionCode': 'HANIPCUT'})
        deliver = "(g) => window.__gfInit.reward.hub.items.deliver(g)"
        c0 = self.page.evaluate('S.coins'); h0 = self.page.evaluate('S.items.helper')
        self.assertTrue(self.page.evaluate(f"({deliver})({{currency:'coin',amount:10,idem:'a1'}})"))
        self.assertTrue(self.page.evaluate(f"({deliver})({{currency:'coin',amount:10,idem:'a1'}})"))
        self.assertTrue(self.page.evaluate(f"({deliver})({{currency:'helper',amount:2,idem:'a2'}})"))
        self.assertFalse(self.page.evaluate(f"({deliver})({{currency:'heart',amount:5,idem:'a3'}})"))
        self.page.evaluate('window.__gfMock.owns = false')
        self.assertFalse(self.page.evaluate(f"({deliver})({{currency:'coin',amount:10,idem:'a4'}})"))
        self.assertEqual(self.page.evaluate('S.coins'), c0 + 10)
        self.assertEqual(self.page.evaluate('S.items.helper'), h0 + 2)
        self.assertEqual([c[1] for c in self.calls('ackItem')], ['a1', 'a1', 'a2'])

    def test_tutorial_uses_sdk_gift_screens(self):
        self.open({'promotionCode': 'HANIPCUT'}, tut=False)
        self.page.evaluate("() => { Tut.start(); }")
        self.page.wait_for_function("window.__gfCalls.some(c => c[0] === 'previewGift')")
        self.assertFalse(self.page.evaluate("!!(Pop.el && Pop.el.dataset.t === '출석 선물')"))
        self.page.evaluate("() => { Tut.done(); }")
        self.page.wait_for_function("window.__gfCalls.some(c => c[0] === 'tutorialComplete')")
        self.page.wait_for_function("window.__gfCalls.some(c => c[0] === 'beginRound')")
        self.assertFalse(self.page.evaluate("!!(Pop.el && Pop.el.dataset.t === '튜토리얼 완료!')"))

    def test_short_fail_skips_result_notice_and_home_discards_pending_action(self):
        self.open({'promotionCode': 'HANIPCUT'})
        self.page.evaluate("() => { let off = 0; const n = Date.now.bind(Date); Date.now = () => n() + off; window.__gfShift = (ms) => { off += ms; }; }")
        self.page.evaluate("() => { newGame(); }")
        self.page.wait_for_function("G.state === 'countdown' || G.state === 'cutting'")
        self.fail_now(2000)                                   # 판이 아닌 짧은 실패 → 안내 없이 바로
        self.page.locator('[data-restart]').click()
        self.assertEqual(self.calls('beforeResultAction'), [])
        self.page.wait_for_function("window.__gfCalls.filter(c => c[0] === 'beginRound').length === 2")
        self.page.wait_for_function("G.state === 'countdown' || G.state === 'cutting'")
        self.fail_now(15000)                                  # 정식 판 실패 → [처음부터] 는 SDK 안내를 기다림
        self.page.locator('[data-restart]').click()
        self.assertEqual(len(self.calls('beforeResultAction')), 1)
        self.page.evaluate("() => { goLobby(); window.__gfReleaseResult(); }")   # 기다리는 사이 홈으로
        self.page.wait_for_timeout(300)
        self.assertEqual(self.page.evaluate('G.state'), 'lobby')
        self.assertEqual(len(self.calls('beginRound')), 2)

    def test_toss_build_skips_example_ad_popup_and_uses_sdk_login(self):
        self.open({'promotionCode': ''})
        self.page.evaluate("() => { S.plays = 3; S.adAt = 0; window.__next = 0; afterRound(() => { window.__next++; }, true); }")
        self.assertEqual(self.page.evaluate('[window.__next, !!Pop.el]'), [1, False])
        self.page.evaluate("() => { CFG.loginExample = false; GfSDK.retrySession = () => { __gfCalls.push(['retrySession']); return Promise.resolve({ deviceId: 'd' }); }; }")
        self.assertTrue(self.page.evaluate('Platform.login()'))
        self.assertEqual(len(self.calls('retrySession')), 1)

    def test_notification_off_row_only_in_lobby_settings(self):
        self.open({'promotionCode': 'HANIPCUT'})
        self.page.locator('#btnSet2').click()
        self.assertEqual(self.page.locator('[data-notif-off] img').count(), 1)
        self.page.evaluate("() => { Pop.close(); G.food=FOODS[0]; Food.set(FOODS[0],null); G.stage=0; G.stageNo=1; startStage(); openSettings(); }")
        self.assertEqual(self.page.locator('[data-notif-off]').count(), 0)


class TossBundleTest(unittest.TestCase):
    """실제 토스 번들: vendor SDK 해시·로드 순서, 토스 밖 브라우저에서도 게임이 뜨는지."""

    @classmethod
    def setUpClass(cls):
        subprocess.run(['python', '-X', 'utf8', 'build-toss.py'], cwd=AIT, check=True, env={**os.environ, 'PYTHONUTF8': '1'}, capture_output=True)
        cls.server = serve(AIT / 'dist')
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(channel='msedge')

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close()

    def test_bundle_order_and_boot(self):
        html = (AIT / 'dist' / 'index.html').read_text(encoding='utf-8')
        cfg = json.loads((AIT / 'gf.config.json').read_text(encoding='utf-8'))
        i_bridge, i_cfg, i_sdk, i_game = html.index('window.AppsInToss'), html.index('window.__gfConfig='), html.index(f'src="{cfg["sdk"]["file"]}"'), html.index('const Gf = ')
        self.assertTrue(i_bridge < i_cfg < i_sdk < i_game)
        self.assertTrue((AIT / 'dist' / cfg['sdk']['file']).is_file())
        ctx = self.browser.new_context(viewport={'width': 390, 'height': 844}); page = ctx.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{self.server.server_port}/')
        page.wait_for_function('!!window.__bb', timeout=15000)
        self.assertEqual(page.evaluate('[!!window.GfSDK, Gf.on, Gf.reward, Gf.board, Gf.adReady()]'), [True, True, False, False, True])
        page.evaluate("() => { document.getElementById('intro')?.remove(); }")
        page.wait_for_timeout(1500)
        self.assertEqual(page.evaluate('Screen.cur'), 'lobby')
        self.assertEqual(errors, [])
        ctx.close()


if __name__ == '__main__':
    unittest.main()
