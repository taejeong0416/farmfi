/**
 * 공개 문서 PDF에 넣을 한글 폰트를 미리 줄인다.
 *
 * 왜 미리 줄이나 — pdf-lib의 `embedFont(..., { subset: true })`는 한글에서
 * 글리프를 대부분 떨어뜨린다("온천장 스마트팜 1호점"이 "트팜 1"로 나온다).
 * 그래서 런타임에는 subset을 끄고(subset: false) 폰트를 통째로 넣는데,
 * 원본 Pretendard가 2.7MB라 문서마다 그만큼이 따라붙는다.
 * 여기서 미리 필요한 글자만 남긴 폰트를 만들어 두면 둘 다 피할 수 있다.
 *
 * 실행: npm run fonts:subset  (원본 .ttf는 node_modules/pretendard에서 받는다)
 */
import fs from "node:fs/promises";
import path from "node:path";
import subsetFont from "subset-font";

/**
 * KS X 1001 한글 음절 2,350자.
 *
 * 유니코드 현대 한글은 11,172자지만 실제 한국어 표기에 쓰이는 음절은 이 2,350자에
 * 사실상 다 든다(나머지는 "숽" 같은 이론상 조합이다). 전체를 넣으면 폰트가 2.1MB로
 * 남아 줄인 의미가 없다.
 *
 * 별도 표를 들고 다니는 대신 EUC-KR 인코딩에서 되뽑는다 — KS X 1001의 한글 영역이
 * 곧 EUC-KR 0xB0A1~0xC8FE 이므로 그 바이트쌍을 디코드하면 정확히 그 집합이 나온다.
 */
function ksx1001Syllables() {
  const decoder = new TextDecoder("euc-kr");
  const out = new Set<string>();
  for (let hi = 0xb0; hi <= 0xc8; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      const ch = decoder.decode(new Uint8Array([hi, lo]));
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) out.add(ch);
    }
  }
  return [...out].join("");
}

const LATIN =
  " !\"#$%&'()*+,-./0123456789:;<=>?@" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`" +
  "abcdefghijklmnopqrstuvwxyz{|}~";

// 문서에 실제로 쓰는 기호들 — 가운뎃점·화살표·통화·단위·괄호류.
const SYMBOLS = "·—–…‘’“”₩％∼~《》〈〉「」『』△▲▽▼○●◇◆□■☆★→←↑↓↔㎡㎥℃%°±×÷≤≥≠";

const CHARSET = LATIN + SYMBOLS + ksx1001Syllables();

const SOURCES = [
  ["Pretendard-Regular.ttf", "Pretendard-Regular.subset.ttf"],
  ["Pretendard-Bold.ttf", "Pretendard-Bold.subset.ttf"],
] as const;

const SRC_DIR = path.join(
  process.cwd(),
  "node_modules",
  "pretendard",
  "dist",
  "public",
  "static",
  "alternative",
);
const OUT_DIR = path.join(process.cwd(), "public", "fonts");

for (const [src, out] of SOURCES) {
  const buf = await fs.readFile(path.join(SRC_DIR, src));
  const subset = await subsetFont(buf, CHARSET, { targetFormat: "truetype" });
  await fs.writeFile(path.join(OUT_DIR, out), subset);
  console.log(
    `${out}: ${(buf.length / 1024 / 1024).toFixed(2)}MB → ${(subset.length / 1024).toFixed(0)}KB`,
  );
}
