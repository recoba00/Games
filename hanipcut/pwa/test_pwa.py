"""Integration checks: real browser, subdirectory hosting and offline restart."""
import functools
import http.server
from pathlib import Path
import threading
import unittest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent


class PwaTest(unittest.TestCase):
    def test_install_offline_and_preserve_save(self):
        self.assertTrue((ROOT / 'dist/manifest.webmanifest').exists(), 'Build the PWA first')
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(channel='msedge')
                context = browser.new_context()
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                url = f'http://127.0.0.1:{server.server_port}/dist/'
                page.goto(url)
                page.evaluate('navigator.serviceWorker.ready')
                page.reload()
                page.wait_for_function('!!navigator.serviceWorker.controller && !!window.__bb')
                manifest = page.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
                self.assertEqual(manifest['display'], 'standalone')
                for icon in manifest['icons']:
                    self.assertTrue(page.evaluate('(url)=>fetch(url).then(r=>r.ok)', icon['src']))
                page.evaluate("localStorage.setItem('bb_save_v1', JSON.stringify({best:12345,tut:true,coins:37,hearts:2,heartAt:Date.now(),items:{undo:0,helper:2,stopwatch:0,magnifier:3}}))")
                context.set_offline(True)
                page.goto(url + '?reset=1')
                page.wait_for_function('!!window.__bb')
                self.assertEqual(page.evaluate('window.__bb.S.best'), 12345)
                self.assertEqual(page.evaluate('window.__bb.S.coins'), 37)
                self.assertEqual(page.evaluate('window.__bb.S.hearts'), 2)
                self.assertEqual(page.evaluate('window.__bb.S.items'), {'undo':0,'helper':2,'stopwatch':0,'magnifier':3})
                self.assertTrue(page.evaluate("fetch('foods/bungeo.webp').then(r=>r.ok)"))
                media = page.evaluate("fetch('intro.mp4',{headers:{Range:'bytes=0-99'}}).then(async r=>({status:r.status,size:(await r.arrayBuffer()).byteLength}))")
                self.assertEqual(media, {'status': 206, 'size': 100})
                self.assertEqual(errors, [])
                browser.close()
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
