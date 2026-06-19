import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ─── 사용자 5명 ───
  const investor1 = await prisma.user.create({
    data: {
      name: "김민수",
      role: "investor",
      email: "minsu@test.com",
      walletAddress: "0x1111111111111111111111111111111111111111",
      balance: BigInt(5_000_000),
    },
  });

  const investor2 = await prisma.user.create({
    data: {
      name: "이서연",
      role: "investor",
      email: "seoyeon@test.com",
      walletAddress: "0x2222222222222222222222222222222222222222",
      balance: BigInt(3_000_000),
    },
  });

  const investor3 = await prisma.user.create({
    data: {
      name: "박준혁",
      role: "investor",
      email: "junhyuk@test.com",
      walletAddress: "0x3333333333333333333333333333333333333333",
      balance: BigInt(10_000_000),
    },
  });

  const landlord = await prisma.user.create({
    data: {
      name: "최영호",
      role: "landlord",
      email: "youngho@test.com",
      walletAddress: "0x4444444444444444444444444444444444444444",
      balance: BigInt(0),
    },
  });

  const operator = await prisma.user.create({
    data: {
      name: "정하은",
      role: "operator",
      email: "haeun@test.com",
      walletAddress: "0x5555555555555555555555555555555555555555",
      balance: BigInt(0),
    },
  });

  // ─── 프로젝트 1개 ───
  const project = await prisma.project.create({
    data: {
      name: "금정구 미니팜 1호",
      description:
        "부산 금정구 공실 상가를 스마트팜으로 전환하는 첫 번째 프로젝트입니다. LED 수직농장 설비를 설치하고 엽채류를 재배합니다.",
      location: "부산 금정구 장전동",
      buildingType: "상가 1층",
      areaSqm: 50,
      tokenSymbol: "MF01",
      tokenPrice: BigInt(5_000),
      totalTokens: 1000,
      soldTokens: 0,
      targetAmount: BigInt(5_000_000),
      currentAmount: BigInt(0),
      totalCapex: BigInt(30_000_000),
      status: "funding",
      fundingStart: new Date(),
      fundingEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      contractAddress: process.env.FARM_TOKEN_ADDRESS || "",
    },
  });

  // ─── 에스크로 ───
  await prisma.escrow.create({
    data: {
      projectId: project.id,
      totalLocked: BigInt(0),
      totalReleased: BigInt(0),
      remaining: BigInt(0),
      status: "active",
      contractAddress: process.env.ESCROW_ADDRESS || "",
    },
  });

  // ─── 마일스톤 4개 ───
  await prisma.milestone.createMany({
    data: [
      {
        projectId: project.id,
        seq: 1,
        name: "공간 준비",
        description: "임대차 계약 체결, 설비 구매, 공간 셋업 완료",
        releasePct: 3500,
        releaseAmount: BigInt(1_750_000),
        status: "in_progress",
        conditionText: "임대차 계약서, 설비 구매 영수증, 현장 사진 제출",
        requiredSignals: ["contract", "receipt", "photo"],
        iotMinDays: 0,
        crossCheck: "receipt↔photo",
        assetValue: BigInt(18_000_000),
      },
      {
        projectId: project.id,
        seq: 2,
        name: "시운전 + 안정성",
        description: "설비 가동 테스트 및 14일간 안정성 검증",
        releasePct: 3000,
        releaseAmount: BigInt(1_500_000),
        status: "pending",
        conditionText: "설비 가동 사진, IoT 14일 가동률 90% 이상",
        requiredSignals: ["photo", "iot"],
        iotMinDays: 14,
        crossCheck: null,
        assetValue: BigInt(0),
      },
      {
        projectId: project.id,
        seq: 3,
        name: "첫 수확 + 판매",
        description: "첫 작물 수확 및 판매 실적 확인",
        releasePct: 2000,
        releaseAmount: BigInt(1_000_000),
        status: "pending",
        conditionText: "수확 사진, 판매 영수증, IoT 정상 가동",
        requiredSignals: ["photo", "receipt", "iot"],
        iotMinDays: 0,
        crossCheck: null,
        assetValue: BigInt(0),
      },
      {
        projectId: project.id,
        seq: 4,
        name: "지속 운영",
        description: "60일간 지속 운영 검증 및 BEP 접근 확인",
        releasePct: 1500,
        releaseAmount: BigInt(750_000),
        status: "pending",
        conditionText: "IoT 60일 가동률 90% 이상, 운영비 영수증, 운영 현황 사진",
        requiredSignals: ["iot", "receipt", "photo"],
        iotMinDays: 60,
        crossCheck: null,
        assetValue: BigInt(0),
      },
    ],
  });

  // ─── 프로젝트 파트너 (건물주: 월 고정 임대료 50만원, 회수 필드 미사용) ───
  await prisma.projectPartner.create({
    data: {
      projectId: project.id,
      role: "landlord",
      name: "최영호",
      totalContribution: BigInt(0),
      recoveredAmount: BigInt(0),
      monthlyRecoveryAmount: BigInt(500_000),
      recoveryComplete: false,
    },
  });

  console.log("✅ Seed data created successfully");
  console.log(`   Users: ${investor1.name}, ${investor2.name}, ${investor3.name}, ${landlord.name}, ${operator.name}`);
  console.log(`   Project: ${project.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
