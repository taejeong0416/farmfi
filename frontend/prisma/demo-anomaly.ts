// 데모용 이상 판독 주입 스크립트.
//
// 시드(iot-seed.ts)는 12~18일차 냉방 드리프트, 30일차 펌프 막힘, 45일차~ LED 열화를
// 시간축에 심어 두지만 60일차(최신)는 정상 운전점이다. 앱 베드 화면과 웹 모니터링
// 타일은 **최신 판독 한 건**만 보므로, 그 상태로는 "이상일 때 화면이 어떻게 되는가"를
// 시연할 수 없다. 발표 직전에 최신 판독 하나를 고장 게이트 밖으로 밀어 넣고,
// 끝나면 되돌리기 위한 스크립트다.
//
//   npx tsx prisma/demo-anomaly.ts on   [projectId] [sensor]
//   npx tsx prisma/demo-anomaly.ts off  [projectId]
//
// projectId를 생략하면 재고가 있는 첫 매장을 쓴다. sensor는 temperature(기본)/co2Level/phLevel.
// 판정·알림은 /api/iot/generate와 같은 함수(analyzeGrowthMonitoring)를 통과시킨다 —
// 경로가 갈리면 "화면엔 빨간데 알림은 안 왔다"가 생긴다.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { analyzeGrowthMonitoring, SENSOR_META } from "../src/lib/growth-monitoring";
import { cropKeyFor } from "../src/lib/crop-profiles";
import type { IoTReading } from "../src/lib/iot-health";

const ALERT_TYPE = "range_violation";

// 고장 게이트 밖으로 확실히 밀어내는 값. 상한을 넘기는 쪽만 쓴다 —
// 하한 이탈(예: 온도 5℃)은 한여름 실내 매장에서 설득력이 떨어진다.
const OVERSHOOT: Record<string, number> = {
  temperature: 3.4, // 냉방 고장
  co2Level: 420, // 환기팬 정지
  phLevel: 0.9, // 양액 과산성
};

// 시드가 심어 둔 30일차 펌프 고장 알림도 같은 type을 쓴다. off가 그것까지 지우지
// 않도록, 주입한 알림은 문구가 정확히 일치하는 것만 골라 지운다.
function alertMessage(sensor: string, value: number, gate: [number, number]): string {
  const meta = SENSOR_META[sensor as keyof typeof SENSOR_META];
  return `설비 이상 의심 · ${meta.label} ${value}${meta.unit} (정상 ${gate[0]}~${gate[1]}) — 현장 점검이 필요합니다`;
}

async function pickProject(given?: string): Promise<string> {
  if (given) return given;
  const inv = await prisma.inventory.findFirst({
    orderBy: { growing: "desc" },
    select: { projectId: true },
  });
  if (!inv) throw new Error("재고가 있는 매장이 없다. projectId를 직접 넘겨라.");
  return inv.projectId;
}

async function on(projectId: string, sensor: string) {
  const prev = await prisma.iotData.findFirst({
    where: { projectId },
    orderBy: { recordedAt: "desc" },
  });
  if (!prev) throw new Error(`${projectId}에 IoT 판독이 없다. 먼저 시드를 돌려라.`);

  const lead = await prisma.inventory.findFirst({
    where: { projectId },
    orderBy: { growing: "desc" },
    select: { product: { select: { name: true, category: true } } },
  });
  const cropKey = cropKeyFor(lead?.product.name, lead?.product.category);

  // 게이트 상한을 알아야 얼마나 밀지 정할 수 있다. 판정기가 쓰는 범위를 그대로 읽는다.
  const gate = analyzeGrowthMonitoring([toReading(prev)], [prev.recordedAt], [prev.growthRate], cropKey)
    .healthyRanges[sensor as keyof IoTReading];
  if (!gate) throw new Error(`알 수 없는 센서: ${sensor}`);
  const value = round(gate[1] + OVERSHOOT[sensor], sensor === "co2Level" ? 0 : 1);

  const created = await prisma.iotData.create({
    data: {
      projectId,
      temperature: prev.temperature,
      humidity: prev.humidity,
      co2Level: prev.co2Level,
      lightIntensity: prev.lightIntensity,
      phLevel: prev.phLevel,
      ecLevel: prev.ecLevel,
      growthRate: prev.growthRate, // 생장 곡선은 건드리지 않는다
      [sensor]: value,
    },
  });

  // 새 판독을 포함한 창을 판정기에 통과시켜 anomalyScore·isAnomaly를 채운다.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recent = await prisma.iotData.findMany({
    where: { projectId, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
  });
  const analysis = analyzeGrowthMonitoring(
    recent.map(toReading),
    recent.map((d) => d.recordedAt),
    recent.map((d) => d.growthRate),
    cropKey
  );
  const point = analysis.points[analysis.points.length - 1];
  await prisma.iotData.update({
    where: { id: created.id },
    data: { anomalyScore: point.anomalyScore, isAnomaly: point.isAnomaly },
  });

  const meta = SENSOR_META[sensor as keyof typeof SENSOR_META];
  await prisma.notification.create({
    data: { projectId, type: ALERT_TYPE, message: alertMessage(sensor, value, gate) },
  });

  console.log(`주입 완료 — ${meta.label} ${value}${meta.unit} (게이트 ${gate[0]}~${gate[1]})`);
  console.log(`  판독 id ${created.id} · 이상스코어 ${point.anomalyScore.toFixed(2)}`);
  console.log(`  되돌리기: npx tsx prisma/demo-anomaly.ts off ${projectId}`);
}

async function off(projectId: string) {
  const latest = await prisma.iotData.findFirst({
    where: { projectId },
    orderBy: { recordedAt: "desc" },
  });
  if (!latest) throw new Error(`${projectId}에 IoT 판독이 없다.`);

  const lead = await prisma.inventory.findFirst({
    where: { projectId },
    orderBy: { growing: "desc" },
    select: { product: { select: { name: true, category: true } } },
  });
  const analysis = analyzeGrowthMonitoring(
    [toReading(latest)],
    [latest.recordedAt],
    [latest.growthRate],
    cropKeyFor(lead?.product.name, lead?.product.category)
  );
  const [sensor] = analysis.points[0].outOfRange;
  if (!sensor) {
    console.log("최신 판독이 이미 정상이다 — 지울 게 없다.");
    return;
  }

  await prisma.iotData.delete({ where: { id: latest.id } });
  const { count } = await prisma.notification.deleteMany({
    where: {
      projectId,
      type: ALERT_TYPE,
      message: alertMessage(sensor, latest[sensor], analysis.healthyRanges[sensor]),
    },
  });
  console.log(`판독 ${latest.id} 삭제 · 알림 ${count}건 삭제`);
}

function toReading(d: {
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
}): IoTReading {
  return {
    temperature: d.temperature,
    humidity: d.humidity,
    co2Level: d.co2Level,
    lightIntensity: d.lightIntensity,
    phLevel: d.phLevel,
  };
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

async function main() {
  const [mode, projectArg, sensorArg = "temperature"] = process.argv.slice(2);
  if (mode !== "on" && mode !== "off") {
    console.error("사용법: npx tsx prisma/demo-anomaly.ts on|off [projectId] [sensor]");
    process.exit(1);
  }
  const projectId = await pickProject(projectArg);
  if (mode === "on") await on(projectId, sensorArg);
  else await off(projectId);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
