import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAICache } from "@/lib/ai-cache";
import { extractFromImage } from "@/lib/ai-vision";
import { requireRole } from "@/lib/auth";

const PROMPT =
  "설비 설치 검수확인서 이미지에서 검수 항목과 결과를 JSON으로 추출해주세요. 응답 형식: { siteName: string, inspectedAt: string, inspector: string, vendor: string, unitCount: number, defects: string[], accepted: boolean }. accepted는 검수를 최종 합격 처리했는지 여부이고, defects는 지적된 하자 항목 목록입니다.";

interface ExtractedData {
  siteName: string;
  inspectedAt: string;
  inspector: string;
  vendor: string;
  unitCount: number;
  defects: string[];
  accepted: boolean;
}

/**
 * POST /api/ai/verify-inspection — 검수확인서 판독 (마일스톤 4 신호).
 *
 * 설치 완료 단계는 사진만으로는 부족하다. 사진은 "설비가 있다"까지만 말하고
 * "검수를 통과했다"는 말하지 못한다. 그래서 양자(운영자·설비업체)가 서명한
 * 검수확인서를 따로 받아, 합격 처리 여부와 하자 목록을 함께 본다.
 */
export async function POST(req: NextRequest) {
  // 마일스톤 검증 신호를 만드는 라우트 — 미인증 호출로 캐시를 채워
  // 이후 검증을 통과시키는 경로를 막는다.
  try {
    await requireRole("operator");
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  try {
    const { milestoneId, imageBase64 } = await req.json();

    if (!milestoneId || !imageBase64) {
      return NextResponse.json(
        { error: "milestoneId and imageBase64 are required" },
        { status: 400 }
      );
    }

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { project: true },
    });

    const result = await withAICache(
      milestoneId,
      "inspection",
      imageBase64,
      async () => {
        const extractedData = await extractFromImage<ExtractedData>(
          imageBase64,
          PROMPT
        );

        const extractionOk =
          extractedData != null &&
          typeof extractedData.accepted === "boolean" &&
          typeof extractedData.siteName === "string" &&
          extractedData.siteName.length > 0;

        // 현장명이 프로젝트와 맞는지 본다. 이름 전체가 같기를 요구하면 표기 차이로
        // 다 떨어지므로, 프로젝트 이름·소재지에서 뽑은 토큰이 하나라도 걸리면 통과.
        let siteMatch = true;
        if (extractionOk && milestone?.project) {
          const { name, location } = milestone.project;
          const tokens = [name, location ?? ""]
            .join(" ")
            .split(/\s+/)
            .filter((t) => t.length >= 2);
          siteMatch =
            tokens.length === 0 ||
            tokens.some((t) => extractedData.siteName.includes(t));
        }

        // 하자가 남아 있으면 합격 표기가 있어도 통과시키지 않는다.
        // 검수확인서의 존재가 아니라 검수 결과가 신호다.
        const defects = Array.isArray(extractedData?.defects)
          ? extractedData.defects
          : [];
        const noDefects = defects.length === 0;
        const accepted = extractionOk && extractedData.accepted === true;

        const passed = extractionOk && siteMatch && accepted && noDefects;

        const confidence = passed ? 0.9 : 0.3;
        const reason = passed
          ? `검수확인서 인식 성공: ${extractedData.siteName} · ${extractedData.unitCount ?? "-"}유닛 합격 (검수자 ${extractedData.inspector ?? "-"})`
          : !extractionOk
            ? "검수확인서에서 현장명 또는 합격 여부를 추출하지 못했습니다."
            : !siteMatch
              ? `검수확인서 현장(${extractedData.siteName})이 프로젝트(${milestone?.project?.name})와 일치하지 않습니다.`
              : !accepted
                ? "검수확인서가 합격으로 처리되지 않았습니다."
                : `하자가 남아 있습니다: ${defects.join(", ")}`;

        return { passed, extractedData, confidence, reason, defects };
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { passed: false, extractedData: null, confidence: 0, reason: message },
      { status: 500 }
    );
  }
}
