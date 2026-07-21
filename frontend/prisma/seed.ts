import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedScenario } from "../src/lib/seed-scenario";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const summary = await seedScenario(prisma);
  console.log(
    `융합 seed done — 지점 ${summary.projects}(1호점 funded·2호점 운영·3호점 모집중), ` +
      `품목 ${summary.products}, 운영자 ${summary.operator}, 투자자 ${summary.investors.join("·")}`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
