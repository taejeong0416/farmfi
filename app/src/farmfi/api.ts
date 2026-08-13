// 백엔드(frontend/src/app/api/**) 응답 계약과 픽셀아트 UI 사이의 변환 계층.
// 화면은 이 파일의 타입만 알면 되고, 목데이터는 어디에도 남기지 않는다.
import type { CropKind, RackId } from "./data";

// ─── GET /api/inventory ───
export type InventoryItem = {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  unitPrice: number;
  inStock: number;
  growing: number;
  plantedAt: string | null;
  expectedHarvestAt: string | null;
  growDays: number;
  maturityPercent: number;
  daysToHarvest: number | null;
  harvestReady: boolean;
};

export type InventoryProject = {
  projectId: string;
  projectName: string;
  projectStatus: string;
  projectLocation: string | null;
  items: InventoryItem[];
  summary: {
    bedCount: number;
    inStockTotal: number;
    growingTotal: number;
    harvestReadyTotal: number;
    monthlyHarvest: number;
  };
};

export type InventoryResponse = {
  generatedAt: string;
  projectId: string | null;
  projects: InventoryProject[];
};

// ─── GET /api/sales ───
export type SalesResponse = {
  project: { id: string; name: string };
  periodDays: number;
  // 조회 창의 끝점 = 판매 최신 시각. stale이면 화면이 기준일을 밝힌다.
  dataAsOf: string | null;
  stale: boolean;
  summary: { totalAmount: number; totalQuantity: number; orderCount: number };
  daily: { date: string; amount: number; quantity: number; orderCount: number }[];
  recent: {
    id: string;
    soldAt: string;
    productId: string;
    productName: string;
    unit: string;
    quantity: number;
    amount: number;
  }[];
};

// ─── GET /api/sales/trend ───
export type SalesTrendResponse = {
  projectId: string;
  periodDays: number;
  byProduct: {
    productId: string;
    productName: string;
    totalQuantity: number;
    totalAmount: number;
    avgDaily: number;
    recommendation: string;
  }[];
};

// ─── GET /api/tasks/today ───
export type TodayTasksResponse = {
  projectId: string;
  generatedAt: string;
  tasks: {
    type: "harvest" | "restock";
    productId: string;
    productName: string;
    message: string;
  }[];
};

// ─── GET /api/monitoring/[projectId] (요약만 사용하는 화면용 부분 타입) ───
export type LightAssessment = {
  dliTarget: number;
  recentDli: number;
  ratioPct: number;
  status: "ok" | "under" | "over" | "unknown";
  degrading: boolean;
  message: string;
};

export type HarvestForecast = {
  cropLabel: string;
  cycleElapsedDays: number;
  accumulatedGdd: number;
  targetGdd: number;
  gddProgressPct: number;
  observedGrowthPct: number;
  daysRemaining: number | null;
  delayDays: number | null;
  message: string;
};

export type MonitoringSummaryResponse = {
  project: { id: string; name: string };
  days: number;
  // 조회 창의 끝점 = 센서 최신 시각. stale이면 화면이 기준일을 밝힌다.
  dataAsOf: string | null;
  stale: boolean;
  points: { humidity: number; healthy: boolean; growthRate: number }[];
  light: LightAssessment;
  harvest: HarvestForecast;
  summary: {
    count: number;
    uptimeRate: number;
    anomalyCount: number;
    driftSensors: string[];
    suboptimalCount: number;
    latestHealthy: boolean;
  };
};

// ─── 성숙도 → 생육 단계 문구 ───
export function stageLabel(maturityPercent: number): string {
  if (maturityPercent >= 90) return "수확기";
  if (maturityPercent >= 60) return "성장기";
  if (maturityPercent >= 25) return "생장기";
  return "발아기";
}

// ─── 품목명 → 스프라이트 작물 ───
// 백엔드 품목(상추·루꼴라·바질)과 스프라이트 셀(butter·romaine·basil·tomato)은
// 1:1이 아니다. 이름 우선, 없으면 category(leafy/herb)로 떨어뜨린다.
const CROP_BY_NAME: { match: string; kind: CropKind }[] = [
  { match: "토마토", kind: "tomato" },
  { match: "바질", kind: "basil" },
  { match: "루꼴라", kind: "romaine" },
  { match: "로메인", kind: "romaine" },
  { match: "상추", kind: "butter" },
  { match: "버터", kind: "butter" },
];

export function cropKindOf(productName: string, category?: string): CropKind {
  const hit = CROP_BY_NAME.find((c) => productName.includes(c.match));
  if (hit) return hit.kind;
  if (category === "herb") return "basil";
  if (category === "fruit") return "tomato";
  return "romaine";
}

// ─── 베드 라벨 ───
// 베드는 품목 수만큼 생긴다. 스프라이트/탭 UI가 A~D 4칸까지 지원하므로 그 범위로 자른다.
const RACK_IDS: RackId[] = ["A", "B", "C", "D"];

export function rackIdAt(index: number): RackId {
  return RACK_IDS[index % RACK_IDS.length];
}

// ─── 예상 수확 시점 문구 ───
export function harvestLabel(daysToHarvest: number | null): string {
  if (daysToHarvest === null) return "미정";
  if (daysToHarvest <= 0) return "수확 가능";
  if (daysToHarvest === 1) return "내일";
  return `${daysToHarvest}일 후`;
}

// ─── 지점 운영 상태 문구 (Project.status) ───
const STATUS_LABEL: Record<string, string> = {
  upcoming: "준비 중",
  funding: "모집 중",
  funded: "모집 완료",
  operating: "정상",
  paused: "점검 중",
  completed: "종료",
  failed: "중단",
};

export function projectStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

// ─── 막대그래프 비율 — 최댓값을 100%로 잡는 상대 스케일 ───
export function ratioPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

// ─── 표시용 포맷 ───
export function formatWon(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

export function formatMonthDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--.--";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}.${dd}`;
}
