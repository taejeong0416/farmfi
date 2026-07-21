// ── 운영자 아침 브리핑 생성기 ────────────────────────────────────────────────
// 알고리즘 출력들을 모아 운영자가 오늘 직접 해야 할 물리 작업만 담는 브리핑을 만든다.
//
// 포함: 고장 수리(설비 드리프트), 자재 발주(수요 예측), 수확(사이클), 액추에이터 수동점검
// 제외: 온도·CO2·pH 환경조절 — IoT가 자동으로 처리하므로 브리핑에 올리지 않는다.
//
// LLM 있으면 자연스러운 문장, 없으면 템플릿 기반 결정론적 문장.
// 환각 방지: LLM에는 알고리즘이 확정한 숫자만 주고 "이 숫자로만 쓰라" 제약을 건다.

import type {
  MaintenanceReport,
  CusumResult,
  DemandForecast,
  SeedingPlan,
} from "./optimization";
import { getCrop } from "./crop-profiles";
import { HEALTHY_RANGES } from "./iot-health";

// ── 브리핑 아이템 ─────────────────────────────────────────────────────────────
export type BriefingCategory = "repair" | "order" | "harvest" | "manual_check";
export type BriefingPriority = "high" | "medium" | "low";

export interface BriefingItem {
  priority: BriefingPriority;
  category: BriefingCategory;
  action: string; // 운영자가 할 일
  deadline: string; // 기한 (예: "오늘 내", "3일 내", "이번 주")
  basis: string; // 근거 (알고리즘 출력 숫자 + 출처)
}

// ── 브리핑 입력 ───────────────────────────────────────────────────────────────
export interface BriefingInput {
  projectId: string;
  cropKey: string;
  maintenance: MaintenanceReport;
  cusum: CusumResult[];
  forecast: DemandForecast;
  seeding: SeedingPlan;
  cycleDaysElapsed: number; // 현재 재배 사이클 진행 일수
  hasLedFailure: boolean; // LED/조명 액추에이터 이상 여부
  hasActuatorAnomaly: boolean; // 그 외 액추에이터(펌프·환기) 이상 여부
}

// ── 브리핑 결과 ───────────────────────────────────────────────────────────────
export interface BriefingResult {
  generatedAt: string;
  projectId: string;
  cropKey: string;
  items: BriefingItem[];
  narrative: string; // LLM 자연어 or 템플릿 문장
  isMock: boolean; // true = LLM 미연결
  llmProvider: string;
}

// ── 아이템 생성 (결정론적 — LLM 없이도 동일 로직) ───────────────────────────
export function buildBriefingItems(input: BriefingInput): BriefingItem[] {
  const items: BriefingItem[] = [];
  const crop = getCrop(input.cropKey);

  // 1. 수리 — 설비 드리프트 (maintenanceRisk)
  if (input.maintenance.driftingSensors.length > 0) {
    const sensorList = input.maintenance.driftingSensors
      .map((d) => `${d.sensor}(${d.drift}σ)`)
      .join(", ");
    const priority: BriefingPriority =
      input.maintenance.riskScore >= 4 ? "high" : "medium";
    items.push({
      priority,
      category: "repair",
      action: `센서·설비 점검: ${sensorList}. 다음 정기 방문 시 교체 또는 재보정 실시.`,
      deadline: priority === "high" ? "3일 내" : "이번 주",
      basis: `예지보전 위험점수 ${input.maintenance.riskScore}σ. ${input.maintenance.recommendation}`,
    });
  }

  // 2. 수리 보강 — CUSUM 드리프트 시작 시점 확인
  const detectedCusum = input.cusum.filter((c) => c.detected);
  if (detectedCusum.length > 0) {
    const detail = detectedCusum
      .map((c) => `${c.sensor}(인덱스 ${c.detectedIndex}부터, 최대 ${c.maxStatistic}σ)`)
      .join(", ");
    // repair 아이템이 이미 있으면 basis에 CUSUM 정보를 추가하는 대신 별도 low 아이템
    items.push({
      priority: "low",
      category: "repair",
      action: `CUSUM 드리프트 시작 기록 확인: ${detectedCusum.map((c) => c.sensor).join(", ")}. 해당 센서 보정 이력 검토.`,
      deadline: "이번 주",
      basis: `CUSUM 관리도: ${detail}`,
    });
  }

  // 3. 발주 — 파종 자재 (수요 예측 기반)
  if (input.seeding.recommendedUnits > 0) {
    const priority: BriefingPriority =
      input.seeding.recommendedUnits > input.seeding.conventionalUnits * 0.8 ? "high" : "medium";
    items.push({
      priority,
      category: "order",
      action:
        `파종 자재 발주: ${input.seeding.recommendedUnits}포기분 씨앗·배지·양액 준비. ` +
        (input.seeding.expectedWasteReduction > 0
          ? `관행(${input.seeding.conventionalUnits}포기) 대비 ${input.seeding.expectedWasteReduction}포기 폐기 절감 예상.`
          : "수요 초과 — 추가 판로 검토."),
      deadline: "3일 내",
      basis:
        `수요 예측(${input.forecast.method}): 30일 예측 ${input.forecast.monthlyTotal}포기. ` +
        `파종 권고 ${input.seeding.recommendedUnits}포기.`,
    });
  }

  // 4. 수확 — 재배 사이클 기반
  const cycleDays = crop.cycleDays;
  const daysToHarvest = Math.max(0, cycleDays - input.cycleDaysElapsed);
  if (daysToHarvest <= 3) {
    items.push({
      priority: "high",
      category: "harvest",
      action: `수확 준비: ${crop.label} 사이클 D+${input.cycleDaysElapsed}/${cycleDays}. ` +
        (daysToHarvest === 0
          ? "오늘 수확 적기."
          : `${daysToHarvest}일 후 수확. 저장·출하 준비 시작.`),
      deadline: daysToHarvest === 0 ? "오늘" : `${daysToHarvest}일 내`,
      basis: `작물 프로파일: ${crop.label} 재배 사이클 ${cycleDays}일. 현재 D+${input.cycleDaysElapsed}.`,
    });
  } else if (daysToHarvest <= 7) {
    items.push({
      priority: "medium",
      category: "harvest",
      action: `수확 예정 확인: ${crop.label} D+${input.cycleDaysElapsed}/${cycleDays}. ${daysToHarvest}일 후 수확 — 출하처 사전 조율.`,
      deadline: "이번 주",
      basis: `작물 프로파일: ${crop.label} 사이클 ${cycleDays}일.`,
    });
  }

  // 5. 수동 점검 — LED 액추에이터 이상 (IoT 자동제어 실패 시 운영자 개입)
  // 온도·CO2·pH는 제외 — IoT 자동 제어 담당
  if (input.hasLedFailure) {
    items.push({
      priority: "high",
      category: "manual_check",
      action:
        "LED 조명 수동 점검: 자동 스케줄 미작동 의심. 광량 센서 확인 후 전원 사이클 또는 드라이버 교체.",
      deadline: "오늘 내",
      basis: "IoT 조도 이상 감지 — LED 액추에이터 자동제어 실패 가능성.",
    });
  }

  if (input.hasActuatorAnomaly) {
    const [phLo, phHi] = HEALTHY_RANGES.phLevel;
    items.push({
      priority: "medium",
      category: "manual_check",
      action:
        "양액 펌프 수동 점검: 자동 순환 이상 의심. 펌프 작동 확인 및 필터 세척.",
      deadline: "오늘 내",
      basis: `IoT pH 정상범위(${phLo}~${phHi}) 이탈 감지 — 양액 펌프 또는 순환 계통 점검 필요.`,
    });
  }

  // 우선순위 정렬: high → medium → low, 동 우선순위 내 category 순서
  const priorityRank: Record<BriefingPriority, number> = { high: 0, medium: 1, low: 2 };
  const categoryRank: Record<BriefingCategory, number> = {
    manual_check: 0,
    repair: 1,
    harvest: 2,
    order: 3,
  };
  items.sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      categoryRank[a.category] - categoryRank[b.category]
  );

  return items;
}

// ── 환각 방지 그라운딩 프롬프트 구성 ─────────────────────────────────────────
function buildGroundingPrompt(items: BriefingItem[], cropLabel: string): string {
  const itemLines = items
    .map(
      (item, i) =>
        `[${i + 1}] 우선순위=${item.priority} / 분류=${item.category}\n` +
        `  작업: ${item.action}\n` +
        `  기한: ${item.deadline}\n` +
        `  근거: ${item.basis}`
    )
    .join("\n");

  return (
    `아래는 ${cropLabel} 스마트팜의 오늘 운영 현황이다. ` +
    `알고리즘이 확정한 수치와 권고만 담겨 있다.\n\n` +
    itemLines +
    `\n\n` +
    `위 정보만 사용해 운영자용 아침 브리핑을 3~5문장으로 작성하라. ` +
    `새 수치를 지어내지 마라. ` +
    `온도·CO2·pH 조절은 IoT가 자동 처리하므로 언급하지 마라. ` +
    `사람이 직접 해야 할 작업에 집중하라.`
  );
}

// ── Gemini로 내러티브 생성 ────────────────────────────────────────────────────
async function geminiNarrative(groundingPrompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: groundingPrompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini narrative HTTP ${res.status}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts as Array<{ text?: string }>)?.[0]?.text ?? "";
}

// ── Claude로 내러티브 생성 ────────────────────────────────────────────────────
async function claudeNarrative(groundingPrompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY!;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: groundingPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude narrative HTTP ${res.status}`);
  const data = await res.json();
  type Block = { type: string; text?: string };
  return (data.content as Block[])?.find((b) => b.type === "text")?.text ?? "";
}

// ── OpenAI로 내러티브 생성 ────────────────────────────────────────────────────
async function openaiNarrative(groundingPrompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY!;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 300,
      temperature: 0.4,
      messages: [{ role: "user", content: groundingPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI narrative HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── 템플릿 기반 내러티브 (LLM 없을 때 결정론적) ─────────────────────────────
function templateNarrative(items: BriefingItem[], cropLabel: string): string {
  const high = items.filter((i) => i.priority === "high");
  const medium = items.filter((i) => i.priority === "medium");
  const parts: string[] = [];

  if (high.length > 0) {
    parts.push(
      `오늘 최우선 작업 ${high.length}건: ` +
        high.map((i) => `[${i.category}] ${i.action.split(".")[0]}`).join("; ") +
        "."
    );
  }
  if (medium.length > 0) {
    parts.push(
      `이번 주 내 처리할 작업 ${medium.length}건: ` +
        medium.map((i) => i.action.split(".")[0]).join("; ") +
        "."
    );
  }
  if (items.length === 0) {
    parts.push(`${cropLabel} 농장 정상 운영 중. 오늘 추가 물리 작업 없음.`);
  }

  parts.push("[LLM 미연결(목업) — API 키 설정 시 자연어 브리핑 전환]");
  return parts.join(" ");
}

// ── 진입점: 브리핑 생성 ───────────────────────────────────────────────────────
export async function generateBriefing(input: BriefingInput): Promise<BriefingResult> {
  const crop = getCrop(input.cropKey);
  const items = buildBriefingItems(input);

  // LLM 프로바이더 감지
  const provider = process.env.GEMINI_API_KEY
    ? "gemini"
    : process.env.ANTHROPIC_API_KEY
      ? "claude"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : "mock";

  let narrative: string;
  let isMock = false;

  if (provider === "mock") {
    narrative = templateNarrative(items, crop.label);
    isMock = true;
  } else {
    const groundingPrompt = buildGroundingPrompt(items, crop.label);
    try {
      if (provider === "gemini") narrative = await geminiNarrative(groundingPrompt);
      else if (provider === "claude") narrative = await claudeNarrative(groundingPrompt);
      else narrative = await openaiNarrative(groundingPrompt);
    } catch {
      // LLM 실패 시 템플릿 폴백 (isMock는 false 유지 — 키는 있음)
      narrative = templateNarrative(items, crop.label).replace(
        "[LLM 미연결(목업) — API 키 설정 시 자연어 브리핑 전환]",
        "[LLM 일시 오류 — 템플릿 대체]"
      );
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    projectId: input.projectId,
    cropKey: input.cropKey,
    items,
    narrative,
    isMock,
    llmProvider: provider,
  };
}
