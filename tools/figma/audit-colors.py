"""design/*.fig에서 팔레트 밖 색을 찾아 어느 화면에 몇 개인지 센다.

`docs/figma-color-map.md`의 치환표가 이 출력에서 나왔다. Figma가 갱신되면
다시 돌려 표를 맞춘다.

    python tools/figma/audit-colors.py
"""
import collections
import colorsys
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import DESIGN, hexcolor, load  # noqa: E402

# docs/build-plan.md 그라운드 룰의 팔레트
ALLOWED = {'#1A1A1A', '#4A4A4A', '#8A8A8A', '#E5E5E3', '#EDEDEB', '#F2F2F0',
           '#14542E', '#A34A3D', '#EAF6EE', '#FFFFFF', '#000000'}


def neutral(h):
    """무채색이거나 흰색에 가까우면 등급색일 리 없으니 세지 않는다."""
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    _, lightness, saturation = colorsys.rgb_to_hls(r, g, b)
    return saturation < 0.12 or lightness > 0.965


def scan(fig):
    nodes = load(os.path.join(DESIGN, fig))
    pages = {(n['guid']['sessionID'], n['guid']['localID']): n['name']
             for n in nodes if n.get('type') == 'CANVAS'}
    by_guid = {(n['guid']['sessionID'], n['guid']['localID']): n for n in nodes}

    def screen_of(node):
        for _ in range(40):
            pi = node.get('parentIndex')
            if not pi:
                return None
            key = (pi['guid']['sessionID'], pi['guid']['localID'])
            if key in pages:
                return node.get('name', '?')
            node = by_guid.get(key)
            if node is None:
                return None
        return None

    hits = collections.defaultdict(collections.Counter)
    for n in nodes:
        for kind in ('fillPaints', 'strokePaints'):
            c = hexcolor(n.get(kind))
            if not c:
                continue
            base = c.split('@')[0]
            if base in ALLOWED or neutral(base):
                continue
            screen = screen_of(n)
            if screen:
                role = 'text' if n.get('type') == 'TEXT' else ('stroke' if kind == 'strokePaints' else 'fill')
                hits[(base, role)][screen.split('·')[0].strip()] += 1
    return hits


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    for fig in sorted(f for f in os.listdir(DESIGN) if f.endswith('.fig')):
        print(f'=== {fig}')
        hits = scan(fig)
        for (color, role), screens in sorted(hits.items(), key=lambda k: -sum(k[1].values())):
            where = ', '.join(f'{s}×{c}' for s, c in screens.most_common(10))
            print(f'{color} {role:6s} {sum(screens.values()):4d}  {where}')
        print(f'-- 팔레트 밖 노드 {sum(sum(v.values()) for v in hits.values())}개')
