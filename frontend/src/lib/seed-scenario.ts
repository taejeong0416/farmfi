import bcrypt from "bcryptjs";
import type { PrismaClient } from "../generated/prisma/client";
import { buildIotRecords } from "./iot-seed";
import { syncAgreements } from "./agreements";
import { syncCourses } from "./operator-apply";

const DAY = 24 * 60 * 60 * 1000;

// ─── 마일스톤 집행 기한 (투자자 보호 — 180일 데드라인) ───
// contracts/src/Escrow.sol의 `MILESTONE_TIMEOUT = 180 days`를 미러링한다.
// 규칙: 기한 = 직전 마일스톤 완료시각 + 180일, 직전 완료 기록이 없으면 fundingStart 기준.
// 시드에는 완료된 마일스톤이 없으므로 직전 단계의 기한(= 그 단계가 늦어도 끝나야 하는
// 시각)을 앵커로 이어 붙여 단계별 상한을 만든다. 런타임에서는 트랜치가 집행될 때
// POST /api/milestones/[id]/complete 가 다음 단계 기한을 "실제 완료시각 + 180일"로 다시 쓴다.
// (lib/onchain.ts의 MILESTONE_TIMEOUT_DAYS와 같은 값 — 시드 CLI가 viem을 끌어오지
//  않도록 여기서만 상수를 복제한다.)
const MILESTONE_TIMEOUT_DAYS = 180;

function milestoneDeadlines(fundingStart: Date, count: number): Date[] {
  return Array.from(
    { length: count },
    (_, i) => new Date(fundingStart.getTime() + (i + 1) * MILESTONE_TIMEOUT_DAYS * DAY)
  );
}

/**
 * 데모/시연용 기준 데이터셋을 구성한다 (재실행 가능 — 기존 데이터 정리 후 재생성).
 * `prisma/seed.ts`(CLI)와 `/api/demo/reset`(런타임)이 같은 함수를 호출해 드리프트를 막는다.
 */
export async function seedScenario(prisma: PrismaClient) {
  // 재실행 가능하도록 기존 데이터 정리 (FK 자식 먼저)
  // ─── 자식 → 부모 순서로 지운다. 하나라도 빠지면 project/user deleteMany가
  //     FK 위반으로 죽고 데모 리셋 자체가 안 된다.
  //     새 모델을 만들면 여기에 반드시 추가한다.
  await prisma.agreementConsent.deleteMany();
  await prisma.milestoneReviewItem.deleteMany();
  await prisma.operatorCredential.deleteMany();
  await prisma.operatorContract.deleteMany();
  await prisma.operatorCourseProgress.deleteMany();
  await prisma.operatorVisit.deleteMany();
  await prisma.reconciliationEntry.deleteMany();
  await prisma.setpointApplication.deleteMany();
  await prisma.holdingIssuance.deleteMany();
  await prisma.custodyWallet.deleteMany();
  await prisma.depositEvent.deleteMany();
  await prisma.virtualAccount.deleteMany();
  await prisma.investment.deleteMany();
  await prisma.periodRecord.deleteMany();
  await prisma.pickupOrder.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.deviceCommand.deleteMany();
  await prisma.device.deleteMany();
  await prisma.sensorThreshold.deleteMany();
  await prisma.notificationPref.deleteMany();
  await prisma.salesRecord.deleteMany();
  await prisma.harvestRecord.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.dividendClaim.deleteMany();
  await prisma.dividend.deleteMany();
  await prisma.tokenHolding.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.appealComment.deleteMany();
  await prisma.appeal.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.settlementRule.deleteMany();
  await prisma.auditLog.deleteMany();
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

  // 동의 문서와 교육 과정은 시나리오 데이터가 아니라 기준 데이터다.
  // 지우지 않고 코드에 맞춘다.
  await syncAgreements(prisma);
  await syncCourses(prisma);

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
  // 투자자 3명 — 본인인증 완료·연간한도 20M (청약 데모 대상)
  const verifiedInvestor = (name: string, email: string) => ({
    name, role: "investor", email, passwordHash: pw,
    balance: BigInt(5_000_000),
    identityVerified: true, verifiedAt: now, realName: name,
    investorAnnualLimit: BigInt(20_000_000),
  });
  const investor1 = await prisma.user.create({ data: verifiedInvestor("김투자", "investor@farmfi.test") });
  const investor2 = await prisma.user.create({ data: verifiedInvestor("이서연", "investor2@farmfi.test") });
  const investor3 = await prisma.user.create({ data: verifiedInvestor("박준혁", "investor3@farmfi.test") });

  // ─── 운영자 신청 (O-03~O-07 완료 상태) ───
  // 보증서는 계약이 끝난 신청에서 나온다(O-08). 신청이 없으면 발급할 근거가 없어
  // 보증서 흐름 전체를 시연할 수 없다.
  const operatorApplication = await prisma.operatorApplication.create({
    data: {
      userId: operator.id,
      region: "부산 금정구",
      cropExperience: "가정 수경재배 2년",
      availableHours: "주 5일 · 하루 4시간",
      status: "approved",
      educationProgress: 100,
    },
  });

  // ─── 회수 계좌 (C-I03에서 확인한 본인 명의 계좌) ───
  // 없으면 지급 어댑터가 이체를 거부한다 — 실제로 그게 맞는 동작이지만,
  // 시연에서 모든 지급이 "계좌 없음"으로 실패하면 정산 흐름을 보여줄 수 없다.
  // 계좌번호 원문은 저장하지 않는다. 표시용 마스킹과 지급사 토큰만 둔다.
  const bankFor = (u: { id: string; name: string }, bankName: string, tail: string) => ({
    userId: u.id,
    bankName,
    maskedNumber: `123-****-${tail}`,
    accountToken: `seed_token_${u.id}`,
    holderName: u.name,
    verifiedAt: now,
  });
  await prisma.bankAccount.createMany({
    data: [
      bankFor(investor1, "부산은행", "1001"),
      bankFor(investor2, "국민은행", "1002"),
      bankFor(investor3, "신한은행", "1003"),
      bankFor(operator, "농협은행", "2001"),
      bankFor(landlord, "우리은행", "3001"),
    ],
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
  // 방울토마토 — 운영자 앱의 베드 4칸(A~D)과 토마토 스프라이트를 채우는 품목.
  // 앱 cropKindOf()가 이름 "토마토"로 tomato 스프라이트에 매핑한다.
  const tomato = await prisma.product.create({ data: { name: "방울토마토", category: "fruit", unitPrice: 6000, growDays: 45 } });
  const products = [sangchu, rucola, basil, tomato];

  // ─── 지점 2곳 (기관 소속) ───
  // 1호점은 이미 모집이 끝난(funded) 라운드라 청약 기간을 과거로 둔다. 이 fundingStart가
  // 마일스톤 1의 기한 앵커가 되어 D-120(= 60일 전 + 180일)으로 잡힌다.
  const p1FundingStart = new Date(now.getTime() - 60 * DAY);
  const p1Deadlines = milestoneDeadlines(p1FundingStart, 4);
  const p1 = await prisma.project.create({
    data: {
      name: "온천장 스마트팜 1호점", location: "부산 동래구", buildingType: "vacant_store", areaSqm: 83,
      status: "funded", institutionId: institution.id, operatorId: operator.id,
      // STO 라운드 완료 — 기획 v16 §3: 사이트당 4,400만(설비 4,000만 + 온보딩피 400만),
      // 1구좌 1만원 → 4,400구좌. contracts/script/Deploy.s.sol의 FarmToken 총발행 4400과 동일.
      tokenSymbol: "MF01", tokenPrice: BigInt(10_000), totalTokens: 4400, soldTokens: 4400,
      targetAmount: BigInt(44_000_000), currentAmount: BigInt(44_000_000), totalCapex: BigInt(44_000_000),
      fundingStart: p1FundingStart, fundingEnd: new Date(now.getTime() - 30 * DAY),
      contractAddress: process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "0xa855f6398fb71ad197ec055853007007d3f7d452",
    },
  });
  const p2 = await prisma.project.create({
    data: { name: "장전동 스마트팜 2호점", location: "부산 금정구", buildingType: "vacant_store", areaSqm: 66, status: "operating", institutionId: institution.id, operatorId: operator.id },
  });
  const projects = [p1, p2];

  for (const proj of projects) {
    // 재고-생육: '오늘 할 일'이 나오도록 — 상추=수확 임박+재고부족, 바질=오늘 수확,
    // 루꼴라=여유, 방울토마토=생육 초중반(할 일 목록을 더 늘리지 않도록 재고도 넉넉히)
    await prisma.inventory.createMany({
      data: [
        { projectId: proj.id, productId: sangchu.id, inStock: 4, growing: 120, plantedAt: new Date(now.getTime() - 27 * DAY), expectedHarvestAt: new Date(now.getTime() - 1 * DAY) },
        { projectId: proj.id, productId: rucola.id, inStock: 22, growing: 80, plantedAt: new Date(now.getTime() - 10 * DAY), expectedHarvestAt: new Date(now.getTime() + 12 * DAY) },
        { projectId: proj.id, productId: basil.id, inStock: 3, growing: 60, plantedAt: new Date(now.getTime() - 35 * DAY), expectedHarvestAt: now },
        { projectId: proj.id, productId: tomato.id, inStock: 18, growing: 90, plantedAt: new Date(now.getTime() - 20 * DAY), expectedHarvestAt: new Date(now.getTime() + 25 * DAY) },
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
    // 1호점은 관행 점등 + 고장 시나리오(냉방 저하·펌프 막힘·LED 열화)를 담아 탐지기가
    // 실제로 발화하는 계열을, 2호점은 TOU 최적 점등 + 무고장 계열을 갖는다. 두 지점을
    // 나란히 보면 "심야 점등은 정상, 순간 조도가 아니라 일적산으로 판정한다"가 드러난다.
    const isPilot = proj.id === p1.id;
    await prisma.iotData.createMany({
      data: buildIotRecords(proj.id, now, {
        cropKey: "leafy",
        schedule: isPilot ? "conventional" : "tou-optimized",
        scenario: isPilot,
      }),
    });
  }

  // ─── STO: 1호점 에스크로·마일스톤4·파트너·투자 (청약·배당·검증 데모) ───
  await prisma.escrow.create({
    data: {
      projectId: p1.id,
      // 완판 4,400만 전액 락업 · 마일스톤1이 아직 in_progress라 집행액 0 → 잔액 = 락업액.
      totalLocked: BigInt(44_000_000), totalReleased: BigInt(0), remaining: BigInt(44_000_000),
      status: "active",
      contractAddress: process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "0xa855f6398fb71ad197ec055853007007d3f7d452",
    },
  });
  // 트랜치 = 목표조달 4,400만 × releasePct (35/30/20/15) → 1,540/1,320/880/660만, 합계 4,400만.
  // M1 assetValue 2,640만은 집행 후 NAV = (4,400만 − 1,540만 + 2,640만) / 4,400좌 = 12,500원/좌
  // (발행가 1만원 대비 +25%) — 검증 데모의 NAV 상승 연출을 유지한다.
  // deadlineAt: 1단계는 D-120(진행 중 단계의 실제 카운트다운), 이후 단계는 180일씩 뒤로.
  await prisma.milestone.createMany({
    data: [
      { projectId: p1.id, seq: 1, name: "공간 준비", description: "공간사용 협약·설비 구매·공간 셋업 완료", releasePct: 3500, releaseAmount: BigInt(15_400_000), status: "in_progress", conditionText: "공간사용 협약서·설비 영수증·현장 사진 제출", requiredSignals: ["contract", "receipt", "photo"], iotMinDays: 0, crossCheck: "receipt↔photo", assetValue: BigInt(26_400_000), deadlineAt: p1Deadlines[0] },
      { projectId: p1.id, seq: 2, name: "시운전 + 안정성", description: "설비 가동 테스트 및 14일 안정성 검증", releasePct: 3000, releaseAmount: BigInt(13_200_000), status: "pending", conditionText: "IoT 14일 가동률 90% 이상", requiredSignals: ["iot"], iotMinDays: 14, assetValue: BigInt(0), deadlineAt: p1Deadlines[1] },
      { projectId: p1.id, seq: 3, name: "첫 수확 + 판매", description: "첫 작물 수확 및 판매 실적 확인", releasePct: 2000, releaseAmount: BigInt(8_800_000), status: "pending", conditionText: "수확 사진·판매 영수증", requiredSignals: ["photo", "receipt"], iotMinDays: 0, assetValue: BigInt(0), deadlineAt: p1Deadlines[2] },
      { projectId: p1.id, seq: 4, name: "지속 운영", description: "60일 지속 운영 검증", releasePct: 1500, releaseAmount: BigInt(6_600_000), status: "pending", conditionText: "IoT 60일 가동률 90% 이상·복수 판매 영수증", requiredSignals: ["iot", "receipt"], iotMinDays: 60, assetValue: BigInt(0), deadlineAt: p1Deadlines[3] },
    ],
  });
  await prisma.projectPartner.create({
    data: { projectId: p1.id, role: "landlord", name: "최영호", userId: landlord.id, monthlyRecoveryAmount: BigInt(500_000) },
  });
  await prisma.tokenHolding.create({
    data: { userId: investor1.id, projectId: p1.id, amount: 50, avgPrice: BigInt(10_000) },
  });
  await prisma.transaction.create({
    data: { projectId: p1.id, userId: investor1.id, type: "subscription", amount: BigInt(500_000), tokenAmount: 50, memo: "청약 (시드)" },
  });

  // ─── STO: 3호점 모집중(funding) — 청약·검증·배당 데모 대상 (에스크로·마일스톤 pending) ───
  const p3 = await prisma.project.create({
    data: {
      name: "명륜동 스마트팜 3호점",
      description: "부산 동래구 명륜동 공실 상가 전환 라운드 (모집 중).",
      location: "부산 동래구 명륜동", buildingType: "vacant_store", areaSqm: 76,
      status: "funding", institutionId: institution.id, operatorId: operator.id,
      // 1호점과 같은 표준 유닛 — 4,400구좌/4,400만. 모집 진행률 79%(3,480구좌 = 3,480만).
      // 잔여 920구좌 = 데모 스텝 1~3(300+200+420)이 채우는 양 → 스텝 3에서 정확히 완납(funded)되고
      // escrow가 4,400만이 되어 트랜치 4개(1,540+1,320+880+660만 = 4,400만)를 전부 집행할 수 있다.
      tokenSymbol: "MF03", tokenPrice: BigInt(10_000), totalTokens: 4400, soldTokens: 3480,
      targetAmount: BigInt(44_000_000), currentAmount: BigInt(34_800_000), totalCapex: BigInt(44_000_000),
      fundingStart: now, fundingEnd: new Date(now.getTime() + 30 * DAY),
      contractAddress: process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "0xa855f6398fb71ad197ec055853007007d3f7d452",
    },
  });
  await prisma.escrow.create({
    data: {
      projectId: p3.id,
      // 모집 중이므로 락업액 = 현재까지 청약된 3,480만(= currentAmount), 집행 0.
      totalLocked: BigInt(34_800_000), totalReleased: BigInt(0), remaining: BigInt(34_800_000),
      status: "active",
      contractAddress: process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "0xa855f6398fb71ad197ec055853007007d3f7d452",
    },
  });
  // 1호점과 동일한 표준 트랜치 — 목표 4,400만 기준 1,540/1,320/880/660만(합계 4,400만).
  // 3호점은 아직 모집 중이라 기한 앵커가 fundingStart(오늘) → 1단계 D-180.
  const p3Deadlines = milestoneDeadlines(now, 4);
  await prisma.milestone.createMany({
    data: [
      { projectId: p3.id, seq: 1, name: "공간 준비", description: "공간사용 협약·설비 구매·공간 셋업", releasePct: 3500, releaseAmount: BigInt(15_400_000), status: "pending", conditionText: "공간사용 협약서·설비 영수증·현장 사진", requiredSignals: ["contract", "receipt", "photo"], iotMinDays: 0, crossCheck: "receipt↔photo", assetValue: BigInt(0), deadlineAt: p3Deadlines[0] },
      { projectId: p3.id, seq: 2, name: "시운전 + 안정성", description: "설비 가동 14일 안정성", releasePct: 3000, releaseAmount: BigInt(13_200_000), status: "pending", conditionText: "IoT 14일 가동률 90%+", requiredSignals: ["iot"], iotMinDays: 14, assetValue: BigInt(0), deadlineAt: p3Deadlines[1] },
      { projectId: p3.id, seq: 3, name: "첫 수확 + 판매", description: "첫 수확·판매 실적", releasePct: 2000, releaseAmount: BigInt(8_800_000), status: "pending", conditionText: "수확 사진·판매 영수증", requiredSignals: ["photo", "receipt"], iotMinDays: 0, assetValue: BigInt(0), deadlineAt: p3Deadlines[2] },
      { projectId: p3.id, seq: 4, name: "지속 운영", description: "60일 지속 운영", releasePct: 1500, releaseAmount: BigInt(6_600_000), status: "pending", conditionText: "IoT 60일·복수 판매", requiredSignals: ["iot", "receipt"], iotMinDays: 60, assetValue: BigInt(0), deadlineAt: p3Deadlines[3] },
    ],
  });
  await prisma.projectPartner.create({
    data: { projectId: p3.id, role: "landlord", name: "박건물", monthlyRecoveryAmount: BigInt(450_000) },
  });
  // 기청약 3,480구좌의 보유 내역 — soldTokens와 반드시 합이 같아야 한다.
  // 배당(POST /api/dividends/distribute)의 perToken 분모가 soldTokens가 아니라 TokenHolding
  // 합계라서, 이 행이 없으면 데모 청약분(920구좌)만 분모가 되어 1좌당 배당이 과대 계상된다.
  // 데모 스텝 1~3이 같은 3명으로 추가 청약(300·200·420)해도 연간한도 2,000만을 넘지 않는다
  // (김투자 1호점 50좌 포함 1,550만 · 이서연 1,280만 · 박준혁 1,620만).
  const p3Seeded: [string, number][] = [
    [investor1.id, 1200],
    [investor2.id, 1080],
    [investor3.id, 1200],
  ];
  await prisma.tokenHolding.createMany({
    data: p3Seeded.map(([userId, amount]) => ({
      userId, projectId: p3.id, amount, avgPrice: BigInt(10_000),
    })),
  });
  await prisma.transaction.createMany({
    data: p3Seeded.map(([userId, amount]) => ({
      projectId: p3.id, userId, type: "subscription",
      amount: BigInt(amount) * BigInt(10_000), tokenAmount: amount, memo: "청약 (시드)",
    })),
  });
  // IoT 60일치 — 시운전·지속운영 마일스톤(가동률 게이트) 검증용. 게이트를 재는 지점이라
  // 고장 시나리오는 넣지 않는다.
  await prisma.iotData.createMany({
    data: buildIotRecords(p3.id, now, { cropKey: "leafy", scenario: false }),
  });

  // ─── 생육 이상 알림 ───
  // 1호점 IoT 계열에 심은 세 고장에 각각 대응한다. 탐지 경로가 다르다는 것이 요점 —
  // 스파이크는 Z-score, 지속 드리프트는 CUSUM, 광량 열화는 일적산(DLI)만이 잡는다.
  await prisma.notification.createMany({
    data: [
      {
        projectId: p1.id,
        type: "drift_temperature",
        message: "온도 지속 드리프트 · CUSUM 4.1σ — 냉방 성능 저하 예지보전 점검 권고",
      },
      {
        projectId: p1.id,
        type: "range_violation",
        message: "설비 이상 의심 · 양액 pH 4.2pH (정상 5~7) — 현장 점검이 필요합니다",
      },
      {
        projectId: p1.id,
        type: "dli_shortfall",
        message: "일적산광량 미달 · 목표의 78% — LED 광량 열화 의심",
      },
    ],
  });

  return {
    projects: projects.length + 1,
    products: products.length,
    operator: operator.name,
    investors: [investor1.name, investor2.name, investor3.name],
  };
}
