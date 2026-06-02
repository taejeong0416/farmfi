import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const PROMPT =
  "영수증 이미지에서 금액, 항목, 일자를 JSON으로 추출해주세요. 응답 형식: { amount: number, items: string[], date: string }";

interface ExtractedData {
  amount: number;
  items: string[];
  date: string;
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
            image_url: { url: `data:image/png;base64,${imageBase64}` },
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
            source: { type: "base64", media_type: "image/png", data: imageBase64 },
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

    let extractedData: ExtractedData;
    let confidence = 0;
    let reason = "";

    try {
      extractedData = await callOpenAI(imageBase64);
    } catch {
      extractedData = await callAnthropic(imageBase64);
    }

    const passed =
      extractedData != null &&
      extractedData.amount > 0 &&
      Array.isArray(extractedData.items) &&
      extractedData.items.length > 0 &&
      typeof extractedData.date === "string" &&
      extractedData.date.length > 0;

    confidence = passed ? 0.9 : 0.3;
    reason = passed
      ? `영수증 인식 성공: ${extractedData.items.length}개 항목, 총 ${extractedData.amount}원`
      : "영수증에서 유효한 데이터를 추출하지 못했습니다.";

    return NextResponse.json({ passed, extractedData, confidence, reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { passed: false, extractedData: null, confidence: 0, reason: message },
      { status: 500 }
    );
  }
}
