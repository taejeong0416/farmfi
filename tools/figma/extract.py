"""design/*.fig → design/screens/<파일명>/<페이지>/<화면ID>.txt

각 줄이 노드 하나다: 종류·이름·절대좌표·크기, 그리고 텍스트면 내용·폰트·색,
도형이면 채움·테두리·radius. 화면을 코드로 옮길 때 이 파일을 보고 값을 읽는다.

    python tools/figma/extract.py            # design/*.fig 전부
    python tools/figma/extract.py web        # 이름에 web이 든 것만

zstandard 패키지가 필요하다: pip install zstandard
"""
import os
import re
import struct
import sys
import zipfile
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kiwi  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DESIGN = os.path.join(ROOT, 'design')


def load(fig_path):
    """`.fig`(zip) → nodeChanges 리스트."""
    with zipfile.ZipFile(fig_path) as z:
        canvas = z.read('canvas.fig')
    assert canvas[:8] == b'fig-kiwi', f'{fig_path}: fig-kiwi 헤더가 아님'

    off = 12  # magic 8 + version 4
    chunks = []
    while off + 4 <= len(canvas):
        n = struct.unpack('<I', canvas[off:off + 4])[0]
        raw = canvas[off + 4:off + 4 + n]
        off += 4 + n
        if raw[:4] == b'\x28\xb5\x2f\xfd':  # zstd
            import zstandard
            chunks.append(zstandard.ZstdDecompressor()
                          .decompress(raw, max_output_size=512 * 1024 * 1024))
        else:
            chunks.append(zlib.decompress(raw, -15))

    schema, data = chunks[0], chunks[1]
    return kiwi.Decoder(kiwi.parse_schema(schema)).decode(data)['nodeChanges']


def hexcolor(paints):
    for p in paints or []:
        if p.get('type') == 'SOLID' and p.get('visible', True):
            c = p['color']
            rgb = '#%02X%02X%02X' % tuple(round(c[k] * 255) for k in 'rgb')
            a = c.get('a', 1.0) * p.get('opacity', 1.0)
            return rgb if a > 0.99 else f'{rgb}@{a:.2f}'
    return None


def describe(n, x, y):
    sz = n.get('size') or {}
    parts = [f'{n.get("type")} "{n.get("name", "")}"',
             f'@{x:.0f},{y:.0f} {sz.get("x", 0):.0f}x{sz.get("y", 0):.0f}']
    if n.get('type') == 'TEXT':
        fn = n.get('fontName') or {}
        parts.append(f'text={(n.get("textData") or {}).get("characters", "")!r}')
        parts.append(f'{fn.get("family", "")} {fn.get("style", "")} {n.get("fontSize", 0):.0f}px')
        if c := hexcolor(n.get('fillPaints')):
            parts.append(c)
    else:
        if c := hexcolor(n.get('fillPaints')):
            parts.append(f'fill={c}')
        if s := hexcolor(n.get('strokePaints')):
            parts.append(f'stroke={s}/{n.get("strokeWeight", 0):.0f}')
        if r := n.get('cornerRadius'):
            parts.append(f'r={r:.0f}')
    return '  '.join(parts)


def dump(fig_path):
    nodes = load(fig_path)
    by_guid = {}
    children = {}
    for n in nodes:
        by_guid[(n['guid']['sessionID'], n['guid']['localID'])] = n
        if pi := n.get('parentIndex'):
            key = (pi['guid']['sessionID'], pi['guid']['localID'])
            children.setdefault(key, []).append((pi['position'], (n['guid']['sessionID'], n['guid']['localID'])))
    for v in children.values():
        v.sort()

    def walk(g, ox, oy, depth, out):
        n = by_guid[g]
        tr = n.get('transform') or {}
        x, y = ox + tr.get('m02', 0.0), oy + tr.get('m12', 0.0)
        if n.get('visible', True) is not False:
            out.append('  ' * depth + describe(n, x, y))
        for _, cg in children.get(g, []):
            walk(cg, x, y, depth + 1, out)

    pages = {(n['guid']['sessionID'], n['guid']['localID']): n['name']
             for n in nodes if n.get('type') == 'CANVAS'}

    base = os.path.join(DESIGN, 'screens', os.path.basename(fig_path)[:-4])
    index = []
    used = set()
    # 페이지 바로 아래 놓인 프레임·심볼이 화면(또는 컴포넌트) 하나다.
    for n in nodes:
        if n.get('type') not in ('FRAME', 'SYMBOL') or not n.get('parentIndex'):
            continue
        pi = n['parentIndex']['guid']
        page = pages.get((pi['sessionID'], pi['localID']))
        if page is None:
            continue
        out = []
        walk((n['guid']['sessionID'], n['guid']['localID']), 0, 0, 0, out)
        d = os.path.join(base, re.sub(r'[^\w.-]+', '_', page.split('·')[-1].strip()))
        os.makedirs(d, exist_ok=True)
        name = n.get('name', '')
        slug = re.sub(r'[^\w.-]+', '_', name.split('·')[0].strip()) or 'unnamed'
        path = os.path.join(d, slug + '.txt')
        i = 2
        while path in used:  # 같은 이름의 프레임이 여러 개인 경우
            path = os.path.join(d, f'{slug}-{i}.txt')
            i += 1
        used.add(path)
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(out))
        index.append((page, name, len(out), os.path.relpath(path, base).replace('\\', '/')))

    os.makedirs(base, exist_ok=True)
    with open(os.path.join(base, 'INDEX.md'), 'w', encoding='utf-8') as f:
        f.write('| 페이지 | 화면 | 노드 수 | 파일 |\n|---|---|---|---|\n')
        for page, name, cnt, rel in sorted(index):
            f.write(f'| {page} | {name} | {cnt} | `{rel}` |\n')
    return len(index)


if __name__ == '__main__':
    pattern = sys.argv[1] if len(sys.argv) > 1 else ''
    for fn in sorted(os.listdir(DESIGN)):
        if fn.endswith('.fig') and pattern in fn:
            print(f'{fn}: {dump(os.path.join(DESIGN, fn))} screens')
