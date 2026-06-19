import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildIotRecords, buildNavSnapshots } from "@/lib/iot-seed";

export async function POST(_request: NextRequest) {
  try {
    // Delete in order to respect foreign keys
    await prisma.dividendClaim.deleteMany();
    await prisma.dividend.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.tokenHolding.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.iotData.deleteMany();
    await prisma.navSnapshot.deleteMany();
    await prisma.milestone.deleteMany();
    await prisma.escrow.deleteMany();
    await prisma.projectPartner.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
    // Do NOT delete DemoCache (preserve cache for cached mode)

    // ─── Re-seed: Users ───
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

    // ─── Re-seed: Project ───
    const project = await prisma.project.create({
      data: {
        name: "금정구 미니팜 1호",
        description:
          "부산 금정구 공실 상가를 스마트팜으로 전환하는 첫 번째 프로젝트입니다. LED 수직농장 설비를 설치하고 새싹삼을 수경재배합니다.",
        location: "부산 금정구 장전동",
        buildingType: "상가 1층",
        areaSqm: 83, // 25평 ≈ 82.6㎡ (표7)
        tokenSymbol: "MF01",
        tokenPrice: BigInt(10_000), // 1구좌 1만원 (표2·표4)
        totalTokens: 1750,
        soldTokens: 0,
        targetAmount: BigInt(17_500_000), // 모집 목표 = CAPEX (표7)
        currentAmount: BigInt(0),
        totalCapex: BigInt(17_500_000), // 70만/평 × 25평 (표7)
        status: "funding",
        fundingStart: new Date(),
        fundingEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        contractAddress: process.env.FARM_TOKEN_ADDRESS || "",
      },
    });

    // ─── Re-seed: Escrow ───
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

    // ─── Re-seed: Milestones ───
    await prisma.milestone.createMany({
      data: [
        {
          projectId: project.id,
          seq: 1,
          name: "공간 준비",
          description: "임대차 계약 체결, 설비 구매, 공간 셋업 완료",
          releasePct: 3500,
          releaseAmount: BigInt(6_125_000),
          status: "in_progress",
          conditionText: "임대차 계약서, 설비 구매 영수증, 현장 사진 제출",
          requiredSignals: ["contract", "receipt", "photo"],
          iotMinDays: 0,
          crossCheck: "receipt↔photo",
          assetValue: BigInt(10_500_000),
        },
        {
          projectId: project.id,
          seq: 2,
          name: "시운전 + 안정성",
          description: "설비 가동 테스트 및 14일간 안정성 검증",
          releasePct: 3000,
          releaseAmount: BigInt(5_250_000),
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
          releaseAmount: BigInt(3_500_000),
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
          releaseAmount: BigInt(2_625_000),
          status: "pending",
          conditionText: "IoT 60일 가동률 90% 이상, 운영비 영수증, 운영 현황 사진",
          requiredSignals: ["iot", "receipt", "photo"],
          iotMinDays: 60,
          crossCheck: null,
          assetValue: BigInt(0),
        },
      ],
    });

    // ─── Re-seed: Partners (건물주: 월 고정 임대료 50만원, 회수 필드 미사용) ───
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

    // ─── Re-seed: IoT 60일치 + NAV 스냅샷 (마일스톤 2·4의 가동률 검증에 필요) ───
    const now = new Date();
    const iotRecords = buildIotRecords(project.id, now);
    const batchSize = 500;
    for (let i = 0; i < iotRecords.length; i += batchSize) {
      await prisma.iotData.createMany({
        data: iotRecords.slice(i, i + batchSize),
      });
    }
    await prisma.navSnapshot.createMany({
      data: buildNavSnapshots(project.id, Number(project.tokenPrice), now),
    });

    return NextResponse.json({
      success: true,
      message: "Demo reset complete",
    });
  } catch (error) {
    console.error("POST /api/demo/reset error:", error);
    return NextResponse.json(
      { error: "Demo reset failed", detail: String(error) },
      { status: 500 }
    );
  }
}
