import { NextRequest, NextResponse } from "next/server";
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

async function verifyAndCompleteMilestone(seq: number) {
  const project = await findProjectFirst();

  const milestone = await prisma.milestone.findUnique({
    where: { projectId_seq: { projectId: project.id, seq } },
  });

  if (!milestone) throw new Error(`Milestone seq ${seq} not found`);

  // Verify
  const verifyRes = await fetch(
    `${baseUrl}/api/milestones/${milestone.id}/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        milestoneType: milestone.name,
        contractImage: "demo-contract.png",
        receiptImage: "demo-receipt.png",
        photoImage: "demo-photo.png",
      }),
    }
  );

  const verifyData = await verifyRes.json();

  // If verification didn't pass, force verified status for demo
  if (!verifyData.passed) {
    await prisma.milestone.update({
      where: { id: milestone.id },
      data: { status: "verified", aiVerificationResult: { demo: true } },
    });
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
      totalRevenue: 3_000_000,
    }),
  });

  return await res.json();
}

type StepExecutor = () => Promise<any>;

const stepExecutors: Record<number, StepExecutor> = {
  1: () => subscribe("김민수", 200),
  2: () => subscribe("이서연", 150),
  3: () => subscribe("박준혁", 650),
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
