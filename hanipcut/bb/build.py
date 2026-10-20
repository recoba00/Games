import base64,glob,os,json
src='src'; out='dist'; os.makedirs(out,exist_ok=True)
html=open(f'{src}/index.html').read()
assets={}
for f in sorted(glob.glob('assets/*.webp')):
    assets[os.path.basename(f)[:-5]]='data:image/webp;base64,'+base64.b64encode(open(f,'rb').read()).decode()
html=html.replace('/*CSS*/',open(f'{src}/style.css').read())
html=html.replace('/*ASSETS*/','window.ASSETS='+json.dumps(assets)+';')
import time
html=html.replace('/*JS*/',open(f'{src}/game.js').read().replace('/*BUILD_ID*/',time.strftime('%Y%m%d-%H%M%S')))  # [테스트용] 빌드마다 신규 유저 (배포 전 game.js 블록과 함께 삭제)
open(f'{out}/index.html','w').write(html)
import shutil
os.makedirs(f'{out}/foods',exist_ok=True)
for f in glob.glob('assets/foods/*.webp'): shutil.copy(f,f'{out}/foods/')
shutil.copy('assets/intro.mp4',f'{out}/intro.mp4')
for f in glob.glob('assets/bgm_*.mp4'): shutil.copy(f,f'{out}/')
shutil.copy('assets/fx/cat_slash.webp',f'{out}/cat_slash.webp')
# 아티팩트용: 문서 뼈대 제거본
import re
a=re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>','',html,flags=re.I)
for t in ('</head>','<body>','</body>','</html>'): a=a.replace(t,'')
open(f'{out}/bungeo-banban.html','w').write(a)
print(len(html))
