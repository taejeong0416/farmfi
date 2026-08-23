"""덤프에서 화면별 '고정 문구'를 뽑아 `tools/figma/labels.json`에 쓴다.

    python tools/figma/labels.py

숫자가 든 문구(금액·날짜·퍼센트)는 데이터에 따라 바뀌므로 뺀다. 남는 것은
화면에 반드시 있어야 할 라벨이고, `audit.mjs`가 이 목록을 렌더 결과와 대조한다.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = os.path.join(ROOT, "design", "screens", "farmfi-web")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "labels.json")

CORE = "_핵심_UI"
CONSOLE = "관리자_콘솔"
REST = "비핵심_UI_관리자_콘솔_제외_"

# 화면 ID → 덤프 파일. 한 화면이 두 프레임으로 나뉜 경우(모달·배경)는
# 내용이 있는 쪽을 쓴다.
SCREENS = {
    "C-01": f"{CORE}/C-01.txt", "C-02": f"{CORE}/C-02.txt",
    "C-03": f"{CORE}/C-03.txt", "C-04": f"{CORE}/C-04.txt",
    "C-I01": f"{CORE}/C-I01.txt", "C-I02": f"{CORE}/C-I02.txt",
    "C-I03": f"{CORE}/C-I03.txt", "C-I05": f"{CORE}/C-I05.txt",
    "I-01": f"{CORE}/I-01.txt", "I-02": f"{CORE}/I-02.txt",
    "I-03": f"{CORE}/I-03.txt", "I-04": f"{CORE}/I-04.txt",
    "I-05": f"{REST}/I-05.txt", "I-06": f"{CORE}/I-06.txt",
    "I-07": f"{CORE}/I-07.txt", "I-08": f"{CORE}/I-08.txt",
    "I-09": f"{REST}/I-09.txt", "I-10": f"{REST}/I-10.txt",
    "B-01": f"{CORE}/B-01.txt", "B-02": f"{CORE}/B-02.txt",
    "B-03": f"{CORE}/B-03.txt", "B-04": f"{CORE}/B-04.txt",
    "B-05": f"{CORE}/B-05.txt", "B-06": f"{CORE}/B-06.txt",
    "B-07": f"{CORE}/B-07.txt", "B-08": f"{REST}/B-08.txt",
    "B-09": f"{CORE}/B-09.txt",
    "O-01": f"{CORE}/O-01.txt", "O-02": f"{CORE}/O-02.txt",
    "O-03": f"{CORE}/O-03.txt", "O-04": f"{CORE}/O-04.txt",
    "O-05": f"{CORE}/O-05.txt", "O-06": f"{CORE}/O-06.txt",
    "O-07": f"{CORE}/O-07.txt", "O-08": f"{CORE}/O-08.txt",
    "O-09": f"{CORE}/O-09.txt", "O-10": f"{REST}/O-10.txt",
    "O-11": f"{REST}/O-11.txt", "O-11E": f"{REST}/O-11E.txt",
    "O-12": f"{REST}/O-12.txt", "O-13": f"{REST}/O-13.txt",
    "A-01": f"{CONSOLE}/A-01.txt", "A-02": f"{CONSOLE}/A-02.txt",
    "A-03": f"{CONSOLE}/A-03.txt", "A-04": f"{CONSOLE}/A-04.txt",
    "A-06": f"{CONSOLE}/A-06.txt", "A-07": f"{CONSOLE}/A-07.txt",
    "A-08": f"{CONSOLE}/A-08.txt", "A-09": f"{CONSOLE}/A-09.txt",
    "A-10": f"{CONSOLE}/A-10.txt", "A-11": f"{CONSOLE}/A-11.txt",
    "A-12": f"{CONSOLE}/A-12.txt", "A-13": f"{CONSOLE}/A-13.txt",
    "A-14": f"{CONSOLE}/A-14.txt", "A-15": f"{CONSOLE}/A-15.txt",
    "A-16": f"{CONSOLE}/A-16.txt",
}

TEXT = re.compile(r"text='(.*?)'\s+(\S+)\s+([A-Za-z ]+?)\s+(\d+)px")


def labels(path):
    out, seen = [], set()
    for line in open(path, encoding="utf-8"):
        m = TEXT.search(line)
        if not m:
            continue
        s = m.group(1).replace("\\n", " ").replace(" ", " ").strip()
        # 숫자가 들어간 문구는 데이터로 채워지므로 대조 대상이 아니다.
        if not s or len(s) < 2 or re.search(r"\d", s) or s in seen:
            continue
        seen.add(s)
        out.append({"text": s, "size": int(m.group(4)), "weight": m.group(3).strip()})
    return out


def main():
    data = {}
    for sid, rel in SCREENS.items():
        path = os.path.join(BASE, rel)
        if not os.path.exists(path):
            print(f"덤프 없음: {sid} {rel}", file=sys.stderr)
            continue
        data[sid] = labels(path)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print(f"화면 {len(data)} · 문구 {sum(len(v) for v in data.values())} → {OUT}")


if __name__ == "__main__":
    main()
