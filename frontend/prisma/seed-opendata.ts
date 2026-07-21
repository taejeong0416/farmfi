// 오픈데이터 → IotData 임포트 시드.
// 스마트팜코리아 스키마 샘플(opendata-sample.json)을 프로젝트의 IoT 데이터로
// 적재한다. 실 데이터 전환 시 fetchOpenData()가 실제 API를 치도록 바뀌는 것
// 외에는 이 파이프라인 전체가 그대로다. (실행: npm run seed:opendata)
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { fetchOpenData, mapRecordToReading } from "../src/lib/opendata";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const project = await prisma.project.findFirst();
  if (!project) {
    console.error("No project found. Run seed.ts first.");
    process.exit(1);
  }

  const records = await fetchOpenData();
  const rows = records.map((r) => {
    const reading = mapRecordToReading(r);
    return {
      projectId: project.id,
      ...reading,
      growthRate: 0,
      recordedAt: new Date(r.measDt),
    };
  });

  // 실데이터 재적재 시 중복 방지: 기존 IoT 삭제 후 삽입
  await prisma.iotData.deleteMany({ where: { projectId: project.id } });

  await prisma.iotData.createMany({ data: rows });
  console.log(`✅ Open-data records imported: ${rows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
