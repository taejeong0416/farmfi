import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { detectImageMediaType } from "@/lib/image";

// 이미지 + 프롬프트 → AI Vision 호출 → 응답에서 JSON 추출.
// 키가 설정된 provider만 Gemini → OpenAI → Anthropic 순서로 시도한다.
// 현재는 무료 Gemini만 사용. 유료 전환 = OPENAI_API_KEY / ANTHROPIC_API_KEY 를
// 채우면 자동으로 폴백 체인에 합류한다 (라우트 코드 수정 불필요).

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in AI response");
  return JSON.parse(match[0]) as T;
}

async function callGemini<T>(imageBase64: string, prompt: string): Promise<T> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        inlineData: {
          mimeType: detectImageMediaType(imageBase64),
          data: imageBase64,
        },
      },
      { text: prompt },
    ],
  });
  return extractJson<T>(res.text ?? "");
}

async function callOpenAI<T>(imageBase64: string, prompt: string): Promise<T> {
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
  return extractJson<T>(res.choices[0]?.message?.content ?? "");
}

async function callAnthropic<T>(
  imageBase64: string,
  prompt: string
): Promise<T> {
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
  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  return extractJson<T>(text);
}

// 키가 설정된 provider를 순서대로 시도, 실패 시 다음 provider로 폴백.
export async function extractFromImage<T>(
  imageBase64: string,
  prompt: string
): Promise<T> {
  const providers: Array<(img: string, p: string) => Promise<T>> = [];
  if (process.env.GEMINI_API_KEY) providers.push(callGemini);
  if (process.env.OPENAI_API_KEY) providers.push(callOpenAI);
  if (process.env.ANTHROPIC_API_KEY) providers.push(callAnthropic);

  if (providers.length === 0) {
    throw new Error(
      "AI provider 키가 없습니다 (GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY 중 하나 필요)"
    );
  }

  let lastError: unknown;
  for (const provider of providers) {
    try {
      return await provider(imageBase64, prompt);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("모든 AI provider 호출이 실패했습니다");
}
