import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { requireRole, signSession } from "@/lib/auth";
import { getDemoMode, getCachedResult, saveCacheResult } from "@/lib/demo-mode";
import { confirmBankDeposit, issueVirtualAccount } from "@/lib/deposit";

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

// 데모 대상 = 3호점(명륜동, MF03). 청약이 완납되면 status가 funding→funded로 바뀌므로
// 가변 status가 아니라 안정적인 tokenSymbol로 식별한다 (스텝 전 구간 동일 프로젝트).
async function findDemoProject() {
  const project = await prisma.project.findFirst({ where: { tokenSymbol: "MF03" } });
  if (!project) throw new Error("Demo project (MF03) not found");
  return project;
}

async function findUserByName(name: string) {
  const user = await prisma.user.findFirst({ where: { name } });
  if (!user) throw new Error(`User not found: ${name}`);
  return user;
}

// verify/complete/distribute 라우트는 requireRole 게이트가 걸려 있어,
// 내부 self-fetch에는 admin 세션 bearer 토큰이 필요하다 (getServerSession이 Authorization 헤더 인식).
async function getAdminBearer(): Promise<string> {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Admin user not found");
  const token = await signSession({ userId: admin.id, role: "admin" });
  return `Bearer ${token}`;
}

/**
 * 청약 한 건을 **실제 납입 경로로** 실행한다.
 *
 *   신청 생성 → 가상계좌 발급 → 은행 입금 웹훅 → confirmDeposit
 *            → 청약 반영 → 수탁 지갑 생성 → 보유 구좌 발행(mint)
 *
 * 예전에는 `executeSubscription`을 직접 불러 DB 원장(TokenHolding)만 갱신했다.
 * 그러면 v2.1의 핵심인 수탁 지갑 발행이 시연에서 한 번도 돌지 않는다 —
 * 만들어 놓고 못 보여주는 상태가 된다. 데모도 사용자와 같은 문으로 들어간다.
 */
async function subscribe(
  userName: string,
  tokenAmount: number,
  baseUrl: string,
  authHeader: string,
) {
  const user = await findUserByName(userName);
  const project = await findDemoProject();
  const unitPrice = project.tokenPrice ?? BigInt(10_000);
  const amount = unitPrice * BigInt(tokenAmount);

  // 1) 신청 — 동의까지 마친 상태로 만든다. 화면 단계(적합성·서명)는 시연 범위 밖이다.
  const investment = await prisma.investment.create({
    data: {
      userId: user.id,
      projectId: project.id,
      status: "AWAITING_DEPOSIT",
      amount,
      units: tokenAmount,
      eligible: true,
      consentedAt: new Date(),
    },
  });

  // 2) 가상계좌 발급 — 지급사 어댑터를 그대로 탄다.
  const issued = await issueVirtualAccount(investment.id);
  if (!issued.ok) {
    return { error: issued.error, step: "virtual-account" };
  }

  // 3) 입금 확정. 실서비스에서는 지급사가 웹훅을 쏘고 그 라우트가 이 함수를 부른다.
  //    데모는 실제 입금이 없으므로 같은 함수를 서버 내부에서 직접 부른다 —
  //    웹훅 라우트의 일은 서명 검증과 페이로드 번역이고, 시연이 보여줄 것은
  //    그 뒤의 입금 확인 → 청약 → 발행이다.
  //    (웹훅 경로 자체는 Mock 어댑터로 따로 검증했다: 같은 통지 3회 → 발행 1건)
  //    거래번호를 신청 id로 고정해 재실행해도 같은 건이 두 번 반영되지 않는다.
  const deposit = await confirmBankDeposit({
    providerAccountId: issued.account.providerAccountId,
    providerTransactionId: `demo_tx_${investment.id}`,
    amount,
    payerName: user.name,
  });

  // 4) 결과 확인 — 청약 반영과 발행 상태를 함께 읽는다.
  const settled = await prisma.investment.findUnique({
    where: { id: investment.id },
    select: { status: true, failureReason: true },
  });
  const issuance = await prisma.holdingIssuance.findFirst({
    where: { investmentId: investment.id },
    select: { status: true, units: true, chainTxHash: true, lastError: true },
  });

  if (settled?.status !== "COMPLETED") {
    return { error: settled?.failureReason ?? "청약이 반영되지 않았습니다.", deposit };
  }

  return {
    success: true,
    virtualAccount: {
      bankName: issued.account.bankName,
      accountNumber: issued.account.accountNumber,
      holderName: issued.account.holderName,
    },
    deposit,
    subscription: { units: tokenAmount, amount: Number(amount) },
    // 발행은 체인이 닿아야 CONFIRMED가 된다. 안 닿으면 PENDING으로 남고 대사가 다시 태운다.
    issuance,
  };
}

// verify-photo가 요구하는 milestoneType. 사진을 보는 단계는 3(반입)·4(설치 완료)뿐이고
// 나머지는 서류·센서로 판정하므로 값만 채운다.
const milestoneTypeBySeq: Record<number, string> = {
  1: "construction",
  2: "construction",
  3: "delivery",
  4: "installation",
  5: "operation",
};

// public/demo/의 mock 증빙 이미지. 시드의 requiredSignals와 짝이 맞아야 한다 —
// 여기 없는 신호는 verify가 이미지 없이 호출돼 판정이 실패한다.
const mockImagesBySeq: Record<
  number,
  { contract?: string; receipt?: string; photo?: string; inspection?: string }
> = {
  // 1 계약 체결 — 공간사용 협약서
  1: { contract: "mock-contract.jpg" },
  // 2 설비 발주·제작 — 발주서(계약서 서식) + 계약금 영수증
  2: { contract: "mock-contract.jpg", receipt: "mock-receipt-1.jpg" },
  // 3 반입·설치 착수 — 반입 현장 사진 + 운송 영수증
  3: { photo: "mock-photo-1.jpg", receipt: "mock-receipt-1.jpg" },
  // 4 설치 완료·검수 — 설치 완료 사진 + 검수확인서
  4: { photo: "mock-photo-3.jpg", inspection: "mock-inspection.jpg" },
  // 5 시운전·영업 개시 — IoT 14일 가동률 + 첫 판매 영수증
  5: { receipt: "mock-receipt-2.jpg" },
};

async function loadMockImageBase64(filename: string): Promise<string> {
  const filePath = path.join(process.cwd(), "public", "demo", filename);
  try {
    const buf = await fs.readFile(filePath);
    return buf.toString("base64");
  } catch {
    throw new Error(`mock 증빙 이미지가 없습니다: public/demo/${filename}`);
  }
}

// 증빙 제출(O-11). 검증·집행 게이트가 증빙 없는 단계를 거부하므로 데모도 같은 문으로 들어간다.
// 시연 흐름이 "증빙 제출 → AI 검증 → 트랜치 집행"이라는 실제 순서를 그대로 보여준다.
async function submitDemoEvidence(
  milestoneId: string,
  seq: number,
  baseUrl: string,
  authHeader: string
) {
  const files = mockImagesBySeq[seq] ?? {};
  const urls = [files.contract, files.receipt, files.photo, files.inspection]
    .filter((f): f is string => !!f)
    .map((f) => `/demo/${f}`);
  // 센서만 보는 단계는 첨부할 문서가 없다. 가동 현장 사진 한 장으로 제출 형식을
  // 맞춘다 — 판정 근거는 어차피 센서 데이터다.
  if (urls.length === 0) urls.push("/demo/mock-photo-1.jpg");

  const res = await fetch(`${baseUrl}/api/milestones/${milestoneId}/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      urls,
      note: `데모 증빙 자동 제출 · ${seq}단계 (${urls.length}건)`,
    }),
  });
  return await res.json();
}

async function verifyAndCompleteMilestone(
  seq: number,
  baseUrl: string,
  authHeader: string
) {
  const project = await findDemoProject();

  const milestone = await prisma.milestone.findUnique({
    where: { projectId_seq: { projectId: project.id, seq } },
  });

  if (!milestone) throw new Error(`Milestone seq ${seq} not found`);

  // requiredSignals에 필요한 mock 이미지만 base64로 로드
  const mockImages = mockImagesBySeq[seq] ?? {};
  const body: Record<string, string> = {
    milestoneType: milestoneTypeBySeq[seq],
  };
  if (milestone.requiredSignals.includes("contract") && mockImages.contract) {
    body.contractImage = await loadMockImageBase64(mockImages.contract);
  }
  if (milestone.requiredSignals.includes("receipt") && mockImages.receipt) {
    body.receiptImage = await loadMockImageBase64(mockImages.receipt);
  }
  if (milestone.requiredSignals.includes("photo") && mockImages.photo) {
    body.photoImage = await loadMockImageBase64(mockImages.photo);
  }
  if (milestone.requiredSignals.includes("inspection") && mockImages.inspection) {
    body.inspectionImage = await loadMockImageBase64(mockImages.inspection);
  }

  // 증빙이 아직 없으면 먼저 제출한다 — 게이트가 증빙 없는 검증을 400으로 막는다.
  let evidence: unknown = null;
  if (!milestone.evidenceSubmittedAt) {
    evidence = await submitDemoEvidence(milestone.id, seq, baseUrl, authHeader);
  }

  // Verify (admin bearer 필요)
  const verifyRes = await fetch(
    `${baseUrl}/api/milestones/${milestone.id}/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify(body),
    }
  );

  const verifyData = await verifyRes.json();

  // AI 검증 실패 시 트랜치 해제 없이 그대로 반환 (검증 명제 ① — 강제 통과 금지)
  if (!verifyData.passed) {
    return { evidence, verify: verifyData, complete: null };
  }

  // Complete (tranche release)
  const completeRes = await fetch(
    `${baseUrl}/api/milestones/${milestone.id}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({}),
    }
  );

  const completeData = await completeRes.json();

  return { evidence, verify: verifyData, complete: completeData };
}

async function distributeDividends(baseUrl: string, authHeader: string) {
  const project = await findDemoProject();
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // 정산은 확정된 기간 기록에서만 매출을 읽는다. 데모도 같은 문으로 들어간다 —
  // 저장 → 확정 → 분배. 예전에는 매출을 요청 본문에 실어 보냈다.
  // v18 §4 중립 시나리오의 사이트당 월 작물 매출. 배당 재원이 아니라 체험 매출
  // 추정 입력값이다(calculateFeePool): 체험 60만 → 수수료 풀 38만 → 투자자 배당 22.8만.
  // 4,400구좌 기준 1좌당 51원/월 = 연 612원 → 발행가 1만원 대비 6.1%(v18 공표 6.2%).
  const headers = { "Content-Type": "application/json", Authorization: authHeader };

  const saveRes = await fetch(`${baseUrl}/api/admin/projects/${project.id}/records`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      period,
      revenue: 1_400_000,
      costs: [
        { label: "임대료", amount: 400_000 },
        { label: "전기 · 수도", amount: 180_000 },
      ],
    }),
  });
  const saved = await saveRes.json();

  const confirmRes = await fetch(
    `${baseUrl}/api/admin/projects/${project.id}/records/confirm`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ period, note: `데모 ${period} 마감 확정` }),
    },
  );
  const confirmed = await confirmRes.json();

  const res = await fetch(`${baseUrl}/api/dividends/distribute`, {
    method: "POST",
    headers,
    body: JSON.stringify({ projectId: project.id, period }),
  });
  const distributed = await res.json();

  // 회수금이 계정 잔액으로만 늘면 "지급"이 시연에 안 나온다. 지급 계획을 세우고
  // 어댑터로 실제 이체까지 태운다 — 지금 어댑터는 Mock이고 화면에 그렇게 뜬다.
  const planRes = await fetch(`${baseUrl}/api/payouts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ projectId: project.id, period }),
  });
  const planned = await planRes.json();

  const pending = await prisma.payout.findMany({
    where: { projectId: project.id, period, status: { in: ["scheduled", "failed"] } },
    select: { id: true, payeeName: true, amount: true, category: true },
  });

  const transfers: unknown[] = [];
  for (const row of pending) {
    const execRes = await fetch(`${baseUrl}/api/payouts/${row.id}/execute`, {
      method: "POST",
      headers,
    });
    const body = await execRes.json();
    transfers.push({
      payee: row.payeeName,
      category: row.category,
      amount: Number(row.amount),
      ok: body?.ok ?? false,
      // 계정 없는 수취인은 실패가 아니라 수동 이체 대상이다. 시연에서 빨간
      // "실패"로 뜨면 없는 문제가 있는 것처럼 보인다.
      manual: body?.manual === true,
      reason: body?.error ?? null,
    });
  }

  return {
    records: saved,
    confirm: confirmed,
    ...distributed,
    payouts: { planned, transfers },
  };
}

type StepExecutor = () => Promise<any>;

// 3호점(모집중, 시드 3,480구좌) 잔여 920구좌 청약 → 4,400구좌 완납 · 신탁 4,400만 →
// 마일스톤 seq1~5 순차 집행(집행 합계 4,400만 = 잔여 정확히 0) + 스텝8 수수료 풀 회수금.
// 회수금 분배를 마지막 단계 앞에 두는 것은, 매장이 다 지어지기 전에도 운영 실적이
// 나오면 투자자에게 회수가 시작된다는 것을 보여주기 위해서다.
function buildStepExecutors(baseUrl: string, authHeader: string): Record<number, StepExecutor> {
  return {
    1: () => subscribe("김투자", 300, baseUrl, authHeader),
    2: () => subscribe("이서연", 200, baseUrl, authHeader),
    3: () => subscribe("박준혁", 420, baseUrl, authHeader),
    4: () => verifyAndCompleteMilestone(1, baseUrl, authHeader),
    5: () => verifyAndCompleteMilestone(2, baseUrl, authHeader),
    6: () => verifyAndCompleteMilestone(3, baseUrl, authHeader),
    7: () => verifyAndCompleteMilestone(4, baseUrl, authHeader),
    8: () => distributeDividends(baseUrl, authHeader),
    9: () => verifyAndCompleteMilestone(5, baseUrl, authHeader),
  };
}

// 마일스톤 검증 스텝(4·5·6·7·9)은 verify.passed가 true여야 성공.
// 그 외 스텝(청약 1·2·3, 회수금 분배 8)은 error 필드가 없으면 성공으로 본다.
// 실패한 스텝은 캐시하지 않는다 (cached 모드에서 실패를 재생하지 않도록).
function isStepSuccess(result: any): boolean {
  if (!result || typeof result !== "object") return false;
  if ("error" in result && result.error) return false;
  if ("verify" in result) {
    return result.verify?.passed === true;
  }
  return true;
}

// 결과에서 온체인 txHash를 추출 (트랜치 해제 → 검증 → 최상위 순).
function extractTxHash(result: any): string | null {
  if (!result || typeof result !== "object") return null;
  return (
    result?.complete?.txHash ??
    result?.verify?.txHash ??
    result?.txHash ??
    null
  );
}

function extractBlockNumber(result: any): number | null {
  if (!result || typeof result !== "object") return null;
  const bn = result?.complete?.blockNumber ?? result?.blockNumber ?? null;
  return typeof bn === "number" ? bn : null;
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const body = await request.json();
    const { step } = body;

    if (!step || step < 1 || step > 9) {
      return NextResponse.json(
        { error: "Invalid step (1-9)" },
        { status: 400 }
      );
    }

    // 모드 결정: 요청 body의 mode가 있으면 우선(시연 중 재시작 없이 토글), 없으면 env.
    const mode =
      body.mode === "cached" || body.mode === "live"
        ? body.mode
        : getDemoMode();

    // cached 모드: 저장된 결과/ txHash를 재생 (컨트랙트·AI 재호출 없음).
    if (mode === "cached") {
      const cached = await getCachedResult(step);
      if (cached) {
        return NextResponse.json(
          serialize({
            step,
            status: "completed",
            result: cached,
            fromCache: true,
          })
        );
      }
      // 캐시 미스 시에는 아래에서 실제 실행으로 폴백 (시연 안전망).
    }

    // 내부 self-fetch용 baseUrl·admin bearer.
    // 자기 자신을 부르는 것이므로 항상 "지금 들어온 요청의 origin"이 정답이다.
    // NEXT_PUBLIC_BASE_URL은 빌드 시 번들에 인라인되는 값이라, 로컬 .env의
    // localhost:3000이 프로덕션 번들에 구워져 self-fetch가 ECONNREFUSED로 죽었다.
    const baseUrl = new URL(request.url).origin;
    const authHeader = await getAdminBearer();

    const executor = buildStepExecutors(baseUrl, authHeader)[step];
    if (!executor) {
      return NextResponse.json(
        { error: `No executor for step ${step}` },
        { status: 400 }
      );
    }

    const result = await executor();

    // 성공한 스텝만 결과 + txHash를 캐시에 저장 (재실행 시 replay 소스가 됨).
    if (isStepSuccess(result)) {
      await saveCacheResult(
        step,
        null,
        extractTxHash(result),
        extractBlockNumber(result),
        result
      );
    }

    return NextResponse.json(
      serialize({ step, status: "completed", result })
    );
  } catch (error) {
    console.error("POST /api/demo/step error:", error);
    return NextResponse.json(
      { error: "Demo step failed", detail: String(error) },
      { status: 500 }
    );
  }
}
