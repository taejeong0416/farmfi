// ── LLM 하네스 (Tool-use ReAct 오케스트레이터) ─────────────────────────────
// 원칙: 판단은 검증된 알고리즘이, LLM은 오케스트레이션+통역만.
// LLM이 "어느 알고리즘을 호출할지" 결정하면, 실제 계산은 결정론적 함수가 실행한다.
// API 키 없으면 규칙 기반 목업으로 동일 인터페이스 유지 — 키 꽂으면 실작동.
// fetch REST만 사용 (SDK 의존성 없음). Gemini generateContent REST 우선.

import { IoTReading } from "./iot-health";
import {
  maintenanceRisk,
  dliSchedule,
  cusumDrift,
  holtWintersForecast,
  seedingPlan,
  type MaintenanceReport,
  type DliPlan,
  type CusumResult,
  type DemandForecast,
  type SeedingPlan,
} from "./optimization";
import { analyzeGrowthRecipe, type GrowthRecipe, type GrowthObservation } from "./growth-recipe";

// ── 입력 컨텍스트 ─────────────────────────────────────────────────────────────
export interface FarmSituation {
  projectId: string;
  cropKey: string;
  ledPowerKw: number;
  season: "spring" | "summer" | "autumn" | "winter";
  hasAnomalySensors: string[]; // 이상 감지된 센서명
  iotReadings: IoTReading[]; // 알고리즘 실행용 실측 데이터
  salesSeries: number[]; // 일별 판매 수량 시계열
  growthObs?: GrowthObservation[]; // 생육 관측 (수율 라벨 포함)
}

// ── 도구 실행 결과 ────────────────────────────────────────────────────────────
export type ToolOutput =
  | MaintenanceReport
  | DliPlan
  | CusumResult[]
  | DemandForecast
  | SeedingPlan
  | GrowthRecipe
  | null;

export interface ToolCallRecord {
  toolName: string;
  reason: string;
  output: ToolOutput;
}

export type LLMProvider = "gemini" | "claude" | "openai" | "mock";

export interface HarnessResult {
  toolCalls: ToolCallRecord[];
  summary: string;
  isMock: boolean;
  provider: LLMProvider;
}

// ── 도구 명세 (LLM function-calling용 스펙) ──────────────────────────────────
const TOOL_SPECS = [
  {
    name: "check_maintenance_risk",
    description:
      "센서 드리프트 탐지 — 펌프 막힘·센서 열화·히터 성능 저하를 조기 발견. " +
      "예지보전이 필요한지 판단할 때 호출한다.",
  },
  {
    name: "check_cusum_drift",
    description:
      "CUSUM 관리도 — 드리프트 시작 시점을 특정한다. " +
      "check_maintenance_risk가 드리프트를 감지했을 때 언제부터인지 확인하는 데 사용한다.",
  },
  {
    name: "optimize_led_schedule",
    description:
      "TOU 요금표 기반 LED 광주기 최적화 — 전력비 절감 스케줄 계산. " +
      "전기료 절감이나 광주기 재검토가 필요할 때 사용한다.",
  },
  {
    name: "forecast_demand_and_seeding",
    description:
      "판매 시계열 → Holt-Winters 수요 예측 → 파종 권고량 산출. " +
      "자재 발주나 파종 계획 수립 시 사용한다.",
  },
  {
    name: "analyze_growth_recipe",
    description:
      "생육 관측 데이터 → 최적 재배 레시피 도출. " +
      "수율 향상을 위해 어느 환경 요인을 조정해야 하는지 분석한다. 생육 관측 데이터가 있어야 한다.",
  },
] as const;

type ToolName = (typeof TOOL_SPECS)[number]["name"];

// ── 프로바이더 감지 ───────────────────────────────────────────────────────────
function detectProvider(): LLMProvider {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "mock";
}

// ── 도구 실행 (결정론적 알고리즘 디스패치) ───────────────────────────────────
function executeTool(toolName: ToolName, situation: FarmSituation): ToolOutput {
  switch (toolName) {
    case "check_maintenance_risk":
      if (situation.iotReadings.length < 8) return null;
      return maintenanceRisk(situation.iotReadings);

    case "check_cusum_drift": {
      const lag = Math.min(48, Math.floor(situation.iotReadings.length / 4));
      if (situation.iotReadings.length < lag + 12) return null;
      return cusumDrift(situation.iotReadings, { lag });
    }

    case "optimize_led_schedule":
      return dliSchedule({ cropKey: situation.cropKey, ledPowerKw: situation.ledPowerKw });

    case "forecast_demand_and_seeding":
      if (situation.salesSeries.length === 0) return null;
      return holtWintersForecast(situation.salesSeries);

    case "analyze_growth_recipe":
      if (!situation.growthObs || situation.growthObs.length < 5) return null;
      return analyzeGrowthRecipe(situation.growthObs);

    default:
      return null;
  }
}

// ── 목업 규칙 (API 키 없을 때 결정론적 도구 선택) ────────────────────────────
function mockOrchestrate(situation: FarmSituation): HarnessResult {
  const calls: ToolCallRecord[] = [];

  // 규칙 1: 항상 예지보전 점검 (정기 운영 기본)
  const maintOut = executeTool("check_maintenance_risk", situation);
  if (maintOut !== null) {
    calls.push({
      toolName: "check_maintenance_risk",
      reason: "[목업 규칙] 정기 운영 점검: 센서 드리프트 여부 확인",
      output: maintOut,
    });

    // 규칙 2: 드리프트 감지 시 CUSUM으로 시점 특정
    const maint = maintOut as MaintenanceReport;
    if (maint.driftingSensors.length > 0) {
      const cusumOut = executeTool("check_cusum_drift", situation);
      if (cusumOut !== null) {
        calls.push({
          toolName: "check_cusum_drift",
          reason: `[목업 규칙] 드리프트 감지(${maint.driftingSensors.map((d) => d.sensor).join(", ")}) → 시작 시점 특정`,
          output: cusumOut,
        });
      }
    }
  }

  // 규칙 3: 판매 데이터가 있으면 수요 예측 실행
  if (situation.salesSeries.length >= 7) {
    calls.push({
      toolName: "forecast_demand_and_seeding",
      reason: "[목업 규칙] 주간 판매 시계열 확보 → 파종 계획 업데이트",
      output: executeTool("forecast_demand_and_seeding", situation),
    });
  }

  // 규칙 4: 이상 센서 + 생육 데이터가 있으면 레시피 재검토
  if (situation.hasAnomalySensors.length > 0 && (situation.growthObs?.length ?? 0) >= 10) {
    calls.push({
      toolName: "analyze_growth_recipe",
      reason: `[목업 규칙] 이상 센서(${situation.hasAnomalySensors.join(", ")}) 상황에서 수율 영향 분석`,
      output: executeTool("analyze_growth_recipe", situation),
    });
  }

  const summary = buildTemplateSummary(calls, situation, true);
  return { toolCalls: calls, summary, isMock: true, provider: "mock" };
}

// ── 템플릿 기반 요약 (목업 또는 LLM 폴백) ────────────────────────────────────
function buildTemplateSummary(
  calls: ToolCallRecord[],
  situation: FarmSituation,
  isMock: boolean
): string {
  const prefix = isMock ? "[LLM 미연결(목업)] " : "";
  const parts: string[] = [];

  for (const call of calls) {
    if (!call.output) continue;
    switch (call.toolName) {
      case "check_maintenance_risk": {
        const r = call.output as MaintenanceReport;
        parts.push(`예지보전: 위험점수 ${r.riskScore}σ. ${r.recommendation}`);
        break;
      }
      case "check_cusum_drift": {
        const r = call.output as CusumResult[];
        const detected = r.filter((c) => c.detected);
        if (detected.length > 0) {
          parts.push(
            `CUSUM: ${detected.map((c) => `${c.sensor}(인덱스 ${c.detectedIndex}부터 드리프트, 최대 ${c.maxStatistic}σ)`).join(" / ")}`
          );
        } else {
          parts.push("CUSUM: 드리프트 시작 시점 미감지 — 지속 모니터링 권장");
        }
        break;
      }
      case "forecast_demand_and_seeding": {
        const r = call.output as DemandForecast;
        parts.push(
          `수요 예측(${r.method}): 30일 예측 ${r.monthlyTotal}포기. ` +
            `파종 권고 → seedingPlan 참조`
        );
        break;
      }
      case "analyze_growth_recipe": {
        const r = call.output as GrowthRecipe;
        parts.push(`생육 레시피: ${r.note}`);
        break;
      }
    }
  }

  if (parts.length === 0) {
    parts.push("분석 데이터 부족 — IoT 데이터 수집 후 재시도");
  }

  return `${prefix}${situation.projectId} / ${situation.cropKey} / ${situation.season}:\n` +
    parts.join("\n");
}

// ── Gemini generateContent REST (function calling) ────────────────────────────
// 2-턴: Turn1 → 도구 선택, Turn2 → 결과 요약
async function callGeminiReact(
  systemPrompt: string,
  userMessage: string,
  situation: FarmSituation
): Promise<{ calls: ToolCallRecord[]; finalSummary: string }> {
  const key = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

  const functionDeclarations = TOOL_SPECS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: { type: "OBJECT", properties: {}, required: [] },
  }));

  // Turn 1: 도구 선택
  const body1 = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    tools: [{ functionDeclarations }],
    generationConfig: { temperature: 0.1 },
  };

  const res1 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body1),
  });
  if (!res1.ok) throw new Error(`Gemini turn1 HTTP ${res1.status}: ${await res1.text()}`);
  const data1 = await res1.json();

  const modelParts: unknown[] = data1.candidates?.[0]?.content?.parts ?? [];
  const chosenTools: ToolName[] = [];
  for (const part of modelParts as Array<{ functionCall?: { name: string } }>) {
    if (part.functionCall?.name) {
      chosenTools.push(part.functionCall.name as ToolName);
    }
  }

  // LLM이 선택한 도구 실행 (결정론적 알고리즘)
  const calls: ToolCallRecord[] = chosenTools.slice(0, 3).map((toolName) => ({
    toolName,
    reason: `Gemini 선택: ${toolName}`,
    output: executeTool(toolName, situation),
  }));

  if (calls.length === 0) {
    return { calls, finalSummary: "" };
  }

  // Turn 2: 도구 결과 전달 → 요약 생성
  const functionResponses = calls.map((c) => ({
    functionResponse: {
      name: c.toolName,
      response: { output: c.output ?? "데이터 부족으로 실행 불가" },
    },
  }));

  const body2 = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      { role: "user", parts: [{ text: userMessage }] },
      { role: "model", parts: modelParts },
      {
        role: "user",
        parts: [
          ...functionResponses,
          {
            text: "위 알고리즘 실행 결과의 숫자만 사용해 운영자 브리핑을 2~4문장으로 작성하라. 새 수치를 만들어내지 마라.",
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.3 },
  };

  const res2 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body2),
  });
  if (!res2.ok) throw new Error(`Gemini turn2 HTTP ${res2.status}`);
  const data2 = await res2.json();
  const finalSummary: string =
    (data2.candidates?.[0]?.content?.parts as Array<{ text?: string }>)?.[0]?.text ?? "";

  return { calls, finalSummary };
}

// ── Claude Messages REST (tool use) ──────────────────────────────────────────
async function callClaudeReact(
  systemPrompt: string,
  userMessage: string,
  situation: FarmSituation
): Promise<{ calls: ToolCallRecord[]; finalSummary: string }> {
  const key = process.env.ANTHROPIC_API_KEY!;
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };
  const claudeTools = TOOL_SPECS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: { type: "object" as const, properties: {} },
  }));

  // Turn 1
  const res1 = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: claudeTools,
    }),
  });
  if (!res1.ok) throw new Error(`Claude turn1 HTTP ${res1.status}: ${await res1.text()}`);
  const data1 = await res1.json();

  type ClaudeBlock =
    | { type: "tool_use"; id: string; name: string }
    | { type: "text"; text: string };
  const content1: ClaudeBlock[] = data1.content ?? [];
  const toolUseBlocks = content1.filter(
    (b): b is Extract<ClaudeBlock, { type: "tool_use" }> => b.type === "tool_use"
  );

  const calls: ToolCallRecord[] = toolUseBlocks.slice(0, 3).map((b) => ({
    toolName: b.name,
    reason: `Claude 선택: ${b.name}`,
    output: executeTool(b.name as ToolName, situation),
  }));

  if (calls.length === 0) return { calls, finalSummary: "" };

  // Turn 2
  const toolResults = calls
    .map((c, i) => ({
      type: "tool_result" as const,
      tool_use_id: toolUseBlocks[i].id,
      content: JSON.stringify(c.output ?? "데이터 부족으로 실행 불가"),
    }));

  const res2 = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: content1 },
        {
          role: "user",
          content: [
            ...toolResults,
            {
              type: "text",
              text: "위 알고리즘 결과의 숫자만 사용해 운영자 브리핑을 2~4문장으로 작성하라. 새 수치를 지어내지 마라.",
            },
          ],
        },
      ],
    }),
  });
  if (!res2.ok) throw new Error(`Claude turn2 HTTP ${res2.status}`);
  const data2 = await res2.json();
  const finalSummary: string =
    (data2.content as ClaudeBlock[])?.find((b) => b.type === "text")?.text ?? "";

  return { calls, finalSummary };
}

// ── OpenAI Chat Completions REST (function calling) ───────────────────────────
async function callOpenAIReact(
  systemPrompt: string,
  userMessage: string,
  situation: FarmSituation
): Promise<{ calls: ToolCallRecord[]; finalSummary: string }> {
  const key = process.env.OPENAI_API_KEY!;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  const tools = TOOL_SPECS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: "object", properties: {} },
    },
  }));

  const messages: unknown[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  // Turn 1
  const res1 = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({ model: "gpt-4o-mini", messages, tools, tool_choice: "auto", temperature: 0.1 }),
  });
  if (!res1.ok) throw new Error(`OpenAI turn1 HTTP ${res1.status}: ${await res1.text()}`);
  const data1 = await res1.json();

  type OAIToolCall = { id: string; function: { name: string } };
  const msg1 = data1.choices?.[0]?.message;
  const toolCalls1: OAIToolCall[] = msg1?.tool_calls ?? [];

  const calls: ToolCallRecord[] = toolCalls1.slice(0, 3).map((tc) => ({
    toolName: tc.function.name,
    reason: `OpenAI 선택: ${tc.function.name}`,
    output: executeTool(tc.function.name as ToolName, situation),
  }));

  if (calls.length === 0) return { calls, finalSummary: "" };

  // Turn 2
  const messages2 = [
    ...messages,
    msg1,
    ...toolCalls1.slice(0, 3).map((tc, i) => ({
      role: "tool",
      tool_call_id: tc.id,
      content: JSON.stringify(calls[i].output ?? "데이터 부족으로 실행 불가"),
    })),
    {
      role: "user",
      content:
        "위 알고리즘 결과의 숫자만 사용해 운영자 브리핑을 2~4문장으로 작성하라. 새 수치를 지어내지 마라.",
    },
  ];

  const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({ model: "gpt-4o-mini", messages: messages2, temperature: 0.3 }),
  });
  if (!res2.ok) throw new Error(`OpenAI turn2 HTTP ${res2.status}`);
  const data2 = await res2.json();
  const finalSummary: string = data2.choices?.[0]?.message?.content ?? "";

  return { calls, finalSummary };
}

// ── ReAct 루프 (실 LLM) ───────────────────────────────────────────────────────
async function reactLoop(
  situation: FarmSituation,
  provider: Exclude<LLMProvider, "mock">
): Promise<HarnessResult> {
  const systemPrompt =
    "당신은 스마트팜 운영 어시스턴트다. 농장 상황을 보고 아래 도구 중 필요한 것을 1~3개 선택해 호출하라. " +
    "도구는 결정론적 알고리즘이며, 당신은 '어느 도구를 호출할지'만 결정한다. 실제 계산은 알고리즘이 한다. " +
    "과도한 호출은 불필요하다.";

  const userMessage =
    `농장 상황:\n` +
    `- 프로젝트: ${situation.projectId}\n` +
    `- 작물: ${situation.cropKey}, LED ${situation.ledPowerKw}kW\n` +
    `- 계절: ${situation.season}\n` +
    `- 이상 센서: ${situation.hasAnomalySensors.length > 0 ? situation.hasAnomalySensors.join(", ") : "없음"}\n` +
    `- IoT 데이터: ${situation.iotReadings.length}건\n` +
    `- 판매 시계열: ${situation.salesSeries.length}일치\n` +
    `- 생육 관측: ${situation.growthObs?.length ?? 0}건\n\n` +
    `어느 알고리즘을 실행해야 하는가?`;

  try {
    let result: { calls: ToolCallRecord[]; finalSummary: string };
    if (provider === "gemini") {
      result = await callGeminiReact(systemPrompt, userMessage, situation);
    } else if (provider === "claude") {
      result = await callClaudeReact(systemPrompt, userMessage, situation);
    } else {
      result = await callOpenAIReact(systemPrompt, userMessage, situation);
    }

    const summary =
      result.finalSummary || buildTemplateSummary(result.calls, situation, false);

    return { toolCalls: result.calls, summary, isMock: false, provider };
  } catch {
    // LLM 호출 실패 시 목업 폴백
    const fallback = mockOrchestrate(situation);
    return { ...fallback, provider };
  }
}

// ── 진입점 ────────────────────────────────────────────────────────────────────
export async function runHarness(situation: FarmSituation): Promise<HarnessResult> {
  const provider = detectProvider();
  if (provider === "mock") return mockOrchestrate(situation);
  return reactLoop(situation, provider);
}

// 편의 함수: 시즌 추론 (월 기준)
export function inferSeason(month: number): FarmSituation["season"] {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

// seeding plan 쉽게 가져오기 (forecast 결과로 바로 파종 계획)
export function seedingFromForecast(forecast: DemandForecast): SeedingPlan {
  return seedingPlan({ monthlySalesForecast: forecast.monthlyTotal });
}
