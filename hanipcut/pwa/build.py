"""Build a standalone installable PWA without altering the Toss/web builds."""
import base64
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parent
GAME = ROOT.parent / 'bb'


def replace_once(text, pattern, replacement):
    text, count = re.subn(pattern, replacement, text, flags=re.S)
    if count != 1:
        raise ValueError(f'Expected exactly one source block, found {count}: {pattern}')
    return text


def build():
    with tempfile.TemporaryDirectory(prefix='hanipcut-pwa-') as temp:
        out = Path(temp)
        js = (GAME / 'src/game.js').read_text(encoding='utf-8')
        version = re.search(r"version: '([0-9.]+)'", js).group(1)
        # Release saves must survive rebuilds, query strings, and settings taps.
        js = replace_once(js, r'// ▼▼▼ \[테스트용 · 실제 배포 전 이 블록 삭제\].*?// ▲▲▲ \[테스트용 끝\][^\n]*', '')
        js = replace_once(js, r'// ▼▼▼ \[테스트용 · 실제 배포 전 삭제\].*?// ▲▲▲ \[테스트용 끝\]', '')
        js = replace_once(js, r'  testResetTap\([^\n]*\n', '')
        js = (GAME / 'src/game-core.js').read_text(encoding='utf-8') + '\n' + js
        assets = {p.stem: 'data:image/webp;base64,' + base64.b64encode(p.read_bytes()).decode()
                  for p in sorted((GAME / 'assets').glob('*.webp'))}
        html = (GAME / 'src/index.html').read_text(encoding='utf-8')
        html = re.sub(r'<link[^>]+https://fonts\.[^>]+>\s*', '', html)
        html = html.replace('/*CSS*/', (GAME / 'src/style.css').read_text(encoding='utf-8'))
        html = html.replace('/*ASSETS*/', 'window.ASSETS=' + json.dumps(assets) + ';')
        html = html.replace('/*JS*/', js)
        html = html.replace('</head>', '''<meta name="theme-color" content="#49352b">
<meta name="description" content="음식을 정확하게 나누는 3단계 캐주얼 게임, 한입컷">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<style>@font-face{font-family:'Jua';src:url('jua.woff2') format('woff2');font-display:swap}</style>
</head>''')
        html = html.replace('</body>', '<script src="register-sw.js"></script>\n</body>')
        (out / 'index.html').write_text(html, encoding='utf-8')
        shutil.copytree(GAME / 'assets/foods', out / 'foods')
        for path in (GAME / 'assets').glob('*.mp4'):
            shutil.copy2(path, out / path.name)
        shutil.copy2(GAME / 'assets/fx/cat_slash.webp', out)
        shutil.copy2(ROOT.parent / 'ait/bridge/jua.woff2', out)
        shutil.copy2(ROOT / 'register-sw.js', out)
        (out / 'icons').mkdir()
        mascot = Image.open(GAME / 'assets/mascot.webp').convert('RGBA')
        for size in (192, 512):
            canvas = Image.new('RGBA', (size, size), '#fff3d6')
            side = round(size * .68)
            artwork = mascot.resize((side, side), Image.Resampling.LANCZOS)
            canvas.alpha_composite(artwork, ((size-side)//2, (size-side)//2))
            canvas.convert('RGB').save(out / f'icons/icon-{size}.png')
        manifest = {
            'id': './', 'name': '한입컷', 'short_name': '한입컷', 'lang': 'ko',
            'description': '음식을 정확하게 나누는 3단계 캐주얼 게임',
            'start_url': './', 'scope': './', 'display': 'standalone',
            'background_color': '#fff3d6', 'theme_color': '#49352b',
            'categories': ['games', 'entertainment'],
            'icons': [{'src': f'icons/icon-{n}.png', 'sizes': f'{n}x{n}',
                       'type': 'image/png', 'purpose': 'any maskable'} for n in (192, 512)]}
        (out / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        files = sorted(p.relative_to(out).as_posix() for p in out.rglob('*') if p.is_file())
        template = (ROOT / 'sw.js').read_text(encoding='utf-8')
        digest = hashlib.sha256(template.encode())
        for name in files:
            digest.update(name.encode())
            digest.update((out / name).read_bytes())
        build_id = f'{version}-{digest.hexdigest()[:16]}'
        sw = template.replace('__BUILD_ID__', json.dumps(build_id)).replace('__PRECACHE__', json.dumps(files))
        (out / 'sw.js').write_text(sw, encoding='utf-8')
        # Hosting configuration is not a browser asset and must not be precached.
        shutil.copy2(ROOT / 'vercel.json', out)
        # The destination is fixed inside pwa/, never a caller-supplied path.
        dest = ROOT / 'dist'
        if dest.exists():
            if dest.is_symlink() or dest.resolve().parent != ROOT.resolve():
                raise ValueError('Unsafe output directory')
            shutil.rmtree(dest)
        shutil.copytree(out, dest)
    shutil.make_archive(str(ROOT / 'hanipcut-pwa'), 'zip', ROOT / 'dist')
    print(f'PWA {build_id}: {ROOT / "dist"}')
    print(f'Hosting archive: {ROOT / "hanipcut-pwa.zip"} (not an MSIX)')


if __name__ == '__main__':
    build()
