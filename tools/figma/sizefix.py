"""geometry-report.json의 글자 크기 어긋남을 코드에 반영한다.

    node tools/figma/geometry.mjs     # 먼저 대조해 report를 만든다
    python tools/figma/sizefix.py            # 무엇을 고칠 수 있는지만 본다
    python tools/figma/sizefix.py --apply    # 실제로 고친다


판정이 하나로 정해지는 곳만 건드린다:
  - 그 문구가 `src/components` 전체에서 한 곳에만 있고
  - 그 줄이 속한 태그의 className에 `text-NN`이 정확히 하나 있을 때

둘 중 하나라도 어긋나면 손대지 않고 남긴다. 예전에 기계 대조로 43건을 잘못
고친 적이 있어, 애매하면 건드리지 않는 쪽을 기본으로 둔다.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "frontend", "src", "components")
REPORT = os.path.join(ROOT, "tools", "figma", "geometry-report.json")

APPLY = "--apply" in sys.argv

# 코드 파일 전부 읽어둔다
files = {}
for base, _, names in os.walk(SRC):
    for n in names:
        if n.endswith(".tsx"):
            p = os.path.join(base, n)
            files[p] = open(p, encoding="utf-8").read().split("\n")

pairs = []
for x in json.load(open(REPORT, encoding="utf-8")):
    for b in x["badSize"]:
        m = re.match(r"^(.*) (\d+)px → (\d+)px$", b)
        if m:
            pairs.append((m.group(1), int(m.group(2)), int(m.group(3))))

# 같은 문구가 여러 번 나오면 한 번만 본다
seen = set()
uniq = []
for t, got, want in pairs:
    if t in seen:
        continue
    seen.add(t)
    uniq.append((t, got, want))

CLASS = re.compile(r'className=\{?["`]([^"`]*)["`]')
TEXTN = re.compile(r"\btext-(\d+)\b")

changed = skipped = 0
skip_reasons = []
for text, got, want in uniq:
    hits = []
    for p, lines in files.items():
        for i, line in enumerate(lines):
            if text in line:
                hits.append((p, i))
    if len(hits) != 1:
        skipped += 1
        skip_reasons.append((text, f"{len(hits)}곳"))
        continue
    p, i = hits[0]
    lines = files[p]
    # 문구가 있는 줄부터 위로 6줄 안에서 className을 찾는다
    target = None
    for j in range(i, max(-1, i - 7), -1):
        m = CLASS.search(lines[j])
        if m:
            target = (j, m)
            break
    if not target:
        skipped += 1
        skip_reasons.append((text, "className 없음"))
        continue
    j, m = target
    sizes = TEXTN.findall(m.group(1))
    if len(sizes) != 1 or int(sizes[0]) != got:
        skipped += 1
        skip_reasons.append((text, f"text-* {len(sizes)}개"))
        continue
    lines[j] = lines[j].replace(f"text-{got}", f"text-{want}", 1)
    changed += 1

if APPLY:
    for p, lines in files.items():
        open(p, "w", encoding="utf-8").write("\n".join(lines))

print(f"{'고침' if APPLY else '고칠 수 있는 것'} {changed}건 · 남긴 것 {skipped}건 (대상 {len(uniq)})")
for t, why in skip_reasons[:15]:
    print(f"  남김: {t[:34]:<36} {why}")
