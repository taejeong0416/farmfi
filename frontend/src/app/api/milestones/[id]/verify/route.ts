import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { verifyMilestoneOnChain } from "@/lib/onchain";
import { canRunVerification } from "@/lib/milestone-gate";

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
  // 신탁 자금 집행으로 이어지는 경로라 admin 전용이다. Project에 소유자 필드가 없어
  // "내 프로젝트만" 검증을 강제할 수 없으므로, 누구나 스스로 operator가 되어
  // 남의 프로젝트를 집행하는 권한 자가상승을 admin 게이트로 차단한다.
  let session;
  try {
    session = await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const { id } = await params;
    // 자기 자신(/api/ai/*)을 부르므로 항상 현재 요청의 origin을 쓴다.
    // NEXT_PUBLIC_BASE_URL은 빌드 타임 인라인이라 로컬 .env 값이 프로덕션에
    // 구워질 수 있다(실제로 localhost:3000이 박혀 self-fetch가 죽었다).
    const baseUrl = new URL(request.url).origin;

    // 내부 self-fetch(/api/ai/*)도 인증 게이트가 걸려 있어, 호출자의 자격증명을
    // 그대로 전달한다. 데모는 Authorization: Bearer(admin), 관리자 콘솔은 쿠키.
    const authHeader = request.headers.get("authorization");
    const cookieHeader = request.headers.get("cookie");
    const internalHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    };

    const body = await request.json();
    const { contractImage, receiptImage, photoImage, milestoneType } = body;

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!milestone) {
      return NextResponse.json(
        { error: "단계를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 검증은 "제출된 증빙을 판정하는 일"이다. 증빙이 없으면 판정할 대상이 없고,
    // 여기서 통과시키면 complete가 곧바로 자금을 내보낸다 — 증빙 없는 집행 경로.
    // 이미 집행된 단계를 다시 verified로 되돌리는 이중집행 경로도 같이 막는다.
    const gate = canRunVerification(milestone);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: 400 });
    }

    const signals: Record<string, boolean> = {};
    const signalDetails: Record<string, any> = {};

    for (const signal of milestone.requiredSignals) {
      switch (signal) {
        case "contract": {
          const res = await fetch(`${baseUrl}/api/ai/verify-contract`, {
            method: "POST",
            headers: internalHeaders,
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
            headers: internalHeaders,
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
            headers: internalHeaders,
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
            headers: internalHeaders,
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

      // 온체인 기록을 남겨야 화면(ProjectDetail의 온체인 증거)이 tx를 보여줄 수 있다.
      // 이전에는 txHash를 응답에만 실어 보내 실제 체인 기록이 있어도 UI가 비어 있었다.
      // 자금 이동이 아니므로 amount=0 (tsconfig es2017 → BigInt 리터럴 대신 생성자).
      if (txHash) {
        try {
          await prisma.transaction.create({
            data: {
              projectId: milestone.projectId,
              type: "milestone_verify",
              amount: BigInt(0),
              txHash,
              memo: `마일스톤 ${milestone.seq} 검증 온체인 기록`,
            },
          });
        } catch (e) {
          console.error("verify txHash 기록 실패:", e);
        }
      }

      await recordAudit({
        actorId: session.userId,
        actorRole: "admin",
        action: "milestone.verified",
        entityType: "milestone",
        entityId: id,
        projectId: milestone.projectId,
        summary: `마일스톤 ${milestone.seq} "${milestone.name}" 검증 통과`,
        detail: { signals, txHash },
      });

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

    await recordAudit({
      actorId: session.userId,
      actorRole: "admin",
      action: "milestone.rejected",
      entityType: "milestone",
      entityId: id,
      projectId: milestone.projectId,
      summary:
        newRetryCount >= 2
          ? `마일스톤 ${milestone.seq} "${milestone.name}" 검증 2회 실패 — 수동 검토 전환 (미통과: ${failedSignals.join(", ")})`
          : `마일스톤 ${milestone.seq} "${milestone.name}" 검증 실패 ${newRetryCount}회 (미통과: ${failedSignals.join(", ")})`,
      detail: { signals, failedSignals, retryCount: newRetryCount, status: newStatus },
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
