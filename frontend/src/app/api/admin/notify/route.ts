import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function serialize(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? Number(v) : v))
  );
}

export async function POST(request: NextRequest) {
  try {
    const { milestoneId, failureReason, evidenceUrl, retryCount } =
      await request.json();

    if (!milestoneId || !failureReason) {
      return NextResponse.json(
        { error: "milestoneId and failureReason are required" },
        { status: 400 }
      );
    }

    await prisma.notification.create({
      data: {
        milestoneId,
        type: "verification_failed",
        message: `Verification failed (attempt ${retryCount}): ${failureReason}`,
        evidenceUrl: evidenceUrl || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/admin/notify error:", error);
    return NextResponse.json(
      { error: "Failed to create notification" },
      { status: 500 }
    );
  }
}
