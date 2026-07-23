import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { requireRole, signSession } from "@/lib/auth";
import { getDemoMode, getCachedResult, saveCacheResult } from "@/lib/demo-mode";
import { executeSubscription } from "@/lib/subscription";

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

// 시드 투자자로 직접 실행하는 신뢰된 서버 내부 경로.
// 세션·본인인증·한도 게이트는 사용자 경로(/api/subscribe)에만 적용된다.
async function subscribe(userName: string, tokenAmount: number) {
  const user = await findUserByName(userName);
  const project = await findDemoProject();

  const result = await executeSubscription({
    userId: user.id,
    projectId: project.id,
    tokenAmount,
  });

  if (!result.ok) {
    return { error: result.error };
  }
  return {
    success: true,
    transaction: {
      txHash: result.transaction.txHash,
      amount: Number(result.transaction.amount),
      tokenAmount: result.transaction.tokenAmount,
    },
  };
}

const milestoneTypeBySeq: Record<number, string> = {
  1: "construction",
  2: "trial_run",
  3: "harvest",
  4: "operation",
};

// public/demo/의 mock 증빙 이미지
const mockImagesBySeq: Record<
  number,
  { contract?: string; receipt?: string; photo?: string }
> = {
  1: { contract: "mock-contract.jpg", receipt: "mock-receipt-1.jpg", photo: "mock-photo-1.jpg" }, // 설비 영수증
  2: {}, // IoT 14일 가동률만 검증 (이미지 없음)
  3: { receipt: "mock-receipt-2.jpg", photo: "mock-photo-3.jpg" }, // 판매 영수증 + 수확 사진
  4: { receipt: "mock-receipt-2.jpg" }, // IoT 60일 + 복수 판매 영수증
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
    return { verify: verifyData, complete: null };
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

  return { verify: verifyData, complete: completeData };
}

async function distributeDividends(baseUrl: string, authHeader: string) {
  const project = await findDemoProject();

  const res = await fetch(`${baseUrl}/api/dividends/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      projectId: project.id,
      totalRevenue: 2_970_000,
    }),
  });

  return await res.json();
}

type StepExecutor = () => Promise<any>;

// 3호점(모집중) 완납 청약(920구좌) → escrow 13.2M 충전 → 마일스톤 seq1~4 순차 집행.
function buildStepExecutors(baseUrl: string, authHeader: string): Record<number, StepExecutor> {
  return {
    1: () => subscribe("김투자", 300),
    2: () => subscribe("이서연", 200),
    3: () => subscribe("박준혁", 420),
    4: () => verifyAndCompleteMilestone(1, baseUrl, authHeader),
    5: () => verifyAndCompleteMilestone(2, baseUrl, authHeader),
    6: () => verifyAndCompleteMilestone(3, baseUrl, authHeader),
    7: () => distributeDividends(baseUrl, authHeader),
    8: () => verifyAndCompleteMilestone(4, baseUrl, authHeader),
  };
}

// 마일스톤 검증 스텝(4·5·6·8)은 verify.passed가 true여야 성공.
// 그 외 스텝(청약 1·2·3, 배당 7)은 error 필드가 없으면 성공으로 본다.
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

    if (!step || step < 1 || step > 8) {
      return NextResponse.json(
        { error: "Invalid step (1-8)" },
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

    // 내부 self-fetch용 baseUrl·admin bearer
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
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
