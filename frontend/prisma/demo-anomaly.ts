// 데모용 이상 판독 주입 스크립트.
//
// 시드(iot-seed.ts)는 12~18일차 냉방 드리프트, 30일차 펌프 막힘, 45일차~ LED 열화를
// 시간축에 심어 두지만 60일차(최신)는 정상 운전점이다. 앱 베드 화면과 웹 모니터링
// 타일은 **최신 판독 한 건**만 보므로, 그 상태로는 "이상일 때 화면이 어떻게 되는가"를
// 시연할 수 없다. 발표 직전에 최신 판독 하나를 밀어 넣고, 끝나면 되돌리기 위한 스크립트다.
//
//   npx tsx prisma/demo-anomaly.ts on   [projectId] [preset]
//   npx tsx prisma/demo-anomaly.ts off  [projectId]
//
// projectId를 생략하면 재고가 있는 첫 매장을 쓴다. preset은
//   mix(기본)  온도=주의 · CO₂=위험 · 나머지 정상 — 세 등급이 한 화면에 같이 뜬다
//   warn       온도만 주의
//   critical   온도만 위험
//
// 등급은 화면과 같은 두 범위로 정한다 — 최적대(optimalRanges)를 벗어나면 주의,
// 고장 게이트(healthyRanges)까지 뚫으면 위험. 판정·알림은 /api/iot/generate와 같은
// analyzeGrowthMonitoring을 통과시킨다. 경로가 갈리면 "화면엔 빨간데 알림은 안 왔다"가 생긴다.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { analyzeGrowthMonitoring, SENSOR_META } from "../src/lib/growth-monitoring";
import { cropKeyFor } from "../src/lib/crop-profiles";
import type { IoTReading } from "../src/lib/iot-health";

const ALERT_TYPE = "range_violation";

type Tier = "warn" | "critical";
type Preset = Record<string, Tier>;

const PRESETS: Record<string, Preset> = {
  mix: { temperature: "warn", co2Level: "critical" },
  warn: { temperature: "warn" },
  critical: { temperature: "critical" },
};

// 주의는 최적대 상한과 게이트 상한의 한가운데 — 어느 쪽에도 붙지 않아 등급이 흔들리지 않는다.
// 위험은 게이트 상한에서 폭의 15%만 넘긴다. 더 밀면 설득력 없는 숫자가 된다.
function target(tier: Tier, gate: [number, number], optimal: [number, number]): number {
  return tier === "warn"
    ? (optimal[1] + gate[1]) / 2
    : gate[1] + (gate[1] - gate[0]) * 0.15;
}

// 시드가 심어 둔 30일차 펌프 고장 알림도 같은 type을 쓴다. off가 그것까지 지우지
// 않도록, 주입한 알림은 문구가 정확히 일치하는 것만 골라 지운다.
function alertMessage(sensor: string, value: number, gate: [number, number]): string {
  const meta = SENSOR_META[sensor as keyof typeof SENSOR_META];
  return `설비 이상 의심 · ${meta.label} ${value}${meta.unit} (정상 ${gate[0]}~${gate[1]}) — 현장 점검이 필요합니다`;
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

async function cropKeyOf(projectId: string): Promise<string> {
  const lead = await prisma.inventory.findFirst({
    where: { projectId },
    orderBy: { growing: "desc" },
    select: { product: { select: { name: true, category: true } } },
  });
  return cropKeyFor(lead?.product.name, lead?.product.category);
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

async function on(projectId: string, presetName: string) {
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(`알 수 없는 preset: ${presetName} (${Object.keys(PRESETS).join(" · ")})`);
  }

  const prev = await prisma.iotData.findFirst({
    where: { projectId },
    orderBy: { recordedAt: "desc" },
  });
  if (!prev) throw new Error(`${projectId}에 IoT 판독이 없다. 먼저 시드를 돌려라.`);

  const cropKey = await cropKeyOf(projectId);
  const base = analyzeGrowthMonitoring(
    [toReading(prev)],
    [prev.recordedAt],
    [prev.growthRate],
    cropKey
  );

  const values: Record<string, number> = {};
  for (const [sensor, tier] of Object.entries(preset)) {
    const gate = base.healthyRanges[sensor as keyof IoTReading];
    const optimal = base.optimalRanges[sensor as keyof IoTReading];
    if (!gate || !optimal) throw new Error(`알 수 없는 센서: ${sensor}`);
    const digits = sensor === "co2Level" ? 0 : 1;
    values[sensor] = round(target(tier, gate, optimal), digits);
  }

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
      ...values,
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

  // 알림은 게이트를 뚫은 센서에만 붙는다 — 주의는 화면 색으로만 말한다.
  for (const sensor of point.outOfRange) {
    await prisma.notification.create({
      data: {
        projectId,
        type: ALERT_TYPE,
        message: alertMessage(sensor, point[sensor], analysis.healthyRanges[sensor]),
      },
    });
  }

  console.log(`주입 완료 — preset ${presetName} · 이상스코어 ${point.anomalyScore.toFixed(2)}`);
  for (const [sensor, tier] of Object.entries(preset)) {
    const meta = SENSOR_META[sensor as keyof typeof SENSOR_META];
    const gate = analysis.healthyRanges[sensor as keyof IoTReading];
    const optimal = analysis.optimalRanges[sensor as keyof IoTReading];
    console.log(
      `  ${meta.label} ${values[sensor]}${meta.unit} → ${tier === "warn" ? "주의" : "위험"}` +
        ` (최적 ${optimal[0]}~${optimal[1]} · 게이트 ${gate[0]}~${gate[1]})`
    );
  }
  console.log(`  되돌리기: npx tsx prisma/demo-anomaly.ts off ${projectId}`);
}

async function off(projectId: string) {
  const latest = await prisma.iotData.findFirst({
    where: { projectId },
    orderBy: { recordedAt: "desc" },
  });
  if (!latest) throw new Error(`${projectId}에 IoT 판독이 없다.`);

  const analysis = analyzeGrowthMonitoring(
    [toReading(latest)],
    [latest.recordedAt],
    [latest.growthRate],
    await cropKeyOf(projectId)
  );
  const point = analysis.points[0];
  if (point.outOfRange.length === 0 && point.outOfOptimal.length === 0) {
    console.log("최신 판독이 이미 정상이다 — 지울 게 없다.");
    return;
  }

  await prisma.iotData.delete({ where: { id: latest.id } });
  let removed = 0;
  for (const sensor of point.outOfRange) {
    const { count } = await prisma.notification.deleteMany({
      where: {
        projectId,
        type: ALERT_TYPE,
        message: alertMessage(sensor, point[sensor], analysis.healthyRanges[sensor]),
      },
    });
    removed += count;
  }
  console.log(`판독 ${latest.id} 삭제 · 알림 ${removed}건 삭제`);
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

async function main() {
  const [mode, projectArg, presetArg = "mix"] = process.argv.slice(2);
  if (mode !== "on" && mode !== "off") {
    console.error("사용법: npx tsx prisma/demo-anomaly.ts on|off [projectId] [preset]");
    process.exit(1);
  }
  const projectId = await pickProject(projectArg);
  if (mode === "on") await on(projectId, presetArg);
  else await off(projectId);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
