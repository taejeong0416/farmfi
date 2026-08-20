import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeGrowthMonitoring, SENSOR_META } from "@/lib/growth-monitoring";
import { cropKeyFor, getCrop, luxToDli, LUX_TO_PPFD } from "@/lib/crop-profiles";
import type { IoTReading } from "@/lib/iot-health";
import { requireRole } from "@/lib/auth";

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

// 같은 종류의 경보를 매 판독마다 새로 쌓지 않는다. 이 시간 안에 같은 type의 미확인
// 알림이 있으면 이미 통지된 것으로 본다.
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

async function alertOnce(
  projectId: string,
  type: string,
  message: string
): Promise<boolean> {
  const recent = await prisma.notification.findFirst({
    where: {
      projectId,
      type,
      createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) return false;
  await prisma.notification.create({ data: { projectId, type, message } });
  return true;
}

export async function POST(request: NextRequest) {
  // 마일스톤 IoT 게이트(가동률·이상탐지)의 입력이 되는 데이터라 미인증 위조를 막는다.
  try {
    await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const lead = await prisma.inventory.findFirst({
      where: { projectId },
      orderBy: { growing: "desc" },
      select: { product: { select: { name: true, category: true } } },
    });
    const cropKey = cropKeyFor(lead?.product.name, lead?.product.category);
    const crop = getCrop(cropKey);

    // 새 판독 — 시드(iot-seed.ts)와 같은 운전점에서 생성해 계열이 이어지게 한다.
    const hour = new Date().getHours();
    const [tLo, tHi] = crop.healthyRanges.temperature;
    const [hLo, hHi] = crop.healthyRanges.humidity;
    const [pLo, pHi] = crop.healthyRanges.phLevel;
    const lit = hour >= 6 && hour < 22;
    const baseLux = (crop.dliTarget * 1e6) / (LUX_TO_PPFD * 3600 * 16);

    const temperature =
      (tLo + tHi) / 2 +
      Math.sin((hour / 24) * 2 * Math.PI) * 0.9 +
      (lit ? 0.4 : -0.4) +
      (Math.random() - 0.5) * 0.6;
    const humidity =
      (hLo + hHi) / 2 +
      Math.cos((hour / 24) * 2 * Math.PI) * 4 +
      (Math.random() - 0.5) * 3;
    const co2Level = (lit ? 900 : 1050) + (Math.random() - 0.5) * 120;
    const lightIntensity = lit ? baseLux * (0.97 + Math.random() * 0.06) : 0;
    const phLevel = (pLo + pHi) / 2 + (Math.random() - 0.5) * 0.3;

    // 생장 진행 — 이전 판독의 진행률에 그 스텝의 적산온도·광량 기여분을 더한다.
    const latest = await prisma.iotData.findFirst({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
    });
    const stepH = 0.5;
    const stepGdd = (Math.max(0, temperature - crop.baseTempC) * stepH) / 24;
    const lightFactor = Math.min(
      1,
      Math.max(0.3, (luxToDli(lightIntensity, 24) || 0) / crop.dliTarget)
    );
    const stepProgress = (stepGdd / crop.targetGdd) * 100 * lightFactor;
    const prev = latest?.growthRate ?? 0;
    const next = prev + stepProgress;
    const growthRate = next >= 100 ? next - 100 : next; // 수확 → 재정식

    const newData = await prisma.iotData.create({
      data: {
        projectId,
        temperature: Math.round(temperature * 10) / 10,
        humidity: Math.round(humidity * 10) / 10,
        co2Level: Math.round(co2Level),
        lightIntensity: Math.round(lightIntensity),
        phLevel: Math.round(phLevel * 100) / 100,
        growthRate: Math.round(growthRate * 10) / 10,
      },
    });

    // ── 판정: 새 판독을 포함한 최근 창을 모니터링 계층에 그대로 통과시킨다 ──
    // 화면과 알림이 같은 함수를 쓰지 않으면 "화면엔 빨간데 알림은 안 왔다"가 생긴다.
    // 드리프트·DLI는 긴 창이 필요하므로 14일을 본다.
    const windowStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recent = await prisma.iotData.findMany({
      where: { projectId, recordedAt: { gte: windowStart } },
      orderBy: { recordedAt: "asc" },
    });
    const readings: IoTReading[] = recent.map((d) => ({
      temperature: d.temperature,
      humidity: d.humidity,
      co2Level: d.co2Level,
      lightIntensity: d.lightIntensity,
      phLevel: d.phLevel,
    }));
    const analysis = analyzeGrowthMonitoring(
      readings,
      recent.map((d) => d.recordedAt),
      recent.map((d) => d.growthRate),
      cropKey
    );
    const point = analysis.points[analysis.points.length - 1];

    const updated = await prisma.iotData.update({
      where: { id: newData.id },
      data: {
        anomalyScore: point.anomalyScore,
        isAnomaly: point.isAnomaly,
      },
    });

    // ── 통지 ──────────────────────────────────────────────────────────────
    // Z-score만 알리면 지속성 고장이 통째로 빠진다. 히터가 죽어 내내 35℃면 그 값이
    // 곧 새 평균이 돼 Z는 안 뜨지만, 고장 게이트와 CUSUM은 뜬다. 세 경로를 다 잇는다.
    const alerts: string[] = [];

    if (point.outOfRange.length > 0) {
      const detail = point.outOfRange
        .map((s) => {
          const [lo, hi] = analysis.healthyRanges[s];
          return `${SENSOR_META[s].label} ${point[s]}${SENSOR_META[s].unit} (정상 ${lo}~${hi})`;
        })
        .join(", ");
      if (
        await alertOnce(
          projectId,
          "range_violation",
          `설비 이상 의심 · ${detail} — 현장 점검이 필요합니다`
        )
      ) {
        alerts.push("range_violation");
      }
    }

    for (const d of analysis.drift.filter((x) => x.detected)) {
      if (
        await alertOnce(
          projectId,
          `drift_${d.sensor}`,
          `${SENSOR_META[d.sensor].label} 지속 드리프트 · CUSUM ${d.maxStatistic}σ — 예지보전 점검 권고`
        )
      ) {
        alerts.push(`drift_${d.sensor}`);
      }
    }

    if (analysis.light.status === "under" || analysis.light.degrading) {
      if (
        await alertOnce(
          projectId,
          "dli_shortfall",
          `일적산광량 미달 · 목표의 ${analysis.light.ratioPct}% — ${analysis.light.degrading ? "LED 광량 열화 의심" : "광시간 상향 필요"}`
        )
      ) {
        alerts.push("dli_shortfall");
      }
    }

    if (point.isAnomaly) {
      const sensors =
        point.affectedSensors.map((s) => SENSOR_META[s].label).join(", ") ||
        "복합 패턴";
      if (
        await alertOnce(
          projectId,
          "anomaly_detected",
          `생육 이상 감지 · ${sensors} (이상 스코어 ${point.anomalyScore.toFixed(2)})`
        )
      ) {
        alerts.push("anomaly_detected");
      }
    }

    return NextResponse.json(
      serialize({
        data: updated,
        cropKey,
        anomaly: {
          detected: point.isAnomaly,
          score: point.anomalyScore,
          outOfRange: point.outOfRange,
          outOfOptimal: point.outOfOptimal,
        },
        light: analysis.light,
        harvest: analysis.harvest,
        alerts,
      })
    );
  } catch (error) {
    console.error("POST /api/iot/generate error:", error);
    return NextResponse.json(
      { error: "Failed to generate IoT data" },
      { status: 500 }
    );
  }
}
