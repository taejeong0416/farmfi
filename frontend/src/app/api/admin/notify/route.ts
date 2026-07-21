import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeBigInt as serialize } from "@/lib/serialize";
import { requireRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const { milestoneId, failureReason, evidenceUrl, retryCount } =
      await request.json();

    if (!milestoneId || !failureReason) {
      return NextResponse.json(
        { error: "milestoneId and failureReason are required" },
        { status: 400 }
      );
    }

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    await prisma.notification.create({
      data: {
        milestoneId,
        projectId: milestone.projectId,
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
