import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

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
      typeof extractedData.address === "string" &&
      extractedData.address.length > 0 &&
      typeof extractedData.areaSqm === "number" &&
      extractedData.areaSqm > 0;

    confidence = passed ? 0.9 : 0.3;
    reason = passed
      ? `계약서 인식 성공: ${extractedData.address}, ${extractedData.areaSqm}㎡`
      : "계약서에서 주소 또는 면적 정보를 추출하지 못했습니다.";

    return NextResponse.json({ passed, extractedData, confidence, reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { passed: false, extractedData: null, confidence: 0, reason: message },
      { status: 500 }
    );
  }
}
