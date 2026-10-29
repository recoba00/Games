import base64,glob,os,json
src='src'; out='dist'; os.makedirs(out,exist_ok=True)
html=open(f'{src}/index.html',encoding='utf-8').read()
assets={}
for f in sorted(glob.glob('assets/*.webp')):
    assets[os.path.basename(f)[:-5]]='data:image/webp;base64,'+base64.b64encode(open(f,'rb').read()).decode()
html=html.replace('/*CSS*/',open(f'{src}/style.css',encoding='utf-8').read())
html=html.replace('/*ASSETS*/','window.ASSETS='+json.dumps(assets)+';')
import time
js=open(f'{src}/game-core.js',encoding='utf-8').read()+'\n'+open(f'{src}/game.js',encoding='utf-8').read()
html=html.replace('/*JS*/',js.replace('/*BUILD_ID*/',time.strftime('%Y%m%d-%H%M%S')))
open(f'{out}/index.html','w',encoding='utf-8').write(html)
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
open(f'{out}/bungeo-banban.html','w',encoding='utf-8').write(a)
print(len(html))
