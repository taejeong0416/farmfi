import { NextRequest, NextResponse } from "next/server";
import { withAICache } from "@/lib/ai-cache";
import { extractFromImage } from "@/lib/ai-vision";

type MilestoneType = "construction" | "trial_run" | "harvest" | "operation";

const PROMPTS: Record<MilestoneType, string> = {
  construction:
    "이 사진에서 LED 조명, 센서, 재배대, 관수 설비를 식별해주세요.",
  trial_run:
    "이 사진에서 설비 가동 상태(LED 점등, 관수 작동, 작물 초기 생장)를 확인해주세요.",
  harvest:
    "이 사진에서 수확된 작물이 있는지, 작물 상태를 확인해주세요.",
  operation:
    "이 사진에서 지속 운영 현황(작물 상태, 설비 유지, 재배 환경)을 확인해주세요.",
};

const SUFFIX =
  " 응답 형식: { objects: string[], status: string, confidence: number }";

interface DetectionResult {
  objects: string[];
  status: string;
  confidence: number;
}

export async function POST(req: NextRequest) {
  try {
    const { milestoneId, imageBase64, milestoneType } = await req.json();

    if (!milestoneId || !imageBase64 || !milestoneType) {
      return NextResponse.json(
        { error: "milestoneId, imageBase64, and milestoneType are required" },
        { status: 400 }
      );
    }

    if (!PROMPTS[milestoneType as MilestoneType]) {
      return NextResponse.json(
        { error: `Invalid milestoneType: ${milestoneType}` },
        { status: 400 }
      );
    }

    const prompt = PROMPTS[milestoneType as MilestoneType] + SUFFIX;

    const response = await withAICache(milestoneId, "photo", async () => {
      const result = await extractFromImage<DetectionResult>(
        imageBase64,
        prompt
      );

      // Gemini가 객체를 {label, box_2d} 형태로 반환할 수 있어 label 문자열로 정규화
      const rawObjects = Array.isArray(result?.objects) ? result.objects : [];
      const objects: string[] = rawObjects.map((o: any) =>
        typeof o === "string" ? o : (o?.label ?? o?.name ?? String(o))
      );

      const passed =
        result != null && result.confidence >= 0.6 && objects.length > 0;

      const reason = passed
        ? `${objects.length}개 객체 감지: ${objects.join(", ")}`
        : "사진에서 충분한 객체를 감지하지 못했습니다.";

      return {
        passed,
        detectedObjects: objects,
        confidence: result?.confidence ?? 0,
        reason,
      };
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { passed: false, detectedObjects: [], confidence: 0, reason: message },
      { status: 500 }
    );
  }
}
