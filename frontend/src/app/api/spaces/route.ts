import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";

/**
 * Deterministic smart-farm suitability score (0-100).
 * Server-authoritative — client-sent scores are ignored.
 * Weights: lighting 40 (광량이 스마트팜 핵심), electricity 25, water 20, area 15.
 */
function computeSuitabilityScore(input: {
  lighting: string;
  electricity: string;
  water: string;
  area: string;
}): number {
  const lightingScore: Record<string, number> = {
    "매우 좋음": 40,
    "좋음": 32,
    "보통": 22,
    "낮음": 12,
  };
  const utilityScore = (v: string, max: number): number => {
    if (v.includes("불가")) return Math.round(max * 0.2);
    if (v.includes("부분")) return Math.round(max * 0.6);
    if (v.includes("가능")) return max;
    return Math.round(max * 0.5); // unknown → neutral
  };

  const light = lightingScore[input.lighting.trim()] ?? 22;
  const elec = utilityScore(input.electricity, 25);
  const water = utilityScore(input.water, 20);

  // Area: larger contiguous space is modestly more suitable for a farm module.
  const pyeong = parsePyeong(input.area);
  const areaScore =
    pyeong >= 100 ? 15 : pyeong >= 50 ? 12 : pyeong >= 20 ? 9 : 6;

  const total = light + elec + water + areaScore;
  return Math.max(0, Math.min(100, total));
}

/** Extract a representative pyeong figure from a range string like "50~100평" / "~50평". */
function parsePyeong(area: string): number {
  const nums = area.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length === 0) return 30; // default assumption
  if (nums.length === 1) return nums[0];
  return Math.round((nums[0] + nums[1]) / 2);
}

/**
 * Estimated monthly rent (KRW int), server-authoritative.
 * Base ~30,000 KRW per pyeong/month (도심 유휴공간 가정).
 */
function computeEstimatedRent(area: string): number {
  const pyeong = parsePyeong(area);
  return Math.round(pyeong * 30000);
}

const SPACE_TYPES = ["rooftop", "vacant_store", "indoor"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      spaceType,
      address,
      area,
      electricity,
      water,
      lighting,
      preferredMode,
      photos,
    } = body ?? {};

    // Input validation — reject malformed payloads.
    if (
      typeof spaceType !== "string" ||
      !SPACE_TYPES.includes(spaceType) ||
      typeof address !== "string" ||
      address.trim().length === 0 ||
      typeof area !== "string" ||
      typeof electricity !== "string" ||
      typeof water !== "string" ||
      typeof lighting !== "string" ||
      typeof preferredMode !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const photoUrls: string[] = Array.isArray(photos)
      ? photos.filter((p): p is string => typeof p === "string")
      : [];

    // ownerId from session if present; never trusted from client body.
    const session = await getServerSession();
    const ownerId = session?.userId ?? null;

    // Server-computed — client cannot influence score/rent.
    const suitabilityScore = computeSuitabilityScore({
      lighting,
      electricity,
      water,
      area,
    });
    const estimatedRent = computeEstimatedRent(area);

    const space = await prisma.space.create({
      data: {
        ownerId,
        spaceType,
        address,
        area,
        electricity,
        water,
        lighting,
        preferredMode,
        photos: photoUrls,
        suitabilityScore,
        estimatedRent,
        status: "submitted",
      },
    });

    return NextResponse.json({ space }, { status: 201 });
  } catch (error) {
    console.error("POST /api/spaces error:", error);
    return NextResponse.json(
      { error: "Failed to create space" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const spaces = await prisma.space.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ spaces });
  } catch (error) {
    console.error("GET /api/spaces error:", error);
    return NextResponse.json(
      { error: "Failed to fetch spaces" },
      { status: 500 }
    );
  }
}
