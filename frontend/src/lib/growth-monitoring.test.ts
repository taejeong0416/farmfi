// 생육 모니터링 회귀 테스트 — 실행: npm test
//
// 지키는 것은 숫자가 아니라 **불변식**이다. 재배 파라미터는 실측이 들어오면 바뀌지만,
// 아래가 깨지면 화면이 고장을 정상이라 하거나 정상 운영을 고장이라 한다.
//   ① 시드는 탐지기가 잡을 현상을 실제로 담는다 (드리프트·게이트 위반·광량 열화)
//   ② 광량 판정은 점등 스케줄에 좌우되지 않는다 — 심야 점등도 정상이어야 한다
//   ③ 고장 게이트는 농학 최적대보다 넓다 — 두 등급이 뒤집히면 안 된다
//   ④ 광량이 모자라면 수확 예정일이 뒤로 밀린다

import test from "node:test";
import assert from "node:assert/strict";

import { buildIotRecords } from "./iot-seed";
import { analyzeGrowthMonitoring } from "./growth-monitoring";
import { faultRanges, getCrop, luxToDli } from "./crop-profiles";
import { isHealthy, HEALTHY_RANGES } from "./iot-health";

const NOW = new Date("2026-08-01T00:00:00.000Z");

function analyze(
  projectId: string,
  opts: Parameters<typeof buildIotRecords>[2] = {}
) {
  const records = buildIotRecords(projectId, NOW, opts);
  return analyzeGrowthMonitoring(
    records.map((r) => ({
      temperature: r.temperature,
      humidity: r.humidity,
      co2Level: r.co2Level,
      lightIntensity: r.lightIntensity,
      phLevel: r.phLevel,
    })),
    records.map((r) => r.recordedAt),
    records.map((r) => r.growthRate),
    opts.cropKey
  );
}

// ── ③ 밴드 서열 ─────────────────────────────────────────────────────────────
test("고장 게이트는 어떤 센서에서도 농학 최적대를 포함한다", () => {
  for (const key of ["leafy", "basil", "cherryTomato", "microgreen"]) {
    const optimal = getCrop(key).healthyRanges;
    const gate = faultRanges(key);
    for (const sensor of Object.keys(optimal) as (keyof typeof optimal)[]) {
      assert.ok(
        gate[sensor][0] <= optimal[sensor][0] && gate[sensor][1] >= optimal[sensor][1],
        `${key}.${sensor} 게이트가 최적대를 못 감싼다`
      );
    }
  }
});

test("최적대 안의 판독은 고장 게이트도 반드시 통과한다", () => {
  const crop = getCrop("leafy");
  const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
  assert.equal(
    isHealthy({
      temperature: mid(crop.healthyRanges.temperature),
      humidity: mid(crop.healthyRanges.humidity),
      co2Level: mid(crop.healthyRanges.co2Level),
      lightIntensity: mid(crop.healthyRanges.lightIntensity),
      phLevel: mid(crop.healthyRanges.phLevel),
    }),
    true
  );
});

test("HEALTHY_RANGES는 crop-profiles에서 파생된다 — 기준이 두 벌이면 안 된다", () => {
  assert.deepEqual(HEALTHY_RANGES, faultRanges("leafy"));
});

// ── ① 시드가 담은 현상 ───────────────────────────────────────────────────────
test("시나리오 시드는 CUSUM이 잡을 온도 드리프트를 담는다", () => {
  const result = analyze("pilot-site", { cropKey: "leafy", scenario: true });
  const temp = result.drift.find((d) => d.sensor === "temperature");
  assert.ok(temp, "온도 드리프트 항목이 없다");
  assert.equal(temp!.detected, true, "심어둔 냉방 저하를 CUSUM이 못 잡았다");
  assert.ok(temp!.detectedAt, "드리프트 시작 시점을 특정하지 못했다");
});

test("무고장 시드는 드리프트를 만들지 않는다 — 탐지기가 노이즈에 발화하면 안 된다", () => {
  const result = analyze("clean-site", { cropKey: "leafy", scenario: false });
  assert.equal(
    result.summary.driftSensors.length,
    0,
    `무고장 계열에서 드리프트 오탐: ${result.summary.driftSensors.join(", ")}`
  );
});

test("펌프 막힘은 고장 게이트를 뚫어 가동률을 떨어뜨린다", () => {
  const dirty = analyze("pilot-site", { cropKey: "leafy", scenario: true });
  const clean = analyze("pilot-site", { cropKey: "leafy", scenario: false });
  const phFault = dirty.points.filter((p) => p.outOfRange.includes("phLevel"));
  assert.ok(phFault.length > 0, "심어둔 pH 사고가 게이트에 안 걸렸다");
  assert.ok(
    dirty.summary.uptimeRate < clean.summary.uptimeRate,
    "고장이 가동률에 반영되지 않았다"
  );
});

test("냉방 저하는 최적대만 벗어나고 고장 게이트는 넘지 않는다 — 등급이 갈린다", () => {
  const result = analyze("pilot-site", { cropKey: "leafy", scenario: true });
  const tempSuboptimal = result.points.filter((p) =>
    p.outOfOptimal.includes("temperature")
  );
  const tempFault = result.points.filter((p) => p.outOfRange.includes("temperature"));
  assert.ok(tempSuboptimal.length > 0, "온도 최적대 이탈이 안 잡혔다");
  assert.equal(tempFault.length, 0, "제어 편차가 설비 고장으로 오분류됐다");
});

// ── ② 스케줄 독립성 ─────────────────────────────────────────────────────────
test("일적산광량 판정은 점등 시간대에 좌우되지 않는다", () => {
  const conventional = analyze("site-a", {
    cropKey: "leafy",
    schedule: "conventional",
    scenario: false,
  });
  const tou = analyze("site-a", {
    cropKey: "leafy",
    schedule: "tou-optimized",
    scenario: false,
  });
  // 최적화가 광주기를 심야로 옮겨도 하루 총 광량은 같다 — 이것이 시간대 요금
  // 최적화를 농학적으로 정당화하는 근거이자, 순간값 게이트를 버린 이유다.
  assert.ok(
    Math.abs(conventional.light.ratioPct - tou.light.ratioPct) < 5,
    `스케줄에 따라 DLI 판정이 갈렸다: ${conventional.light.ratioPct}% vs ${tou.light.ratioPct}%`
  );
  assert.equal(conventional.light.status, "ok");
  assert.equal(tou.light.status, "ok");
});

test("심야 점등은 어떤 판독도 광량 고장으로 분류하지 않는다", () => {
  const tou = analyze("site-a", {
    cropKey: "leafy",
    schedule: "tou-optimized",
    scenario: false,
  });
  const lightFault = tou.points.filter((p) => p.outOfRange.includes("lightIntensity"));
  assert.equal(lightFault.length, 0, "정상적인 심야 점등이 과조도로 오탐됐다");
});

test("광량은 순간값 최적대 판정 대상에서 제외된다", () => {
  const result = analyze("site-a", { cropKey: "leafy", scenario: false });
  assert.ok(
    result.points.every((p) => !p.outOfOptimal.includes("lightIntensity")),
    "광량이 순간값으로 최적대 판정을 받고 있다"
  );
});

// ── ①·④ LED 열화와 수확 지연 ───────────────────────────────────────────────
test("LED 열화는 순간 조도 게이트를 못 잡고 DLI만 잡는다", () => {
  const result = analyze("pilot-site", { cropKey: "leafy", scenario: true });
  const luxFault = result.points.filter((p) => p.outOfRange.includes("lightIntensity"));
  assert.equal(luxFault.length, 0, "열화가 절대 상한에 걸렸다면 시드가 비현실적이다");
  assert.ok(result.light.degrading, "DLI 추세가 광량 열화를 못 잡았다");
  assert.ok(result.light.trendPerDay < 0, "DLI 추세 기울기가 음수가 아니다");
});

test("광량이 모자라면 수확 예정일이 표준 사이클보다 밀린다", () => {
  const degraded = analyze("pilot-site", { cropKey: "leafy", scenario: true });
  const clean = analyze("pilot-site", { cropKey: "leafy", scenario: false });
  assert.ok(degraded.harvest.daysRemaining != null);
  assert.ok(clean.harvest.daysRemaining != null);
  assert.ok(
    (degraded.harvest.delayDays ?? 0) > (clean.harvest.delayDays ?? 0),
    "광량 열화가 수확 예측에 반영되지 않았다"
  );
});

test("수확 예측은 현 사이클만 적산한다 — 60일치를 통째로 더하면 안 된다", () => {
  const result = analyze("clean-site", { cropKey: "leafy", scenario: false });
  const crop = getCrop("leafy");
  assert.ok(
    result.harvest.cycleElapsedDays <= crop.cycleDays + 2,
    `사이클 경과일이 표준 사이클을 크게 넘었다: ${result.harvest.cycleElapsedDays}일`
  );
  assert.ok(
    result.harvest.accumulatedGdd <= crop.targetGdd * 1.1,
    "누적 GDD가 목표를 넘겨 계속 쌓이고 있다"
  );
});

// ── 환산·경계 ───────────────────────────────────────────────────────────────
test("생장은 날짜가 아니라 환경의 함수다 — 같은 날수라도 광량이 다르면 갈린다", () => {
  const bright = buildIotRecords("x", NOW, { cropKey: "leafy", scenario: false });
  const degraded = buildIotRecords("x", NOW, { cropKey: "leafy", scenario: true });
  // 마지막 20일에 LED 열화가 걸린 계열은 같은 기간 동안 덜 자란다.
  const advance = (rs: typeof bright) => {
    const tail = rs.slice(-20 * 48);
    let sum = 0;
    for (let i = 1; i < tail.length; i++) {
      const d = tail[i].growthRate - tail[i - 1].growthRate;
      if (d > 0) sum += d;
    }
    return sum;
  };
  assert.ok(
    advance(degraded) < advance(bright),
    "광량이 빠졌는데 생장 속도가 그대로다"
  );
});

test("DLI 환산은 목표 광량을 역산으로 되돌린다", () => {
  const crop = getCrop("leafy");
  const lux = (crop.dliTarget * 1e6) / (0.015 * 3600 * 16);
  assert.ok(Math.abs(luxToDli(lux, 16) - crop.dliTarget) < 1e-6);
});

test("판독이 없으면 판정 불가로 나온다 — 0을 정상으로 둔갑시키지 않는다", () => {
  const result = analyzeGrowthMonitoring([], [], [], "leafy");
  assert.equal(result.light.status, "unknown");
  assert.equal(result.harvest.daysRemaining, null);
  assert.equal(result.summary.latestHealthy, false);
});
