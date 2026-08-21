// 백엔드(frontend/src/app/api/**) 응답 계약과 픽셀아트 UI 사이의 변환 계층.
// 화면은 이 파일의 타입만 알면 되고, 목데이터는 어디에도 남기지 않는다.
import type { CropKind, RackId } from "./data";

// ─── GET /api/inventory ───
export type InventoryItem = {
  // 재고 조정 API 가 이 행을 가리킨다. 화면이 고칠 리소스의 id 를 알아야 한다.
  inventoryId: string;
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

// ─── GET /api/notifications?projectId= ───
export type FarmNotification = {
  id: string;
  projectId: string | null;
  type: string;
  message: string;
  evidenceUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationsResponse = { notifications: FarmNotification[] };

// 알림 종류 → 화면 표기. 등급을 색으로 나누지 않으므로 severity는 배지 글자에만 쓴다.
const ALERT_KIND: Record<string, { title: string; severity: "critical" | "warning" }> = {
  anomaly_detected: { title: "생육 이상 감지", severity: "critical" },
  verification_failed: { title: "검증 실패", severity: "critical" },
  manual_review: { title: "수동 확인 요청", severity: "warning" },
};

export function alertKind(type: string): { title: string; severity: "critical" | "warning" } {
  return ALERT_KIND[type] ?? { title: "설비 알림", severity: "warning" };
}

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

// ─── 센서 판독 (모니터링 응답의 points 전체 필드) ───
// 센서는 지점 단위로 수집된다 — 베드마다 따로 달려 있지 않다.
export type SensorKey = "temperature" | "humidity" | "co2Level" | "phLevel";

export type MonitoringPoint = {
  t: string;
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
  growthRate: number;
  isAnomaly: boolean;
  outOfRange: string[];
  outOfOptimal: string[];
  healthy: boolean;
};

export type MonitoringDetailResponse = Omit<MonitoringSummaryResponse, "points"> & {
  points: MonitoringPoint[];
  healthyRanges: Record<string, [number, number]>;
  optimalRanges: Record<string, [number, number]>;
};

export const SENSOR_META: Record<SensorKey, { label: string; unit: string; digits: number }> = {
  temperature: { label: "온도", unit: "℃", digits: 1 },
  humidity: { label: "습도", unit: "%", digits: 0 },
  co2Level: { label: "CO₂", unit: "ppm", digits: 0 },
  // Figma에는 EC 칸이 있지만 수집하는 값은 pH다. 없는 값을 EC라고 부르지 않는다.
  phLevel: { label: "pH", unit: "", digits: 1 },
};

export function formatReading(key: SensorKey, value: number): string {
  const m = SENSOR_META[key];
  return `${value.toFixed(m.digits)}${m.unit}`;
}

// 정상 범위 안이면 normal, 벗어나면 critical. 등급을 더 잘게 나누지 않는다.
export function readingSeverity(
  key: SensorKey,
  value: number,
  ranges?: Record<string, [number, number]>
): "normal" | "critical" {
  const r = ranges?.[key];
  if (!r) return "normal";
  return value < r[0] || value > r[1] ? "critical" : "normal";
}

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

export function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--.-- --:--";
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${formatMonthDay(iso)} ${hh}:${mi}`;
}

// ── 마일스톤 증빙 (M-13) ─────────────────────────────────────────────────────
// 매장 개점 여정. 단계는 순서대로만 열리고, 증빙이 승인돼야 그 단계 자금이 나간다.
// 순서 게이트는 서버가 건다 — 화면은 그 상태를 그대로 그린다.

export type MilestoneStatus =
  | "pending"
  | "in_progress"
  | "evidence_submitted"
  | "manual_review"
  | "revision_required"
  | "verified"
  | "completed"
  | "failed";

export type Milestone = {
  id: string;
  seq: number;
  name: string;
  description: string | null;
  status: string;
  conditionText: string | null;
  releaseAmount: number;
  releasePct: number;
  requiredSignals: string[];
  evidenceUrls: string[];
  evidenceHashes?: string[];
  evidenceNote: string | null;
  evidenceSubmittedAt: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  deadlineAt: string | null;
  project: { id: string; name: string; location: string | null };
};

export type MilestonesResponse = { milestones: Milestone[] };

/** 증빙 종류 — requiredSignals의 코드값이 그대로 온다. */
export const SIGNAL_META: Record<
  string,
  { label: string; icon: "evidence-contract" | "evidence-receipt" | "evidence-photo" | "evidence-sensor"; capture: boolean }
> = {
  contract: { label: "계약서", icon: "evidence-contract", capture: false },
  receipt: { label: "영수증", icon: "evidence-receipt", capture: true },
  photo: { label: "현장 사진", icon: "evidence-photo", capture: true },
  iot: { label: "센서 데이터", icon: "evidence-sensor", capture: false },
};

/**
 * 단계 진행 상태 — 게임의 스테이지와 같다.
 *   done   이미 집행이 끝난 단계
 *   active 지금 할 차례
 *   locked 앞 단계가 안 끝나 열리지 않은 단계
 */
export type StageState = "done" | "active" | "locked";

export function stageStateOf(m: Milestone, all: Milestone[]): StageState {
  if (m.status === "completed") return "done";
  // 앞 단계가 하나라도 안 끝났으면 잠긴다. 서버 집행 게이트와 같은 규칙이라
  // 화면에서 열어 놓고 서버가 거절하는 어긋남이 생기지 않는다.
  const blocked = all.some((o) => o.seq < m.seq && o.status !== "completed");
  return blocked ? "locked" : "active";
}

export const MILESTONE_STAGE_LABEL: Record<string, string> = {
  pending: "증빙 대기",
  in_progress: "진행 중",
  evidence_submitted: "검토 중",
  manual_review: "보류",
  revision_required: "보완 요청",
  verified: "승인됨",
  completed: "집행 완료",
  failed: "실패",
};

/** 운영자가 지금 증빙을 낼 수 있는 상태인가. 서버 canSubmitEvidence와 같은 목록이다. */
export function canSubmitEvidence(status: string): boolean {
  return (
    status === "pending" ||
    status === "in_progress" ||
    status === "revision_required" ||
    status === "evidence_submitted" ||
    status === "manual_review"
  );
}

// ── 설정점 봉투 (Phase W2) ───────────────────────────────────────────────────
// 학습된 레시피가 낸 목표값을 그대로 설비에 넘기지 않는다. 규칙이 먼저 판단하고
// 학습은 규칙이 허용한 범위를 넓히지 못한다. 화면은 "모델이 뭐라 했고 우리가 뭘
// 했나"를 나란히 보여준다 — 그 대조가 사라지면 모델을 고칠 근거도 사라진다.

export type EnvelopeVerdict =
  | "APPLIED"
  | "CLAMPED_AGRONOMIC"
  | "CLAMPED_EQUIPMENT"
  | "CLAMPED_RATE"
  | "REJECTED_SURFACE"
  | "REJECTED_BOUNDARY"
  | "REJECTED_INVALID";

export type EnvelopeDecision = {
  feature: string;
  label: string;
  unit: string;
  proposed: number | null;
  applied: number;
  baseline: number | null;
  verdict: EnvelopeVerdict;
  reason: string;
  bounds: [number, number];
};

export type SetpointsResponse = {
  envelope: {
    cropKey: string;
    decisions: EnvelopeDecision[];
    anyApplied: boolean;
    adjusted: number;
    note: string;
  };
  surface: string;
  samples: number;
  modelR2: number | null;
  observationSource: string;
  history: {
    id: string;
    cropKey: string;
    adjusted: number;
    surface: string;
    samples: number;
    note: string | null;
    appliedAt: string;
  }[];
};

/** 판정별 표시 — 조정·거부만 색으로 튀게 하고 통과는 조용히 둔다. */
export const VERDICT_META: Record<
  EnvelopeVerdict,
  { label: string; tone: "pass" | "adjust" | "reject" }
> = {
  APPLIED: { label: "적용", tone: "pass" },
  CLAMPED_AGRONOMIC: { label: "범위로 조정", tone: "adjust" },
  CLAMPED_EQUIPMENT: { label: "설비 한계", tone: "adjust" },
  CLAMPED_RATE: { label: "변화폭 제한", tone: "adjust" },
  REJECTED_SURFACE: { label: "채택 안 함", tone: "reject" },
  REJECTED_BOUNDARY: { label: "채택 안 함", tone: "reject" },
  REJECTED_INVALID: { label: "산출 없음", tone: "reject" },
};
