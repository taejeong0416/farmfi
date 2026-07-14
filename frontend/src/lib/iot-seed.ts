// IoT 60일치 + NAV 스냅샷 시드 데이터 생성기.
// prisma/seed-iot.ts와 /api/demo/reset이 공용으로 사용한다.

export interface IotSeedRecord {
  projectId: string;
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
  growthRate: number;
  anomalyScore: number;
  isAnomaly: boolean;
  recordedAt: Date;
}

export interface NavSeedRecord {
  projectId: string;
  nav: number;
  escrowBalance: bigint;
  assetValue: bigint;
  cumulativeCashFlow: bigint;
  recordedAt: Date;
}

// 60일치, 30분 간격 = 2,880건 (2% 이상치 포함)
export function buildIotRecords(projectId: string, now: Date): IotSeedRecord[] {
  const records: IotSeedRecord[] = [];

  for (let dayIndex = 0; dayIndex < 60; dayIndex++) {
    for (let halfHour = 0; halfHour < 48; halfHour++) {
      const hour = halfHour / 2;
      const recordedAt = new Date(
        now.getTime() - (60 - dayIndex) * 24 * 60 * 60 * 1000 + halfHour * 30 * 60 * 1000
      );

      const isAnomaly = Math.random() < 0.02; // 2% anomaly rate

      let temperature = 22 + Math.sin(hour / 3) * 2 + (Math.random() - 0.5);
      let humidity = 65 + Math.cos(hour / 4) * 5 + (Math.random() * 3 - 1.5);
      let co2Level = 950 + Math.random() * 250;
      let lightIntensity = hour >= 6 && hour <= 20 ? 12000 + Math.random() * 3000 : 0;
      let phLevel = 6.0 + Math.random() * 0.5;
      const growthRate = Math.min(100, dayIndex * 2.2 + Math.random() * 3);

      // Inject anomalies
      if (isAnomaly) {
        const sensor = Math.floor(Math.random() * 5);
        switch (sensor) {
          case 0: temperature = 35 + Math.random() * 5; break;
          case 1: humidity = 95 + Math.random() * 5; break;
          case 2: co2Level = 2000 + Math.random() * 500; break;
          case 3: lightIntensity = 25000 + Math.random() * 5000; break;
          case 4: phLevel = 3.0 + Math.random(); break;
        }
      }

      records.push({
        projectId,
        temperature: Math.round(temperature * 10) / 10,
        humidity: Math.round(humidity * 10) / 10,
        co2Level: Math.round(co2Level),
        lightIntensity: Math.round(lightIntensity),
        phLevel: Math.round(phLevel * 100) / 100,
        growthRate: Math.round(growthRate * 10) / 10,
        anomalyScore: isAnomaly ? 3.5 + Math.random() * 2 : Math.random() * 1.5,
        isAnomaly,
        recordedAt,
      });
    }
  }

  return records;
}

// NAV 스냅샷 60일치 — 점진 우상향 + 마일스톤 점프 (day 10, 25, 40)
export function buildNavSnapshots(
  projectId: string,
  tokenPrice: number,
  now: Date
): NavSeedRecord[] {
  const navRecords: NavSeedRecord[] = [];
  let runningNav = tokenPrice; // 시작 NAV = 토큰 가격

  for (let dayIndex = 0; dayIndex < 60; dayIndex++) {
    const recordedAt = new Date(
      now.getTime() - (60 - dayIndex) * 24 * 60 * 60 * 1000
    );

    // Gradual upward trend with milestone jumps
    const dailyGrowth = 0.001 + Math.random() * 0.002;
    runningNav = runningNav * (1 + dailyGrowth);

    if (dayIndex === 10) runningNav *= 1.08;
    if (dayIndex === 25) runningNav *= 1.05;
    if (dayIndex === 40) runningNav *= 1.03;

    navRecords.push({
      projectId,
      nav: Math.round(runningNav * 100) / 100,
      escrowBalance: BigInt(Math.round(17_500_000 * (1 - dayIndex * 0.01))),
      assetValue: BigInt(dayIndex > 10 ? 10_500_000 : 0),
      cumulativeCashFlow: BigInt(Math.round(dayIndex * 15_000)),
      recordedAt,
    });
  }

  return navRecords;
}
