# 한입컷 배경음 2곡 — 직접 작곡 (저작권 우리 소유, 표기 불필요). 사운드폰트 FluidR3_GM(MIT)로 렌더
import mido, random
random.seed(7)
TPB = 480; E = TPB // 2  # 8분음표
R = None
def mk(bpm, tracks_fn, loops, path):
    mid = mido.MidiFile(ticks_per_beat=TPB)
    meta = mido.MidiTrack(); mid.tracks.append(meta)
    meta.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(bpm)))
    events = []  # (tick, type, ch, note, vel)
    progs = {}
    tracks_fn(events, progs, loops)
    for ch, (prog, vol, pan, rev) in progs.items():
        t = mido.MidiTrack(); mid.tracks.append(t)
        t.append(mido.Message('program_change', channel=ch, program=prog, time=0))
        t.append(mido.Message('control_change', channel=ch, control=7, value=vol, time=0))
        t.append(mido.Message('control_change', channel=ch, control=10, value=pan, time=0))
        t.append(mido.Message('control_change', channel=ch, control=91, value=rev, time=0))
        evs = sorted([e for e in events if e[2] == ch], key=lambda e: (e[0], 0 if e[1] == 'off' else 1))
        last = 0
        for tk, ty, c, n, v in evs:
            t.append(mido.Message('note_on' if ty == 'on' else 'note_off', channel=c, note=n, velocity=v, time=tk - last)); last = tk
    mid.save(path)

def note(ev, ch, start, dur, n, vel):
    vel = max(1, min(127, vel + random.randint(-6, 6)))
    jit = random.randint(-6, 6) if ch != 9 else random.randint(-3, 3)
    s = max(0, start + jit); ev.append((s, 'on', ch, n, vel)); ev.append((s + max(30, dur - 20), 'off', ch, n, 0))

def melody(ev, ch, bar0, bars, vel, oct=0, stacc=1.0):
    t = bar0 * 8 * E
    for bar in bars:
        for n, d in bar:
            if n is not None: note(ev, ch, t, int(d * E * stacc), n + 12 * oct, vel)
            t += d * E

# ───────── 로비: "한입 산책" F장조 100bpm ─────────
F4, G4, A4, Bb4, C5, D5, E5, F5, G5, A5, Bb5 = 65, 67, 69, 70, 72, 74, 76, 77, 79, 81, 82
LOBBY_MEL = [
 [(C5,1),(A4,1),(C5,1),(F5,2),(E5,1),(D5,1),(C5,1)],
 [(D5,2),(A4,1),(F4,1),(A4,2),(R,2)],
 [(Bb4,1),(D5,1),(F5,1),(D5,1),(C5,1),(Bb4,1),(A4,2)],
 [(G4,2),(A4,1),(Bb4,1),(C5,3),(R,1)],
 [(C5,1),(A4,1),(C5,1),(F5,2),(G5,1),(A5,2)],
 [(F5,2),(E5,1),(D5,1),(A4,3),(R,1)],
 [(Bb4,1),(D5,1),(G5,2),(F5,1),(E5,1),(D5,1),(E5,1)],
 [(C5,4),(R,2),(E5,1),(G5,1)],
 [(F5,3),(D5,1),(Bb4,2),(D5,2)],
 [(E5,3),(C5,1),(G4,2),(C5,2)],
 [(A5,2),(G5,1),(E5,1),(C5,2),(E5,2)],
 [(F5,2),(E5,1),(D5,1),(A4,4)],
 [(Bb4,1),(D5,1),(G5,1),(Bb5,1),(A5,2),(G5,2)],
 [(G5,1),(F5,1),(E5,1),(D5,1),(E5,2),(G5,2)],
 [(F5,2),(C5,1),(A4,1),(F5,2),(A5,2)],
 [(G5,2),(E5,1),(C5,1),(G4,2),(R,2)],
]
LOBBY_CH = ['F','Dm','Bb','C','F','Dm','Gm','C','Bb','C','Am','Dm','Gm','C','F','C']
CH = {'F':(53,[57,60,65]),'Dm':(50,[57,62,65]),'Bb':(46,[58,62,65]),'C':(48,[55,60,64]),'Gm':(43,[58,62,67]),'Am':(45,[57,60,64]),
      'G':(43,[55,59,62]),'Em':(40,[55,59,64])}

def lobby(ev, progs, loops):
    progs[0] = (12, 100, 64, 40)   # 마림바 멜로디
    progs[1] = (45, 70, 40, 50)    # 피치카토 현 (뒷박 화음)
    progs[2] = (32, 105, 64, 20)   # 어쿠스틱 베이스
    progs[3] = (9, 55, 90, 60)     # 글로켄슈필 (B파트 장식)
    progs[4] = (24, 62, 84, 45)    # 나일론 기타 아르페지오
    progs[9] = (0, 80, 64, 30)     # 드럼
    for L in range(loops):
        b0 = L * 16
        melody(ev, 0, b0, LOBBY_MEL, 92, stacc=0.85)
        melody(ev, 3, b0 + 8, LOBBY_MEL[8:], 60, oct=1, stacc=0.5)
        for i, c in enumerate(LOBBY_CH):
            bar = (b0 + i) * 8 * E; root, tri = CH[c]
            for off in (1, 3, 5, 7):  # 뒷박 피치카토
                for n in tri: note(ev, 1, bar + off * E, E, n, 62)
            note(ev, 2, bar, int(E * 1.6), root - 12 + 12 * (root < 45), 96)
            note(ev, 2, bar + 4 * E, int(E * 1.6), root - 12 + 12 * (root < 45) + 7, 84)
            if i % 2 == 1: note(ev, 2, bar + 7 * E, int(E * 0.8), root - 12 + 12 * (root < 45) + 5, 70)
            for k, n in enumerate([tri[0], tri[1], tri[2], tri[1]] * 2):  # 기타 아르페지오
                note(ev, 4, bar + k * E, E * 2, n + 12, 48)
            # 드럼: 킥 1·3, 림 2·4, 셰이커 8분, 트라이앵글 4마디마다
            note(ev, 9, bar, E, 36, 70); note(ev, 9, bar + 4 * E, E, 36, 58)
            note(ev, 9, bar + 2 * E, E, 37, 66); note(ev, 9, bar + 6 * E, E, 37, 70)
            for k in range(8): note(ev, 9, bar + k * E, E // 2, 82, 40 if k % 2 else 54)
            if i % 4 == 0: note(ev, 9, bar, E, 81, 50)

# ───────── 게임: "쓱싹 타임" C장조 128bpm ─────────
B4n, C5, D5, E5, F5, G5, A5, B5, C6, D6, G4n = 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 67
PLAY_MEL = [
 [(E5,1),(G5,1),(C6,1),(G5,1),(E5,1),(G5,1),(C5,2)],
 [(D5,1),(G5,1),(B5,1),(G5,1),(D5,2),(B4n,2)],
 [(C5,1),(E5,1),(A5,1),(E5,1),(C5,1),(E5,1),(A5,2)],
 [(A5,1),(G5,1),(F5,1),(E5,1),(F5,2),(R,2)],
 [(E5,1),(G5,1),(C6,1),(G5,1),(E5,1),(G5,1),(C6,1),(D6,1)],
 [(B5,2),(G5,1),(D5,1),(G5,2),(B5,2)],
 [(A5,1),(C6,1),(A5,1),(F5,1),(G5,1),(A5,1),(G5,1),(F5,1)],
 [(D5,2),(G5,2),(B4n,2),(R,2)],
 [(E5,2),(A5,2),(G5,1),(E5,1),(C5,2)],
 [(F5,2),(A5,2),(G5,1),(F5,1),(C5,2)],
 [(E5,1),(F5,1),(G5,2),(C6,2),(G5,2)],
 [(B5,1),(A5,1),(G5,1),(F5,1),(D5,4)],
 [(C5,1),(E5,1),(A5,2),(G5,1),(A5,1),(B5,2)],
 [(C6,2),(A5,1),(F5,1),(A5,2),(C6,2)],
 [(D6,2),(C6,1),(A5,1),(F5,1),(A5,1),(D6,2)],
 [(B5,1),(D6,1),(B5,1),(G5,1),(D5,2),(G4n,2)],
]
PLAY_CH = ['C','G','Am','F','C','G','F','G','Am','F','C','G','Am','F','Dm','G']
CH.update({'F':(41,[57,60,65]),'Dm':(38,[57,62,65]),'C':(36,[55,60,64]),'G':(43,[55,59,62]),'Am':(45,[57,60,64])})
def play(ev, progs, loops):
    progs[0] = (13, 96, 60, 35)    # 실로폰 멜로디
    progs[5] = (12, 70, 70, 35)    # 마림바 옥타브 아래 더블
    progs[1] = (45, 72, 40, 40)    # 피치카토 화음
    progs[2] = (33, 108, 64, 15)   # 핑거 베이스
    progs[3] = (9, 50, 96, 50)     # 글로켄 (B파트)
    progs[6] = (78, 50, 30, 50)    # 휘슬 (B파트 롱톤)
    progs[9] = (0, 90, 64, 20)
    for L in range(loops):
        b0 = L * 16
        melody(ev, 0, b0, PLAY_MEL, 94, stacc=0.7)
        melody(ev, 5, b0, PLAY_MEL, 58, oct=-1, stacc=0.6)
        melody(ev, 3, b0 + 8, PLAY_MEL[8:], 56, oct=1, stacc=0.4)
        for i, c in enumerate(PLAY_CH):
            bar = (b0 + i) * 8 * E; root, tri = CH[c]
            for off in (1, 3, 5, 7):
                for n in tri: note(ev, 1, bar + off * E, int(E * 0.8), n, 64)
            r = root if root >= 36 else root + 12
            for k, (o, iv) in enumerate([(0,0),(1,12),(2,0),(3,7),(4,0),(5,12),(6,7),(7,0)]):
                note(ev, 2, bar + o * E, int(E * 0.8), r + iv, 98 if o % 2 == 0 else 80)
            if i >= 8: note(ev, 6, bar, 8 * E - 40, tri[2] + 12, 44)
            note(ev, 9, bar, E, 36, 92); note(ev, 9, bar + 3 * E, E, 36, 70); note(ev, 9, bar + 4 * E, E, 36, 88)
            note(ev, 9, bar + 2 * E, E, 39, 80); note(ev, 9, bar + 6 * E, E, 39, 86)
            for k in range(8): note(ev, 9, bar + k * E, E // 2, 42, 48 if k % 2 else 60)
            for k in (1, 3, 5, 7): note(ev, 9, bar + k * E, E // 2, 54, 46)
            if i % 4 == 3: note(ev, 9, bar + 7 * E, E, 38, 60)  # 4마디마다 필
            if i % 8 == 0: note(ev, 9, bar, E * 2, 49, 60)      # 크래시

mk(100, lobby, 3, '/home/claude/bb/music/lobby.mid')
mk(128, play, 3, '/home/claude/bb/music/play.mid')
print('ok')
