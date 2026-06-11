import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { detectImageMediaType } from "@/lib/image";

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

async function callOpenAI(
  imageBase64: string,
  prompt: string
): Promise<DetectionResult> {
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
): Promise<DetectionResult> {
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

    let result: DetectionResult;

    try {
      result = await callOpenAI(imageBase64, prompt);
    } catch {
      result = await callAnthropic(imageBase64, prompt);
    }

    const passed =
      result != null &&
      result.confidence >= 0.6 &&
      Array.isArray(result.objects) &&
      result.objects.length > 0;

    const reason = passed
      ? `${result.objects.length}개 객체 감지: ${result.objects.join(", ")}`
      : "사진에서 충분한 객체를 감지하지 못했습니다.";

    return NextResponse.json({
      passed,
      detectedObjects: result?.objects ?? [],
      confidence: result?.confidence ?? 0,
      reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { passed: false, detectedObjects: [], confidence: 0, reason: message },
      { status: 500 }
    );
  }
}
