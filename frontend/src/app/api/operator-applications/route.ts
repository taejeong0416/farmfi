import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

const MAX_FIELD_LEN = 300;

function isNonEmptyString(value: unknown, maxLen = MAX_FIELD_LEN): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

/**
 * POST /api/operator-applications — submit an operator application.
 * userId is always derived from the session cookie (never trust client body) —
 * OperatorApplication.userId is a required FK so an authenticated session is mandatory.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { region, cropExperience, availableHours } = body ?? {};

    if (
      !isNonEmptyString(region) ||
      !isNonEmptyString(cropExperience) ||
      !isNonEmptyString(availableHours)
    ) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // One application per user — surface the existing one instead of creating a duplicate.
    const existing = await prisma.operatorApplication.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return NextResponse.json({ application: existing, alreadyApplied: true });
    }

    const application = await prisma.operatorApplication.create({
      data: {
        userId: session.userId,
        region: region.trim(),
        cropExperience: cropExperience.trim(),
        availableHours: availableHours.trim(),
        status: "applied",
      },
    });

    return NextResponse.json({ application, alreadyApplied: false }, { status: 201 });
  } catch (error) {
    console.error("POST /api/operator-applications error:", error);
    return NextResponse.json(
      { error: "Failed to submit application" },
      { status: 500 }
    );
  }
}

/** GET /api/operator-applications — the current session user's own application history. */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const applications = await prisma.operatorApplication.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ applications });
  } catch (error) {
    console.error("GET /api/operator-applications error:", error);
    return NextResponse.json(
      { error: "Failed to fetch applications" },
      { status: 500 }
    );
  }
}
