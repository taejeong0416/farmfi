// 스마트팜코리아 정형 데이터셋(long 포맷, EUC-KR CSV) → 어댑터 wide JSON 변환기
// 사용: node prisma/convert-sfk.mjs <원본CSV경로> [농가id] [슬라이스건수]
// 다운로드(로그인 불요 확인됨):
//   GET https://www.smartfarmkorea.net/structuredDataset/fileDownload.do?type=ent&fileName=<파일명>
//   파일명은 enterpriseDataView.do(POST dtaSn=N)의 fn_filedown에서 확인.
// CSV 컬럼(0-base): 0=수집일자 2=농가id 7=장비코드 12=측정값 — ASCII만 사용하므로
// EUC-KR 한글 컬럼을 디코딩하지 않고 latin1로 읽어도 안전하다.
import fs from "node:fs";
import readline from "node:readline";

const CODE_MAP = {
  "FG-EI-TI": "innerTemp", // 내부온도
  "FG-EI-HI": "innerHum", // 내부습도
  "FG-EI-CI": "co2", // 내부CO2
  "FG-EI-IS": "lightIntensity", // 내부일사량(W/m²) — lux 아님, 도메인 주석 참조
  "FG-EL-PL": "ph", // 토양pH
};

const [src, farm = "NSG098_01", sliceN = "336"] = process.argv.slice(2);
if (!src) {
  console.error("사용: node prisma/convert-sfk.mjs <CSV경로> [농가id] [슬라이스건수]");
  process.exit(1);
}

const rl = readline.createInterface({
  input: fs.createReadStream(src, { encoding: "latin1" }),
});
const byTs = new Map();
rl.on("line", (line) => {
  const c = line.split(",");
  if (c.length < 13 || c[2] !== farm) return;
  const field = CODE_MAP[c[7]];
  if (!field) return;
  const v = parseFloat(c[12]);
  if (!isFinite(v)) return;
  if (!byTs.has(c[0])) byTs.set(c[0], {});
  byTs.get(c[0])[field] = v;
});
rl.on("close", () => {
  const recs = [...byTs.entries()]
    .filter(([, r]) => Object.keys(r).length === Object.keys(CODE_MAP).length)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ts, r]) => ({ measDt: ts.replace(" ", "T") + "+09:00", ...r }));
  const slice = recs.slice(-Number(sliceN));
  fs.writeFileSync("prisma/opendata-real.json", JSON.stringify(slice, null, 1));
  console.log(
    `완전 레코드 ${recs.length}건 중 최근 ${slice.length}건 저장 → prisma/opendata-real.json`
  );
});
