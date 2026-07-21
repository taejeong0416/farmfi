import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { buildIotRecords } from "../src/lib/iot-seed";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  // 재실행 가능하도록 기존 데이터 정리 (FK 자식 먼저)
  await prisma.salesRecord.deleteMany();
  await prisma.harvestRecord.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.dividendClaim.deleteMany();
  await prisma.dividend.deleteMany();
  await prisma.tokenHolding.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.navSnapshot.deleteMany();
  await prisma.projectPartner.deleteMany();
  await prisma.escrow.deleteMany();
  await prisma.aiCache.deleteMany();
  await prisma.demoCache.deleteMany();
  await prisma.identityVerification.deleteMany();
  await prisma.iotData.deleteMany();
  await prisma.product.deleteMany();
  await prisma.project.deleteMany();
  await prisma.institution.deleteMany();
  await prisma.operatorApplication.deleteMany();
  await prisma.space.deleteMany();
  await prisma.user.deleteMany();

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
  const investor1 = await prisma.user.create({
    data: {
      name: "김투자", role: "investor", email: "investor@farmfi.test", passwordHash: pw,
      balance: BigInt(5_000_000),
      identityVerified: true, verifiedAt: now, realName: "김투자",
      investorAnnualLimit: BigInt(20_000_000),
    },
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
    data: {
      name: "온천장 스마트팜 1호점", location: "부산 동래구", buildingType: "vacant_store", areaSqm: 83,
      status: "funded", institutionId: institution.id,
      // STO 라운드 완료 (표2·표7: 1구좌 1만원, CAPEX 1,750만) — 마일스톤 집행 단계
      tokenSymbol: "MF01", tokenPrice: BigInt(10_000), totalTokens: 1750, soldTokens: 1750,
      targetAmount: BigInt(17_500_000), currentAmount: BigInt(17_500_000), totalCapex: BigInt(17_500_000),
      fundingStart: now, fundingEnd: new Date(now.getTime() + 30 * DAY),
      contractAddress: process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "0xa855f6398fb71ad197ec055853007007d3f7d452",
    },
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

  // ─── STO: 1호점 에스크로·마일스톤4·파트너·투자 (청약·배당·검증 데모) ───
  await prisma.escrow.create({
    data: {
      projectId: p1.id,
      totalLocked: BigInt(17_500_000), totalReleased: BigInt(0), remaining: BigInt(17_500_000),
      status: "active",
      contractAddress: process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "0xa855f6398fb71ad197ec055853007007d3f7d452",
    },
  });
  await prisma.milestone.createMany({
    data: [
      { projectId: p1.id, seq: 1, name: "공간 준비", description: "임대차 계약·설비 구매·공간 셋업 완료", releasePct: 3500, releaseAmount: BigInt(6_125_000), status: "in_progress", conditionText: "임대차 계약서·설비 영수증·현장 사진 제출", requiredSignals: ["contract", "receipt", "photo"], iotMinDays: 0, crossCheck: "receipt↔photo", assetValue: BigInt(10_500_000) },
      { projectId: p1.id, seq: 2, name: "시운전 + 안정성", description: "설비 가동 테스트 및 14일 안정성 검증", releasePct: 3000, releaseAmount: BigInt(5_250_000), status: "pending", conditionText: "IoT 14일 가동률 90% 이상", requiredSignals: ["iot"], iotMinDays: 14, assetValue: BigInt(0) },
      { projectId: p1.id, seq: 3, name: "첫 수확 + 판매", description: "첫 작물 수확 및 판매 실적 확인", releasePct: 2000, releaseAmount: BigInt(3_500_000), status: "pending", conditionText: "수확 사진·판매 영수증", requiredSignals: ["photo", "receipt"], iotMinDays: 0, assetValue: BigInt(0) },
      { projectId: p1.id, seq: 4, name: "지속 운영", description: "60일 지속 운영 검증", releasePct: 1500, releaseAmount: BigInt(2_625_000), status: "pending", conditionText: "IoT 60일 가동률 90% 이상·복수 판매 영수증", requiredSignals: ["iot", "receipt"], iotMinDays: 60, assetValue: BigInt(0) },
    ],
  });
  await prisma.projectPartner.create({
    data: { projectId: p1.id, role: "landlord", name: "최영호", monthlyRecoveryAmount: BigInt(500_000) },
  });
  await prisma.tokenHolding.create({
    data: { userId: investor1.id, projectId: p1.id, amount: 50, avgPrice: BigInt(10_000) },
  });
  await prisma.transaction.create({
    data: { projectId: p1.id, userId: investor1.id, type: "subscription", amount: BigInt(500_000), tokenAmount: 50, memo: "청약 (시드)" },
  });

  // ─── 생육 이상 알림 ───
  await prisma.notification.create({
    data: { projectId: p1.id, type: "anomaly_detected", message: "온도 이상 감지 · 현재 31.2℃ (정상범위 18~28℃)" },
  });

  console.log(`융합 seed done — 지점 ${projects.length}(1호점 펀딩), 품목 ${products.length}, 운영자 ${operator.name}, 투자자 ${investor1.name}`);
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
