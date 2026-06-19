import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getDemoMode, getCachedResult, saveCacheResult } from "@/lib/demo-mode";

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function findUserByName(name: string) {
  const user = await prisma.user.findFirst({ where: { name } });
  if (!user) throw new Error(`User not found: ${name}`);
  return user;
}

async function findProjectFirst() {
  const project = await prisma.project.findFirst();
  if (!project) throw new Error("No project found");
  return project;
}

async function subscribe(userName: string, tokenAmount: number) {
  const user = await findUserByName(userName);
  const project = await findProjectFirst();

  const res = await fetch(`${baseUrl}/api/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: user.id,
      projectId: project.id,
      tokenAmount,
    }),
  });

  return await res.json();
}

const milestoneTypeBySeq: Record<number, string> = {
  1: "construction",
  2: "trial_run",
  3: "harvest",
  4: "operation",
};

// public/demo/의 mock 증빙 이미지 (L2-10-3에서 준비)
const mockImagesBySeq: Record<
  number,
  { contract?: string; receipt?: string; photo?: string }
> = {
  1: { contract: "mock-contract.jpg", receipt: "mock-receipt-1.jpg", photo: "mock-photo-1.jpg" },
  2: { photo: "mock-photo-2.jpg" },
  3: { receipt: "mock-receipt-1.jpg", photo: "mock-photo-3.jpg" },
  4: { receipt: "mock-receipt-2.jpg", photo: "mock-photo-4.jpg" },
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

async function verifyAndCompleteMilestone(seq: number) {
  const project = await findProjectFirst();

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

  // Verify
  const verifyRes = await fetch(
    `${baseUrl}/api/milestones/${milestone.id}/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  );

  const completeData = await completeRes.json();

  return { verify: verifyData, complete: completeData };
}

async function distributeDividends() {
  const project = await findProjectFirst();

  const res = await fetch(`${baseUrl}/api/dividends/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: project.id,
      totalRevenue: 2_970_000,
    }),
  });

  return await res.json();
}

type StepExecutor = () => Promise<any>;

const stepExecutors: Record<number, StepExecutor> = {
  1: () => subscribe("김민수", 500),
  2: () => subscribe("이서연", 250),
  3: () => subscribe("박준혁", 1000),
  4: () => verifyAndCompleteMilestone(1),
  5: () => verifyAndCompleteMilestone(2),
  6: () => verifyAndCompleteMilestone(3),
  7: () => distributeDividends(),
  8: () => verifyAndCompleteMilestone(4),
};

export async function POST(request: NextRequest) {
  try {
    const { step } = await request.json();

    if (!step || step < 1 || step > 8) {
      return NextResponse.json(
        { error: "Invalid step (1-8)" },
        { status: 400 }
      );
    }

    // Check cache
    if (getDemoMode() === "cached") {
      const cached = await getCachedResult(step);
      if (cached) {
        return NextResponse.json(
          serialize({ step, status: "completed", result: cached, fromCache: true })
        );
      }
    }

    // Execute step
    const executor = stepExecutors[step];
    if (!executor) {
      return NextResponse.json(
        { error: `No executor for step ${step}` },
        { status: 400 }
      );
    }

    const result = await executor();

    // Save to cache
    await saveCacheResult(step, null, null, null, result);

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
