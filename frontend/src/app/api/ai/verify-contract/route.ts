import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { detectImageMediaType } from "@/lib/image";
import { prisma } from "@/lib/db";
import { withAICache } from "@/lib/ai-cache";

const PROMPT =
  "임대차 계약서 이미지에서 임대인, 임차인, 주소, 면적(㎡), 계약기간, 월세를 JSON으로 추출해주세요. 응답 형식: { landlord: string, tenant: string, address: string, areaSqm: number, period: string, rent: number }";

interface ExtractedData {
  landlord: string;
  tenant: string;
  address: string;
  areaSqm: number;
  period: string;
  rent: number;
}

async function callOpenAI(imageBase64: string): Promise<ExtractedData> {
  const openai = new OpenAI();
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
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

async function callAnthropic(imageBase64: string): Promise<ExtractedData> {
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
          { type: "text", text: PROMPT },
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
      include: { project: true },
    });

    const result = await withAICache(milestoneId, "contract", async () => {
      let extractedData: ExtractedData;
      try {
        extractedData = await callOpenAI(imageBase64);
      } catch {
        extractedData = await callAnthropic(imageBase64);
      }

      const extractionOk =
        extractedData != null &&
        typeof extractedData.address === "string" &&
        extractedData.address.length > 0 &&
        typeof extractedData.areaSqm === "number" &&
        extractedData.areaSqm > 0;

      // 프로젝트 정보와 대조: 주소(지역 토큰 포함 여부) + 면적(±20%)
      let addressMatch = true;
      let areaMatch = true;
      if (extractionOk && milestone?.project) {
        const { location, areaSqm } = milestone.project;
        if (location) {
          const tokens = location.split(/\s+/).filter((t) => t.length >= 2);
          addressMatch = tokens.some((t) => extractedData.address.includes(t));
        }
        if (areaSqm && areaSqm > 0) {
          areaMatch = Math.abs(extractedData.areaSqm - areaSqm) / areaSqm <= 0.2;
        }
      }

      const passed = extractionOk && addressMatch && areaMatch;

      const confidence = passed ? 0.9 : 0.3;
      const reason = passed
        ? `계약서 인식 성공: ${extractedData.address}, ${extractedData.areaSqm}㎡`
        : !extractionOk
          ? "계약서에서 주소 또는 면적 정보를 추출하지 못했습니다."
          : !addressMatch
            ? `계약서 주소(${extractedData.address})가 프로젝트 위치(${milestone?.project?.location})와 일치하지 않습니다.`
            : `계약서 면적(${extractedData.areaSqm}㎡)이 프로젝트 면적(${milestone?.project?.areaSqm}㎡)과 ±20% 이상 차이 납니다.`;

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
