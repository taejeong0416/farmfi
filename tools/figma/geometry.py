"""덤프에서 화면별 '문구 + 좌표 + 글자 크기'를 뽑아 `tools/figma/geometry.json`에 쓴다.

    python tools/figma/geometry.py

`labels.py`가 "문구가 있는가"를 보는 것과 달리 여기서는 "어디에, 얼마나 크게"를 담는다.
좌표는 화면 프레임 왼쪽 위를 원점으로 한 상대값이다 — 캔버스 절대좌표는 화면마다
달라 브라우저와 맞출 수 없다.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(ROOT, "design", "screens", "farmfi-web")
OUT = os.path.join(HERE, "geometry.json")

sys.path.insert(0, HERE)
from labels import SCREENS  # noqa: E402

BOX = re.compile(r"@(-?\d+),(-?\d+)\s+(\d+)x(\d+)")
TEXT = re.compile(r"text='(.*?)'\s+(\S+)\s+([A-Za-z ]+?)\s+(\d+)px")


def nodes(path):
    """(원점, 텍스트 노드 목록). 첫 줄이 화면 프레임이고 그게 원점이다."""
    lines = open(path, encoding="utf-8").read().splitlines()
    if not lines:
        return None, []
    head = BOX.search(lines[0])
    if not head:
        return None, []
    ox, oy = int(head.group(1)), int(head.group(2))
    frame_w, frame_h = int(head.group(3)), int(head.group(4))

    out = []
    for line in lines:
        m = TEXT.search(line)
        b = BOX.search(line)
        if not m or not b:
            continue
        s = m.group(1).replace("\\n", " ").replace(" ", " ").strip()
        # 숫자가 든 문구는 데이터라 화면마다 값이 달라 위치 대조에 못 쓴다.
        if not s or len(s) < 2 or re.search(r"\d", s):
            continue
        out.append(
            {
                "text": s,
                "x": int(b.group(1)) - ox,
                "y": int(b.group(2)) - oy,
                "w": int(b.group(3)),
                "h": int(b.group(4)),
                "size": int(m.group(4)),
                "weight": m.group(3).strip(),
            }
        )

    # 같은 문구가 여러 번 나오면 좌표를 하나로 정할 수 없다. 빼고 센다.
    seen = {}
    for n in out:
        seen[n["text"]] = seen.get(n["text"], 0) + 1
    return {"w": frame_w, "h": frame_h}, [n for n in out if seen[n["text"]] == 1]


def pick(rel):
    """같은 화면이 두 프레임으로 갈린 경우(모달·배경) 1440 폭 쪽이 화면 전체다.

    카드만 담긴 프레임을 쓰면 원점이 카드 왼쪽 위가 되어, 화면 안에서 카드가
    어디 놓였는지가 통째로 빠진다 — 좌표 대조가 그만큼 어긋난다.
    """
    base = os.path.join(BASE, rel)
    alt = base[:-4] + "-2.txt"
    for path in (alt, base):
        if not os.path.exists(path):
            continue
        frame, ns = nodes(path)
        if frame and frame["w"] == 1440 and ns:
            return path
    return base


def main():
    data = {}
    for sid, rel in SCREENS.items():
        path = pick(rel)
        if not os.path.exists(path):
            continue
        frame, ns = nodes(path)
        if frame is None or not ns:
            continue
        data[sid] = {"frame": frame, "nodes": ns, "dump": os.path.relpath(path, BASE).replace("\\", "/")}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print(f"화면 {len(data)} · 좌표 있는 문구 {sum(len(v['nodes']) for v in data.values())} → {OUT}")


if __name__ == "__main__":
    main()
