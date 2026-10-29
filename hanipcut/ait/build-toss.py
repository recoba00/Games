# 한입컷 → 앱인토스 웹 번들(dist) 만들기. 이후 `npx ait build` 로 .ait 생성
import os, re, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__)); GAME = os.environ.get('HANIPCUT_GAME') or os.path.normpath(os.path.join(ROOT, '..', 'bb'))   # 게임 원본 = 옆의 bb 폴더
subprocess.run([sys.executable, 'build.py'], cwd=GAME, check=True, stdout=subprocess.DEVNULL)
# 콘솔 업로드: 같은 앱 버전이면 '이미 존재하는 버전'으로 막힘 → package.json version 을 게임 버전(CFG.version)과 맞춤
import json
ver = re.search(r"version: '([0-9.]+)'", open(os.path.join(GAME, 'src/game.js'),encoding='utf-8').read()).group(1)
pj = os.path.join(ROOT, 'package.json'); pd = json.load(open(pj,encoding='utf-8'))
if pd.get('version') != ver: pd['version'] = ver; open(pj, 'w',encoding='utf-8').write(json.dumps(pd, indent=2, ensure_ascii=False) + '\n')
lock = os.path.join(ROOT, 'package-lock.json')
if os.path.isfile(lock):
    ld = json.load(open(lock,encoding='utf-8')); ld['version'] = ver
    if '' in ld.get('packages',{}): ld['packages']['']['version'] = ver
    open(lock,'w',encoding='utf-8').write(json.dumps(ld,indent=2,ensure_ascii=False)+'\n')
print('app version', ver)
subprocess.run([shutil.which('npx') or 'npx', '--no-install', 'esbuild', 'bridge/toss-bridge.js', '--bundle', '--format=iife', '--minify', '--target=es2018',
                '--outfile=bridge/toss-bridge.min.js', '--log-level=warning'], cwd=ROOT, check=True)
out = os.path.join(ROOT, 'dist')
if os.path.islink(out) or os.path.dirname(os.path.realpath(out)) != os.path.realpath(ROOT): raise ValueError('Unsafe output directory')
shutil.rmtree(out, ignore_errors=True)
shutil.copytree(os.path.join(GAME, 'dist'), out, ignore=shutil.ignore_patterns('bungeo-banban.html'))
p = os.path.join(out, 'index.html'); h = open(p,encoding='utf-8').read()
# 외부 폰트(Google Fonts) 제거 → 번들 안 woff2 (검수: 외부 로드 최소화)
h = re.sub(r'<link rel="preconnect"[^>]*>\s*', '', h)
h = re.sub(r'<link href="https://fonts\.googleapis\.com[^>]*>\s*', '', h)
font = "<style>@font-face{font-family:'Jua';src:url(jua.woff2) format('woff2');font-display:swap}</style>\n"
bridge = '<script>' + open(os.path.join(ROOT, 'bridge/toss-bridge.min.js'),encoding='utf-8').read() + '</script>\n'
h = h.replace('</head>', font + '<link rel="preload" href="jua.woff2" as="font" type="font/woff2" crossorigin>\n</head>', 1)
i = h.index('<script>'); h = h[:i] + bridge + h[i:]          # 게임 스크립트보다 먼저 SDK 연결
assert 'googleapis' not in h
open(p, 'w',encoding='utf-8').write(h)
shutil.copy(os.path.join(ROOT, 'bridge/jua.woff2'), out)
print('dist ok', sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs) // 1024, 'KB')
