import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { buildIotRecords } from "../src/lib/iot-seed";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const now = new Date();
  const pw = await bcrypt.hash("farmfi123", 10);

  // ─── 사용자 (비밀번호 farmfi123) ───
  await prisma.user.create({
    data: { name: "관리자", role: "admin", email: "admin@farmfi.test", passwordHash: pw },
  });
  const operator = await prisma.user.create({
    data: { name: "정하은", role: "operator", email: "operator@farmfi.test", passwordHash: pw },
  });
  const landlord = await prisma.user.create({
    data: { name: "최영호", role: "landlord", email: "landlord@farmfi.test", passwordHash: pw },
  });

  // ─── 공간 ───
  await prisma.space.create({
    data: {
      ownerId: landlord.id,
      spaceType: "vacant_store",
      address: "부산 동래구 온천장로 12",
      area: "50~100평",
      electricity: "가능",
      water: "가능",
      lighting: "좋음",
      preferredMode: "임대형",
      suitabilityScore: 88,
      estimatedRent: 1_200_000,
      status: "approved",
    },
  });

  // ─── 도입 기관 ───
  const institution = await prisma.institution.create({
    data: { name: "부산진구 도시재생지원센터", type: "public", contactName: "김담당", contactEmail: "cs@bjgu.go.kr" },
  });

  // ─── 품목 (v18 엽채류·허브, 프리미엄 소포장 3,000~4,000원/봉) ───
  const sangchu = await prisma.product.create({ data: { name: "상추", category: "leafy", unitPrice: 3000, growDays: 28 } });
  const rucola = await prisma.product.create({ data: { name: "루꼴라", category: "leafy", unitPrice: 3500, growDays: 30 } });
  const basil = await prisma.product.create({ data: { name: "바질", category: "herb", unitPrice: 4000, growDays: 35 } });
  const products = [sangchu, rucola, basil];

  // ─── 지점 2곳 (기관 소속) ───
  const p1 = await prisma.project.create({
    data: { name: "온천장 스마트팜 1호점", location: "부산 동래구", buildingType: "vacant_store", areaSqm: 83, status: "operating", institutionId: institution.id },
  });
  const p2 = await prisma.project.create({
    data: { name: "장전동 스마트팜 2호점", location: "부산 금정구", buildingType: "vacant_store", areaSqm: 66, status: "operating", institutionId: institution.id },
  });
  const projects = [p1, p2];

  for (const proj of projects) {
    // 재고-생육: '오늘 할 일'이 나오도록 — 상추=수확 임박+재고부족, 바질=오늘 수확, 루꼴라=여유
    await prisma.inventory.createMany({
      data: [
        { projectId: proj.id, productId: sangchu.id, inStock: 4, growing: 120, plantedAt: new Date(now.getTime() - 27 * DAY), expectedHarvestAt: new Date(now.getTime() - 1 * DAY) },
        { projectId: proj.id, productId: rucola.id, inStock: 22, growing: 80, plantedAt: new Date(now.getTime() - 10 * DAY), expectedHarvestAt: new Date(now.getTime() + 12 * DAY) },
        { projectId: proj.id, productId: basil.id, inStock: 3, growing: 60, plantedAt: new Date(now.getTime() - 35 * DAY), expectedHarvestAt: now },
      ],
    });

    // 수확·판매 실적 14일치 (판매-재배 추이 + 기관 리포트 집계용)
    const harvests: { projectId: string; productId: string; quantity: number; harvestedAt: Date }[] = [];
    const sales: { projectId: string; productId: string; quantity: number; amount: number; soldAt: Date }[] = [];
    for (let d = 14; d >= 1; d--) {
      const day = new Date(now.getTime() - d * DAY);
      for (const prod of products) {
        const qtyH = 30 + Math.floor(Math.random() * 20);
        harvests.push({ projectId: proj.id, productId: prod.id, quantity: qtyH, harvestedAt: day });
        const qtyS = 25 + Math.floor(Math.random() * 15);
        sales.push({ projectId: proj.id, productId: prod.id, quantity: qtyS, amount: qtyS * prod.unitPrice, soldAt: day });
      }
    }
    await prisma.harvestRecord.createMany({ data: harvests });
    await prisma.salesRecord.createMany({ data: sales });

    // IoT 60일치 (생육 모니터링·이상감지)
    await prisma.iotData.createMany({ data: buildIotRecords(proj.id, now) });
  }

  // ─── 생육 이상 알림 ───
  await prisma.notification.create({
    data: { projectId: p1.id, type: "anomaly_detected", message: "온도 이상 감지 · 현재 31.2℃ (정상범위 18~28℃)" },
  });

  console.log(`v18 seed done — 지점 ${projects.length}, 품목 ${products.length}, 운영자 ${operator.name}`);
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
