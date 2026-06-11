import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { detectImageMediaType } from "@/lib/image";
import { prisma } from "@/lib/db";
import { withAICache } from "@/lib/ai-cache";

function buildPrompt(conditionText: string | null): string {
  const base =
    "영수증 이미지에서 금액, 항목, 일자를 JSON으로 추출해주세요.";
  const condition = conditionText
    ? ` 그리고 이 영수증이 다음 마일스톤 조건에 부합하는 증빙인지 판단해주세요: "${conditionText}".`
    : "";
  return (
    base +
    condition +
    " 응답 형식: { amount: number, items: string[], date: string, matchesCondition: boolean, matchReason: string }"
  );
}

interface ExtractedData {
  amount: number;
  items: string[];
  date: string;
  matchesCondition?: boolean;
  matchReason?: string;
}

async function callOpenAI(
  imageBase64: string,
  prompt: string
): Promise<ExtractedData> {
  const openai = new OpenAI();
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${detectImageMediaType(imageBase64)};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 1024,
  });

  const text = res.choices[0]?.message?.content ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in OpenAI response");
  return JSON.parse(jsonMatch[0]);
}

async function callAnthropic(
  imageBase64: string,
  prompt: string
): Promise<ExtractedData> {
  const anthropic = new Anthropic();
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: detectImageMediaType(imageBase64),
              data: imageBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const text =
    res.content[0]?.type === "text" ? res.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Anthropic response");
  return JSON.parse(jsonMatch[0]);
}

export async function POST(req: NextRequest) {
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
    });

    const result = await withAICache(milestoneId, "receipt", async () => {
      const prompt = buildPrompt(milestone?.conditionText ?? null);

      let extractedData: ExtractedData;
      try {
        extractedData = await callOpenAI(imageBase64, prompt);
      } catch {
        extractedData = await callAnthropic(imageBase64, prompt);
      }

      const extractionOk =
        extractedData != null &&
        extractedData.amount > 0 &&
        Array.isArray(extractedData.items) &&
        extractedData.items.length > 0 &&
        typeof extractedData.date === "string" &&
        extractedData.date.length > 0;

      // 마일스톤 조건과의 부합 여부까지 통과해야 passed (conditionText 대조)
      const matchesCondition = milestone?.conditionText
        ? extractedData?.matchesCondition === true
        : true;

      const passed = extractionOk && matchesCondition;

      const confidence = passed ? 0.9 : 0.3;
      const reason = passed
        ? `영수증 인식 성공: ${extractedData.items.length}개 항목, 총 ${extractedData.amount}원`
        : !extractionOk
          ? "영수증에서 유효한 데이터를 추출하지 못했습니다."
          : `마일스톤 조건 불일치: ${extractedData?.matchReason ?? "사유 미상"}`;

      return { passed, extractedData, confidence, reason };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { passed: false, extractedData: null, confidence: 0, reason: message },
      { status: 500 }
    );
  }
}
