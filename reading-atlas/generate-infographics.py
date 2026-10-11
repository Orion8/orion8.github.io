#!/usr/bin/env python3
"""Generate the first three, bilingual, self-contained SVG book anatomy posters."""
from html import escape
from pathlib import Path

OUT = Path(__file__).with_name('infographics')
OUT.mkdir(exist_ok=True)
W, H = 1600, 2200
INK = '#18333d'
MUTED = '#667a78'
PAPER = '#f7f3e9'
WHITE = '#fffdf8'
RULE = '#d9dfd6'


class Poster:
    def __init__(self, accent, soft, lang):
        self.accent, self.soft, self.lang = accent, soft, lang
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} {H}" width="{W}" height="{H}" style="width:100%;height:auto;max-width:{W}px" role="img">',
                      f'<rect width="{W}" height="{H}" fill="{PAPER}"/>',
                      f'<path d="M0 0 H{W} V24 H0Z" fill="{accent}"/>',
                      '<defs><marker id="arr" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M1 1 11 6 1 11" fill="none" stroke="'+accent+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>']

    def rect(self, x, y, w, h, fill=WHITE, stroke='none', rx=24, sw=2):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def circle(self, x, y, r, fill, stroke='none', sw=2):
        self.parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def line(self, x1, y1, x2, y2, color=RULE, sw=2, dash='', arrow=False):
        extra = f' stroke-dasharray="{dash}"' if dash else ''
        extra += ' marker-end="url(#arr)"' if arrow else ''
        self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"{extra}/>')

    def path(self, d, color, sw=3, fill='none', arrow=False, dash=''):
        extra = ' marker-end="url(#arr)"' if arrow else ''
        extra += f' stroke-dasharray="{dash}"' if dash else ''
        self.parts.append(f'<path d="{d}" stroke="{color}" stroke-width="{sw}" fill="{fill}" stroke-linecap="round" stroke-linejoin="round"{extra}/>')

    def txt(self, x, y, value, size=28, color=INK, weight=400, anchor='start', family='sans', tracking=0):
        font = "Georgia, 'Times New Roman', serif" if family == 'serif' else "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', Arial, sans-serif"
        self.parts.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="{font}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" letter-spacing="{tracking}">{escape(value)}</text>')

    def lines(self, x, y, values, size=26, color=MUTED, leading=39, weight=400, anchor='start'):
        for i, value in enumerate(values):
            self.txt(x, y+i*leading, value, size, color, weight, anchor)

    def label(self, x, y, ko, en, size=19):
        self.txt(x, y, ko if self.lang == 'ko' else en, size, self.accent, 700, tracking=2)

    def section(self, y, n, ko, en):
        self.circle(108, y-10, 17, self.accent)
        self.txt(108, y-3, str(n), 18, WHITE, 700, 'middle')
        self.txt(139, y, ko if self.lang == 'ko' else en, 24, INK, 700, tracking=.5)
        self.line(90, y+24, 1510, y+24, RULE, 2)

    def base(self, index, title, translated, byline, question_ko, question_en):
        self.txt(92, 88, '독서 지형도   /   책 해부도' if self.lang == 'ko' else 'THE READING ATLAS   /   BOOK ANATOMY', 20, self.accent, 700, tracking=2.6)
        self.txt(1508, 88, f'{index:02} / 03', 22, self.accent, 700, 'end')
        self.txt(90, 208, title, 83 if len(title)<25 else 70, INK, 400, family='serif', tracking=-2)
        self.txt(94, 269, f'({translated})' if self.lang == 'ko' else byline, 29, MUTED, 400)
        self.txt(1508, 269, byline if self.lang == 'ko' else 'BOOK ANATOMY', 23, MUTED, 400, 'end')
        self.rect(90, 318, 1420, 132, self.soft, 'none', 20)
        self.rect(90, 318, 9, 132, self.accent, 'none', 0)
        self.label(130, 363, '이 책을 관통하는 질문', 'THE QUESTION')
        self.txt(130, 416, question_ko if self.lang == 'ko' else question_en, 34, INK, 500)

    def footer(self, prompt_ko, prompt_en, note_ko, note_en, source):
        self.rect(90, 2022, 1420, 116, INK, 'none', 18)
        self.txt(122, 2062, 'READ WITH THIS QUESTION' if self.lang == 'en' else '읽으며 붙잡을 질문', 19, '#c7ad81', 700, tracking=1.6)
        self.txt(122, 2111, prompt_ko if self.lang == 'ko' else prompt_en, 27, WHITE, 500)
        self.line(90, 2162, 1510, 2162, RULE, 2)
        self.txt(90, 2187, note_ko if self.lang == 'ko' else note_en, 16, MUTED)
        self.txt(1510, 2187, source, 16, MUTED, 400, 'end')

    def save(self, name):
        self.parts.append('</svg>')
        path = OUT / f'{name}-{self.lang}.svg'
        path.write_text('\n'.join(self.parts), encoding='utf-8')
        print(path)


def being_you(lang):
    p = Poster('#aa665c', '#f0e0d8', lang)
    p.base(1, 'Being You', '내가 된다는 것', 'Anil Seth · 2021',
           '의식적 경험과 ‘나’라는 감각은 어떻게 만들어질까?',
           'How do conscious experience and the sense of self arise?')
    p.section(517, 1, '책의 구조 · 네 부분', 'BOOK STRUCTURE · FOUR PARTS')
    parts = [
        ('01', 'LEVEL', '의식의 수준', 'Level of consciousness', '1–3'),
        ('02', 'CONTENT', '경험의 내용', 'What is experienced', '4–6'),
        ('03', 'SELF', '자아의 여러 층', 'Layers of selfhood', '7–11'),
        ('04', 'OTHER', '타자의 의식', 'Other minds', '12–13')]
    for i,(n,head,ko,en,ch) in enumerate(parts):
        x=90+i*360
        p.rect(x, 573, 340, 214, WHITE, RULE, 16)
        p.rect(x, 573, 340, 10, p.accent if i==2 else '#d7b4a5', 'none', 0)
        p.txt(x+24, 623, n, 28, p.accent, 700)
        p.txt(x+24, 665, ['수준','내용','자아','타자'][i] if lang=='ko' else head, 28, INK, 700, tracking=1)
        p.txt(x+24, 712, ko if lang=='ko' else en, 23, MUTED)
        p.txt(x+24, 759, f'{ch}장' if lang=='ko' else f'ch. {ch}', 18, '#8d9691')
    p.section(858, 2, '핵심 도식 · 예측하는 뇌, 살아 있는 몸', 'CORE MODEL · PREDICTIVE BRAIN, LIVING BODY')
    p.rect(90, 915, 1420, 585, '#fffaf3', RULE, 24)
    # Outer world, brain, body, and experienced world; directional flows.
    p.circle(800, 1210, 226, '#f4e2d8', '#d4a798', 3)
    p.circle(800, 1210, 151, WHITE, p.accent, 4)
    p.circle(800, 1210, 88, INK)
    p.txt(800, 1200, '경험' if lang=='ko' else 'EXPERIENCE', 20, '#d3dcd4', 700, 'middle', tracking=1)
    p.txt(800, 1240, '나' if lang=='ko' else 'YOU', 33, WHITE, 700, 'middle')
    p.rect(150, 1080, 330, 185, '#e4eeea', 'none', 20)
    p.txt(184, 1132, '외부 세계' if lang=='ko' else 'WORLD', 24, '#2a7777', 700)
    p.lines(184, 1185, ['빛 · 소리 · 사건', '감각 신호'] if lang=='ko' else ['Light · sound · events', 'Sensory signals'], 24, INK, 39)
    p.rect(1120, 1080, 330, 185, '#ebe5ef', 'none', 20)
    p.txt(1154, 1132, '몸' if lang=='ko' else 'BODY', 24, '#795a89', 700)
    p.lines(1154, 1185, ['심장 · 호흡 · 내부 상태', '살아 있음의 신호'] if lang=='ko' else ['Heart · breath · internal state', 'Signals of being alive'], 23, INK, 39)
    p.path('M480 1176 C555 1126 590 1112 634 1124', p.accent, 4, arrow=True)
    p.path('M1120 1176 C1040 1126 1010 1112 966 1124', p.accent, 4, arrow=True)
    p.txt(800, 1010, '뇌  /  예측 ↔ 오차' if lang=='ko' else 'BRAIN  /  PREDICTION ↔ ERROR', 21, p.accent, 700, 'middle', tracking=1)
    p.path('M744 1062 C600 966 930 938 858 1059', '#9d7770', 3, arrow=True)
    p.rect(315, 1362, 970, 98, WHITE, '#e0c8bb', 14)
    p.txt(800, 1405, '지각 = 예측과 감각의 지속적인 조율' if lang=='ko' else 'Perception = continual tuning of prediction and sensation', 26, INK, 600, 'middle')
    p.txt(800, 1440, '자아도 이 조율에 포함되는 몸 중심의 경험' if lang=='ko' else 'The self is an embodied part of this process', 21, MUTED, 400, 'middle')
    p.section(1570, 3, '무엇을 캐갈까 · 세 가지 관찰 렌즈', 'TAKEAWAYS · THREE LENSES')
    cards=[
        ('01', '지각은 수동적 복사가 아니다', 'Perception is active', ['뇌의 예측과 들어오는 감각이', '맞물려 ‘보이는 세계’를 이룬다.'], ['The brain’s predictions meet', 'incoming sensory signals.']),
        ('02', '자아는 몸과 연결된다', 'The self is embodied', ['내부 몸 상태와 생존 조절을', '자아 경험의 중심에 놓아 본다.'], ['Internal bodily states and regulation', 'shape the experience of self.']),
        ('03', '의식의 경계를 다시 묻는다', 'Question the boundary', ['동물과 기계의 경험을 논할 때', '행동만이 아닌 근거를 따져 본다.'], ['Ask what supports claims about', 'animal or machine experience.'])]
    for i,(n,ko,en,bodyko,bodyen) in enumerate(cards):
        x=90+i*480
        p.rect(x, 1627, 460, 345, WHITE, RULE, 17)
        p.circle(x+53, 1685, 25, '#f0e0d8')
        p.txt(x+53, 1694, n, 23, p.accent, 700, 'middle')
        title=ko if lang=='ko' else en
        p.txt(x+29, 1763, title, 26 if lang=='ko' else 27, INK, 700)
        p.lines(x+29, 1833, bodyko if lang=='ko' else bodyen, 23, MUTED, 38)
        p.line(x+29, 1928, x+431, 1928, '#e7e8df')
        p.txt(x+29, 1953, (['수준 → 내용','내용 → 자아','자아 → 타자'] if lang=='ko' else ['LEVEL → CONTENT','CONTENT → SELF','SELF → OTHER'])[i], 17, p.accent, 700, tracking=1)
    p.footer('내 경험의 어느 부분이 감각이고, 어느 부분이 예측일까?',
             'Which parts of my experience are sensation, and which prediction?',
             '독서용 재구성 · 도식은 저자의 이론을 단순화함',
             'Editorial reading map · diagram simplifies the author’s account',
             ('자료: Being You · anilseth.com' if lang=='ko' else 'Source: Being You · anilseth.com'))
    p.save('being-you')


def thinking(lang):
    p=Poster('#39847c', '#e0eee8', lang)
    p.base(2, 'Thinking in Systems', '시스템 사고', 'Donella H. Meadows · 2008',
           '사건 뒤에 숨어 있는 구조를 어떻게 읽고 바꿀까?',
           'How can we read and change the structure behind events?')
    p.section(517, 1, '책의 구조 · 세 부분', 'BOOK STRUCTURE · THREE PARTS')
    for i,(n,head,ko,en,subko,suben) in enumerate([
        ('I','STRUCTURE','구조와 행동','Structure & behavior','축적 · 흐름 · 되먹임','Stocks · flows · feedback'),
        ('II','SYSTEMS & US','시스템과 우리','Systems and us','함정 · 경계 · 관찰','Traps · boundaries · seeing'),
        ('III','CHANGE','변화 만들기','Creating change','개입 지점 · 태도','Leverage · ways of thinking')]):
        x=90+i*480
        p.rect(x, 573, 460, 214, WHITE, RULE, 16)
        p.txt(x+28, 629, n, 30, p.accent, 700)
        p.txt(x+70, 629, ['구조','시스템과 우리','변화'][i] if lang=='ko' else head, 25, INK, 700)
        p.txt(x+28, 700, ko if lang=='ko' else en, 28, INK, 600)
        p.txt(x+28, 753, subko if lang=='ko' else suben, 21, MUTED)
    p.section(858, 2, '핵심 도식 · 쌓이고, 흐르고, 되돌아온다', 'CORE MODEL · STOCK, FLOW, FEEDBACK')
    p.rect(90, 915, 1420, 585, '#f9fcf8', RULE, 24)
    # Stock and flow architecture.
    p.rect(575, 1072, 450, 218, '#d8ece3', p.accent, 20, 4)
    p.rect(575, 1200, 450, 90, '#8dc3af', 'none', 0)
    p.txt(800, 1140, '축적' if lang=='ko' else 'STOCK  /  ACCUMULATION', 30, INK, 700, 'middle')
    p.txt(800, 1190, '시간이 지나도 남는 양' if lang=='ko' else 'What remains over time', 24, INK, 400, 'middle')
    p.path('M195 1176 H560', p.accent, 6, arrow=True)
    p.path('M1040 1176 H1400', p.accent, 6, arrow=True)
    p.circle(355,1176,17,WHITE,p.accent,4)
    p.circle(1245,1176,17,WHITE,p.accent,4)
    p.txt(225, 1108, '유입  +' if lang=='ko' else 'INFLOW  +', 25, p.accent, 700)
    p.txt(1165, 1108, '유출  −' if lang=='ko' else 'OUTFLOW  −', 25, p.accent, 700)
    p.txt(225, 1234, '유입' if lang=='ko' else 'IN', 22, MUTED)
    p.txt(1358, 1234, '유출' if lang=='ko' else 'OUT', 22, MUTED, 'end')
    p.path('M975 1304 C1050 1432 1140 1454 1178 1380 C1245 1280 1225 1265 1245 1208', '#b58c58', 4, arrow=True)
    p.path('M650 1304 C580 1425 490 1450 424 1376 C350 1295 365 1260 355 1210', p.accent, 4, arrow=True)
    p.rect(1050, 1348, 290, 77, '#f3e7d3', 'none', 14)
    p.txt(1195, 1395, '균형 되먹임' if lang=='ko' else 'B  /  BALANCING', 22, '#8b6d41', 700, 'middle')
    p.rect(260, 1348, 290, 77, '#dcefe7', 'none', 14)
    p.txt(405, 1395, '강화 되먹임' if lang=='ko' else 'R  /  REINFORCING', 22, p.accent, 700, 'middle')
    p.txt(800, 1470, '지연(delay)이 있으면 개입의 결과가 늦게 나타난다' if lang=='ko' else 'Delays can hide the effects of a change', 23, MUTED, 400, 'middle')
    p.section(1570, 3, '개입의 사다리 · 어디를 바꿀까?', 'THE LEVERAGE LADDER · WHERE TO ACT?')
    stages=[
        ('01','숫자 조정','Change numbers','매개변수 · 예산 · 한도','Parameters · budgets · limits'),
        ('02','흐름 재설계','Redesign flows','정보 공개 · 되먹임 · 규칙','Information · feedback · rules'),
        ('03','목적 다시 묻기','Revisit the goal','시스템 목표 · 사고방식','Goals · mental models')]
    widths=[420,450,480]
    for i,(n,ko,en,detailko,detailen) in enumerate(stages):
        x=[90,535,1010][i]
        p.rect(x, 1650, widths[i], 188, ['#e9f0e9','#dcebe2','#c7dfd4'][i], 'none', 17)
        p.txt(x+24, 1699, n, 22, p.accent, 700)
        p.txt(x+24, 1753, ko if lang=='ko' else en, 28, INK, 700)
        p.txt(x+24, 1804, detailko if lang=='ko' else detailen, 21, MUTED)
        if i<2: p.path(f'M{x+widths[i]+5} 1743 h20',p.accent,3,arrow=True)
    p.rect(90, 1872, 1420, 107, WHITE, RULE, 14)
    p.txt(125, 1915, '실전 순서' if lang=='ko' else 'IN PRACTICE', 20, p.accent, 700)
    p.txt(125, 1950, '사건을 적고 → 축적·흐름을 그린 뒤 → 반복되는 되먹임과 지연을 찾는다' if lang=='ko' else 'Name the event → map stocks and flows → trace feedback and delays', 24, INK, 500)
    p.footer('내가 고치려는 ‘사건’을 반복해서 만들어내는 구조는 무엇일까?',
             'Which structure keeps producing the event I want to fix?',
             '독서용 재구성 · 개입 사다리는 12개 지점의 압축 요약',
             'Editorial reading map · leverage ladder condenses twelve points',
             ('자료: Chelsea Green · donellameadows.org' if lang=='ko' else 'Sources: Chelsea Green · donellameadows.org'))
    p.save('thinking-in-systems')


def infinity(lang):
    p=Poster('#605c9b', '#e7e5f1', lang)
    p.base(3, 'The Beginning of Infinity', '무한의 시작', 'David Deutsch · 2011',
           '좋은 설명은 어떻게 지식을 늘리고 진보를 가능하게 할까?',
           'How do good explanations grow knowledge and enable progress?')
    p.section(517, 1, '독서 경로 · 18장을 따라 읽는 세 갈래', 'READING ROUTE · THREE THREADS ACROSS 18 CHAPTERS')
    route=[
        ('01–08','설명의 토대','Foundations of explanation','실재 · 오류 교정 · 지식','Reality · error correction · knowledge'),
        ('09–16','아이디어의 도달 범위','The reach of ideas','미학 · 문화 · 보편성','Aesthetics · culture · universality'),
        ('17–18','미래와 진보','Future and progress','창조 · 열린 문제','Creation · open problems')]
    for i,(ch,ko,en,bodyko,bodyen) in enumerate(route):
        x=90+i*480
        p.rect(x, 573, 460, 214, WHITE, RULE, 16)
        p.txt(x+26, 626, ch+'장' if lang=='ko' else 'CH '+ch, 24, p.accent, 700, tracking=1)
        p.txt(x+26, 697, ko if lang=='ko' else en, 25, INK, 700)
        p.txt(x+26, 753, bodyko if lang=='ko' else bodyen, 21, MUTED)
    p.section(858, 2, '핵심 도식 · 끝나지 않는 설명의 개선', 'CORE MODEL · AN OPEN-ENDED KNOWLEDGE CYCLE')
    p.rect(90, 915, 1420, 585, '#faf9fe', RULE, 24)
    # Four-phase cycle with a visible upward trajectory and critiques.
    coords=[(278,1120),(630,1045),(1030,1102),(1270,1312)]
    for i,(x,y) in enumerate(coords):
        p.circle(x,y,91,['#dcd9ee','#cdc9e5','#b8b5d8','#9e9ac7'][i],p.accent,3)
        p.txt(x,y-8,f'{i+1:02}',25,p.accent,700,'middle')
        title=[('문제','PROBLEM'),('추측','CONJECTURE'),('비판·검증','CRITICISM'),('개선된 설명','BETTER EXPLANATION')][i]
        p.txt(x,y+32,title[0] if lang=='ko' else title[1],18 if i==3 and lang=='en' else 21,INK,700,'middle')
    p.path('M370 1104 C435 1075 480 1057 532 1050',p.accent,4,arrow=True)
    p.path('M724 1050 C810 1050 860 1070 930 1090',p.accent,4,arrow=True)
    p.path('M1123 1132 C1184 1170 1207 1203 1230 1222',p.accent,4,arrow=True)
    p.path('M1260 1410 C990 1530 420 1460 286 1234',p.accent,4,arrow=True)
    p.rect(490, 1237, 578, 135, WHITE, '#d8d3e9', 18)
    p.txt(779, 1292, '좋은 설명' if lang=='ko' else 'GOOD EXPLANATION', 22, p.accent, 700, 'middle', tracking=1)
    p.txt(779, 1342, '핵심을 멋대로 바꾸기 어렵다' if lang=='ko' else 'Hard to vary while solving the same problem', 22, INK, 600, 'middle')
    p.txt(800, 1461, '새 설명은 새 문제를 드러낸다  ↗' if lang=='ko' else 'Each improvement reveals new problems  ↗', 23, MUTED, 400, 'middle')
    p.section(1570, 3, '무엇을 캐갈까 · 사고의 세 가지 도구', 'TAKEAWAYS · THREE THINKING TOOLS')
    cards=[
        ('01', '설명의 질을 묻기', 'Test the explanation', ['같은 결과를 내면서 설명의 핵심을', '마음대로 바꿀 수 있는가?'], ['Can the core be freely changed', 'while still explaining the result?']),
        ('02', '비판을 반갑게 받기', 'Invite criticism', ['틀릴 수 있는 부분을 찾아야', '설명이 개선될 길이 열린다.'], ['Search for errors so an idea', 'has a path to improvement.']),
        ('03', '가능성과 지식을 구분', 'Separate limits from gaps', ['물리적으로 불가능한 일과 아직', '방법을 모르는 일을 구분한다.'], ['Distinguish a physical limit', 'from knowledge we do not yet have.'])]
    for i,(n,ko,en,bodyko,bodyen) in enumerate(cards):
        x=90+i*480
        p.rect(x, 1627, 460, 345, WHITE, RULE, 17)
        p.circle(x+53, 1685, 25, '#e7e5f1')
        p.txt(x+53, 1694, n, 23, p.accent, 700, 'middle')
        p.txt(x+29, 1763, ko if lang=='ko' else en, 25, INK, 700)
        p.lines(x+29, 1833, bodyko if lang=='ko' else bodyen, 23, MUTED, 38)
        p.line(x+29, 1928, x+431, 1928, '#e7e8df')
        p.txt(x+29, 1953, (['설명','오류 교정','열린 미래'] if lang=='ko' else ['EXPLANATION','ERROR CORRECTION','OPEN FUTURE'])[i], 17, p.accent, 700, tracking=1)
    p.footer('지금의 문제에서 “아직 모르는 것”은 정확히 무엇인가?',
             'What, exactly, do we not yet know about this problem?',
             '독서용 재구성 · 세 갈래는 공식 목차의 편집상 묶음',
             'Editorial reading map · three threads are an editorial grouping',
             ('자료: The Beginning of Infinity · 공식 발췌' if lang=='ko' else 'Source: The Beginning of Infinity · official excerpt'))
    p.save('beginning-of-infinity')


for language in ('ko','en'):
    being_you(language)
    thinking(language)
    infinity(language)
