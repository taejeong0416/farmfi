import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const project = await prisma.project.findFirst();
  if (!project) {
    console.error("No project found. Run seed.ts first.");
    process.exit(1);
  }

  const now = new Date();
  const records = [];

  // 60일치, 30분 간격 = 2,880건
  for (let dayIndex = 0; dayIndex < 60; dayIndex++) {
    for (let halfHour = 0; halfHour < 48; halfHour++) {
      const hour = halfHour / 2;
      const recordedAt = new Date(
        now.getTime() - (60 - dayIndex) * 24 * 60 * 60 * 1000 + halfHour * 30 * 60 * 1000
      );

      const isAnomaly = Math.random() < 0.02; // 2% anomaly rate

      let temperature = 23 + Math.sin(hour / 3) * 2 + (Math.random() - 0.5);
      let humidity = 65 + Math.cos(hour / 4) * 8 + (Math.random() * 3 - 1.5);
      let co2Level = 800 + Math.random() * 200;
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
        projectId: project.id,
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

  // Batch insert
  const batchSize = 500;
  for (let i = 0; i < records.length; i += batchSize) {
    await prisma.iotData.createMany({
      data: records.slice(i, i + batchSize),
    });
  }

  console.log(`✅ IoT seed data created: ${records.length} records (60 days)`);

  // ─── NAV 스냅샷 60일치 ───
  const navRecords = [];
  let runningNav = Number(project.tokenPrice); // 시작 NAV = 토큰 가격

  for (let dayIndex = 0; dayIndex < 60; dayIndex++) {
    const recordedAt = new Date(
      now.getTime() - (60 - dayIndex) * 24 * 60 * 60 * 1000
    );

    // Gradual upward trend with milestone jumps
    const dailyGrowth = 0.001 + Math.random() * 0.002;
    runningNav = runningNav * (1 + dailyGrowth);

    // Milestone jumps at day 10, 25, 40
    if (dayIndex === 10) runningNav *= 1.08;
    if (dayIndex === 25) runningNav *= 1.05;
    if (dayIndex === 40) runningNav *= 1.03;

    navRecords.push({
      projectId: project.id,
      nav: Math.round(runningNav * 100) / 100,
      escrowBalance: BigInt(Math.round(5_000_000 * (1 - dayIndex * 0.01))),
      assetValue: BigInt(dayIndex > 10 ? 18_000_000 : 0),
      cumulativeCashFlow: BigInt(Math.round(dayIndex * 15_000)),
      recordedAt,
    });
  }

  await prisma.navSnapshot.createMany({ data: navRecords });
  console.log(`✅ NAV snapshots created: ${navRecords.length} records`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
