# 웹 빌드: src/ 의 html·css·js 를 한 파일로 합쳐 dist/index.html 을 만든다.
#   python3 build.py
import os

here = os.path.dirname(os.path.abspath(__file__))
src, out = os.path.join(here, 'src'), os.path.join(here, 'dist')
os.makedirs(out, exist_ok=True)

def read(name):
    with open(os.path.join(src, name), encoding='utf-8') as f:
        return f.read()

html = read('index.html')
html = html.replace('/*CSS*/', read('style.css'))
html = html.replace('/*JS*/', read('game-core.js') + '\n' + read('game.js'))
with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(html)
print(f'dist/index.html {len(html.encode("utf-8")):,} bytes')
