import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { contractImage, receiptImage, photoImage, milestoneType } = body;

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!milestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    const signals: Record<string, boolean> = {};

    for (const signal of milestone.requiredSignals) {
      switch (signal) {
        case "contract": {
          const res = await fetch(`${baseUrl}/api/ai/verify-contract`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image: contractImage,
              milestoneId: id,
              milestoneType,
            }),
          });
          const data = await res.json();
          signals.contract = !!data.passed;
          break;
        }
        case "receipt": {
          const res = await fetch(`${baseUrl}/api/ai/verify-receipt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image: receiptImage,
              milestoneId: id,
              milestoneType,
            }),
          });
          const data = await res.json();
          signals.receipt = !!data.passed;
          break;
        }
        case "photo": {
          const res = await fetch(`${baseUrl}/api/ai/verify-photo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image: photoImage,
              milestoneId: id,
              milestoneType,
            }),
          });
          const data = await res.json();
          signals.photo = !!data.passed;
          break;
        }
        case "iot": {
          const res = await fetch(`${baseUrl}/api/ai/detect-anomaly`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: milestone.projectId,
              milestoneId: id,
            }),
          });
          const data = await res.json();
          if (milestone.iotMinDays > 0) {
            signals.iot = (data.uptimeRate ?? 0) >= 90;
          } else {
            signals.iot = !!data.passed;
          }
          break;
        }
      }
    }

    const passed = Object.values(signals).every((v) => v === true);

    if (passed) {
      await prisma.milestone.update({
        where: { id },
        data: {
          status: "verified",
          aiVerificationResult: signals,
        },
      });

      return NextResponse.json(
        serialize({
          passed: true,
          signals,
          retryCount: milestone.retryCount,
          txHash: null,
        })
      );
    }

    const newRetryCount = milestone.retryCount + 1;
    const newStatus = newRetryCount >= 2 ? "manual_review" : milestone.status;

    await prisma.milestone.update({
      where: { id },
      data: {
        retryCount: newRetryCount,
        status: newStatus,
        aiVerificationResult: signals,
      },
    });

    return NextResponse.json(
      serialize({
        passed: false,
        signals,
        retryCount: newRetryCount,
        txHash: null,
      })
    );
  } catch (error) {
    console.error("POST /api/milestones/[id]/verify error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
