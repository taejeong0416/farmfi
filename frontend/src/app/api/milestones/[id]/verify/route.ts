import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { verifyMilestoneOnChain } from "@/lib/onchain";

// 교차검증(receipt↔photo): 영수증 구매 항목과 사진 검출 객체가
// 같은 설비 카테고리를 하나 이상 공유하는지 확인
const CROSS_CHECK_CATEGORIES: string[][] = [
  ["led", "조명", "라이트", "light", "lamp"],
  ["센서", "sensor"],
  ["재배", "선반", "베드", "rack", "bed", "shelf"],
  ["관수", "급수", "펌프", "양액", "pump", "irrigation"],
];

function crossCheckReceiptPhoto(
  receiptItems: string[],
  photoObjects: string[]
): boolean {
  const receiptText = receiptItems.join(" ").toLowerCase();
  const photoText = photoObjects.join(" ").toLowerCase();
  return CROSS_CHECK_CATEGORIES.some(
    (category) =>
      category.some((k) => receiptText.includes(k)) &&
      category.some((k) => photoText.includes(k))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const { id } = await params;
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
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
    const signalDetails: Record<string, any> = {};

    for (const signal of milestone.requiredSignals) {
      switch (signal) {
        case "contract": {
          const res = await fetch(`${baseUrl}/api/ai/verify-contract`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: contractImage,
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
              imageBase64: receiptImage,
              milestoneId: id,
              milestoneType,
            }),
          });
          const data = await res.json();
          signals.receipt = !!data.passed;
          signalDetails.receipt = data;
          break;
        }
        case "photo": {
          const res = await fetch(`${baseUrl}/api/ai/verify-photo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: photoImage,
              milestoneId: id,
              milestoneType,
            }),
          });
          const data = await res.json();
          signals.photo = !!data.passed;
          signalDetails.photo = data;
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
            // 데이터가 1건 이상 있고 이상 미감지일 때만 통과 (0건 자동 통과 방지)
            signals.iot = (data.dataCount ?? 0) > 0 && !data.anomalyDetected;
          }
          break;
        }
      }
    }

    // 교차검증 (예: 마일스톤 1 — 영수증 구매 항목 ↔ 사진 검출 설비 일치)
    if (milestone.crossCheck === "receipt↔photo") {
      const receiptItems: string[] =
        signalDetails.receipt?.extractedData?.items ?? [];
      const photoObjects: string[] =
        signalDetails.photo?.detectedObjects ?? [];
      signals.crossCheck = crossCheckReceiptPhoto(receiptItems, photoObjects);
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

      // 검증 통과를 온체인에 기록 (배포 전이면 null, 체인 오류 시 DB는 유지)
      let txHash: string | null = null;
      try {
        txHash = await verifyMilestoneOnChain(milestone.seq);
      } catch (e) {
        console.error("verifyMilestoneOnChain failed:", e);
      }

      return NextResponse.json(
        serialize({
          passed: true,
          signals,
          retryCount: milestone.retryCount,
          txHash,
        })
      );
    }

    const newRetryCount = milestone.retryCount + 1;
    const newStatus = newRetryCount >= 2 ? "manual_review" : milestone.status;

    const failedSignals = Object.entries(signals)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    await prisma.milestone.update({
      where: { id },
      data: {
        retryCount: newRetryCount,
        status: newStatus,
        aiVerificationResult: signals,
      },
    });

    // 관리자 알림 (1회 실패: 재검증 안내 / 2회 실패: 수동 검토 전환)
    await prisma.notification.create({
      data: {
        milestoneId: id,
        projectId: milestone.projectId,
        type: newRetryCount >= 2 ? "manual_review" : "verification_failed",
        message:
          newRetryCount >= 2
            ? `마일스톤 "${milestone.name}" AI 검증 2회 실패 — 수동 검토로 전환됨 (미통과 신호: ${failedSignals.join(", ")})`
            : `마일스톤 "${milestone.name}" AI 검증 실패 (${newRetryCount}회) — 미통과 신호: ${failedSignals.join(", ")}. 재검증 1회 가능.`,
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
