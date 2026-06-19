import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildIotRecords, buildNavSnapshots } from "../src/lib/iot-seed";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const project = await prisma.project.findFirst();
  if (!project) {
    console.error("No project found. Run seed.ts first.");
    process.exit(1);
  }

  const now = new Date();

  // ─── IoT 60일치, 30분 간격 = 2,880건 ───
  const records = buildIotRecords(project.id, now);

  const batchSize = 500;
  for (let i = 0; i < records.length; i += batchSize) {
    await prisma.iotData.createMany({
      data: records.slice(i, i + batchSize),
    });
  }

  console.log(`✅ IoT seed data created: ${records.length} records (60 days)`);

  // ─── NAV 스냅샷 60일치 ───
  const navRecords = buildNavSnapshots(project.id, Number(project.tokenPrice), now);
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
