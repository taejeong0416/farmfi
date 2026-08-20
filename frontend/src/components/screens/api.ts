"use client";

import { useQuery } from "@tanstack/react-query";
import { MILESTONE_STATUS_LABEL as GATE_STATUS_LABEL } from "@/lib/milestone-gate";

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  status: string;
  imageUrl: string | null;
  tokenPrice: number | null;
  totalTokens: number | null;
  soldTokens: number;
  targetAmount: number | null;
  currentAmount: number;
  fundingEnd: string | null;
  fundingPercent: number;
  investorCount: number;
  milestones?: MilestoneSummary[];
};

export type MilestoneSummary = {
  id: string;
  seq: number;
  name: string;
  description: string | null;
  status: string;
  releasePct: number;
  releaseAmount: number;
  conditionText: string | null;
  requiredSignals: string[];
  evidenceUrl: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
};

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  upcoming: "모집 예정",
  funding: "모집 중",
  funded: "모집 완료",
  operating: "운영 중",
  paused: "중단",
  rejected: "심사 반려",
  completed: "정산 완료",
  failed: "모집 실패",
};

// 라벨 원본은 lib/milestone-gate.ts 하나다. 여기 복사본을 두면 상태 흐름을 고칠 때
// 한쪽만 바뀌어 화면과 서버가 다른 말을 하게 된다. 화면은 서버 status를 그대로
// 문자열로 받으므로 인덱스 타입만 넓혀서 재수출한다.
export const MILESTONE_STATUS_LABEL: Record<string, string> = GATE_STATUS_LABEL;

/** 통과·집행만 강조하고, 나머지는 글자로만 구분한다. */
export function milestoneTone(status: string): "pass" | "fail" | "plain" {
  if (status === "verified" || status === "completed") return "pass";
  if (status === "failed") return "fail";
  return "plain";
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "요청에 실패했습니다.");
  }
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(data?.error ?? "요청에 실패했습니다.");
  }
  return data as T;
}

export async function putJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(data?.error ?? "요청에 실패했습니다.");
  }
  return data as T;
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => getJson<{ projects: ProjectSummary[] }>("/api/projects"),
    select: (d) => d.projects,
  });
}

export type ProjectDetail = ProjectSummary & {
  milestones: MilestoneSummary[];
  escrow: {
    totalLocked: number;
    totalReleased: number;
    remaining: number;
    status: string;
  } | null;
  fundingStart: string | null;
};

// GET /api/projects/[id]는 프로젝트 객체를 그대로 내려준다.
export function useProject(id: string) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => getJson<ProjectDetail>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });
}

export type PortfolioHolding = {
  projectId: string;
  projectName: string;
  projectStatus: string;
  tokenAmount: number;
  avgPrice: number;
  investedAmount: number;
  currentNav: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercent: number;
  dividendReceived: number;
  recoveryPercent: number;
};

export type PortfolioResponse = {
  summary: {
    totalInvested: number;
    totalCurrentValue: number;
    totalProfitLoss: number;
    totalProfitLossPercent: number;
    totalDividendReceived: number;
  };
  holdings: PortfolioHolding[];
  dividends: {
    id: string;
    projectId: string;
    projectName: string;
    period: string;
    perToken: number;
    tokenAmount: number;
    claimAmount: number;
    claimed: boolean;
    claimedAt: string | null;
  }[];
  transactions: {
    id: string;
    projectId: string;
    projectName: string;
    type: string;
    amount: number;
    tokenAmount: number;
    createdAt: string;
  }[];
};

export function usePortfolio() {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: () => getJson<PortfolioResponse>("/api/portfolio"),
    retry: false,
  });
}

export type Investment = {
  id: string;
  userId: string;
  projectId: string;
  status: string;
  amount: number;
  units: number;
  eligible: boolean | null;
  eligibilityMemo: string | null;
  annualLimit: number | null;
  consentedAt: string | null;
  signature: string | null;
  failureReason: string | null;
  createdAt: string;
  project?: {
    id: string;
    name: string;
    location?: string | null;
    status: string;
    tokenPrice?: number | null;
    fundingEnd?: string | null;
  };
};

export const INVESTMENT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "작성 중",
  IDENTITY_REQUIRED: "본인확인 필요",
  ELIGIBILITY_CHECKED: "적합성 확인 완료",
  CONSENT_REQUIRED: "동의·서명 필요",
  AWAITING_DEPOSIT: "납입 대기",
  DEPOSIT_CONFIRMED: "납입 완료",
  COMPLETED: "접수 완료",
  DEPOSIT_FAILED: "납입 실패",
  CANCELLED: "취소됨",
};

export function useInvestment(id: string | null) {
  return useQuery({
    queryKey: ["investment", id],
    queryFn: () => getJson<{ investment: Investment }>(`/api/investments/${id}`),
    select: (d) => d.investment,
    enabled: Boolean(id),
  });
}

export function useInvestments() {
  return useQuery({
    queryKey: ["investments"],
    queryFn: () => getJson<{ investments: Investment[] }>("/api/investments"),
    select: (d) => d.investments,
    retry: false,
  });
}

// ─── 가상계좌 납입 (I-03 · I-03E) ───

export type VirtualAccountView = {
  bankName: string;
  accountNumber: string;
  holderName: string;
  amount: number;
  expiresAt: string;
  status: string;
};

export type DepositState = {
  status: string;
  failureCode: string | null;
  failureReason: string | null;
  amount: number;
  virtualAccount: VirtualAccountView | null;
  deposit: {
    amount: number;
    expectedAmount: number;
    status: string;
    receivedAt: string;
  } | null;
  custody: {
    mode: "mock" | "trust";
    label: string;
    separated: boolean;
    trustee: string | null;
  } | null;
};

/** 입금 대기 화면이 상태를 따라간다. 확정되면 polling을 끈다. */
export function useDepositStatus(id: string | null, polling: boolean) {
  return useQuery({
    queryKey: ["deposit-status", id],
    queryFn: () =>
      getJson<{ deposit: DepositState | null }>(
        `/api/investments/${id}/deposit-status`,
      ),
    select: (d) => d.deposit,
    enabled: Boolean(id),
    refetchInterval: polling ? 4000 : false,
    retry: false,
  });
}

export async function issueVirtualAccount(id: string): Promise<VirtualAccountView> {
  const data = await postJson<{ virtualAccount: VirtualAccountView }>(
    `/api/investments/${id}/virtual-account`,
  );
  return data.virtualAccount;
}

export async function requestDepositInquiry(id: string): Promise<void> {
  await postJson(`/api/investments/${id}/deposit-inquiry`);
}

export async function cancelInvestment(id: string): Promise<void> {
  await postJson(`/api/investments/${id}/cancel`);
}

// ─── 회수·환불 계좌 (C-I03) ───

export type BankAccountInfo = {
  bankName: string;
  maskedNumber: string;
  holderName: string;
  verifiedAt: string;
};

export function useBankAccount() {
  return useQuery({
    queryKey: ["bank-account"],
    queryFn: () =>
      getJson<{ bankAccount: BankAccountInfo | null }>("/api/me/bank-account"),
    select: (d) => d.bankAccount,
    retry: false,
  });
}

/** 예금주 확인. 통과하면 확인된 예금주 이름을 돌려준다. */
export async function verifyAccountHolder(
  bankName: string,
  accountNumber: string,
): Promise<string> {
  const data = await postJson<{ holderName: string }>(
    "/api/bank-accounts/verify-holder",
    { bankName, accountNumber },
  );
  return data.holderName;
}

export async function registerBankAccount(
  bankName: string,
  accountNumber: string,
): Promise<BankAccountInfo> {
  const res = await fetch("/api/me/bank-account", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ bankName, accountNumber }),
  });
  const data = (await res.json().catch(() => null)) as
    | { bankAccount?: BankAccountInfo; error?: string }
    | null;
  if (!res.ok || !data?.bankAccount) {
    throw new Error(data?.error ?? "요청에 실패했습니다.");
  }
  return data.bankAccount;
}

export type SpaceItem = {
  id: string;
  spaceType: string;
  address: string;
  area: string;
  electricity: string;
  water: string;
  lighting: string;
  preferredMode: string;
  photos: string[];
  suitabilityScore: number | null;
  estimatedRent: number | null;
  status: string;
  createdAt: string;
};

export const SPACE_TYPE_LABEL: Record<string, string> = {
  rooftop: "옥상",
  vacant_store: "공실 상가",
  indoor: "실내",
};

export const SPACE_STATUS_LABEL: Record<string, string> = {
  submitted: "검토 대기",
  reviewing: "준비 중",
  approved: "신청 가능",
  rejected: "반려",
};

export function useAvailableSpaces() {
  return useQuery({
    queryKey: ["spaces", "available"],
    queryFn: () => getJson<{ spaces: SpaceItem[] }>("/api/spaces/available"),
    select: (d) => d.spaces,
    retry: false,
  });
}

export type OperatorApplication = {
  id: string;
  userId: string;
  region: string;
  cropExperience: string;
  availableHours: string;
  status: string;
  spaceId: string | null;
  documents: string[];
  reviewNote: string | null;
  visitAt: string | null;
  visitNote: string | null;
  visitDoneAt: string | null;
  educationProgress: number;
  educationDoneAt: string | null;
  confirmedAt: string | null;
  contractSignature: string | null;
  contractSignedAt: string | null;
  certificateNo: string | null;
  certificateIssuedAt: string | null;
  createdAt: string;
};

/** 내 운영 신청. 목록 API가 최신순이라 첫 건이 진행 중인 신청이다. */
export function useOperatorApplication() {
  return useQuery({
    queryKey: ["operator-application"],
    queryFn: () =>
      getJson<{ applications: OperatorApplication[] }>(
        "/api/operator-applications",
      ),
    select: (d) => d.applications[0] ?? null,
    retry: false,
  });
}

export async function patchApplication(
  id: string,
  body: Record<string, unknown>,
): Promise<OperatorApplication> {
  const res = await fetch(`/api/operator-applications/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | { application?: OperatorApplication; error?: string }
    | null;
  if (!res.ok || !data?.application) {
    throw new Error(data?.error ?? "요청에 실패했습니다.");
  }
  return data.application;
}

export type PayoutItem = {
  id: string;
  projectId: string;
  project: { name: string };
  category: string;
  payeeName: string;
  amount: number;
  period: string;
  status: string;
  paidAt: string | null;
  failureReason: string | null;
  memo: string | null;
  createdAt: string;
};

export const PAYOUT_STATUS_LABEL: Record<string, string> = {
  processing: "이체 중",
  scheduled: "회수예정",
  paid: "지급완료",
  failed: "지급실패",
};

export function usePayouts() {
  return useQuery({
    queryKey: ["payouts"],
    queryFn: () =>
      getJson<{
        payouts: PayoutItem[];
        summary: { scheduled: number; paid: number; failed: number };
      }>("/api/payouts"),
    retry: false,
  });
}

export type NotificationItem = {
  id: string;
  projectId: string | null;
  milestoneId: string | null;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      getJson<{ notifications: NotificationItem[] }>("/api/notifications"),
    select: (d) => d.notifications,
  });
}

// ─── 표기 ───

export function won(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("ko-KR").format(value) + "원";
}

export function num(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// ─── 정기구독 ───

export type PickupOrder = {
  id: string;
  subscriptionId: string;
  scheduledAt: string;
  status: string;
  code: string;
  pickedAt: string | null;
};

export type SubscriptionItem = {
  id: string;
  projectId: string;
  packSize: number;
  perWeek: number;
  productIds: string[];
  dressings: string[];
  monthlyPrice: number;
  couponCode: string | null;
  discount: number;
  paymentMethod: string | null;
  status: string;
  startedAt: string;
  nextPaymentAt: string | null;
  project: { id: string; name: string; location: string | null };
  pickups: PickupOrder[];
};

export const PICKUP_STATUS_LABEL: Record<string, string> = {
  scheduled: "예정",
  picked: "완료",
  skipped: "건너뜀",
};

export function useSubscriptions() {
  return useQuery({
    queryKey: ["subscriptions"],
    queryFn: () =>
      getJson<{ subscriptions: SubscriptionItem[] }>("/api/subscriptions"),
    select: (d) => d.subscriptions,
    retry: false,
  });
}

export async function patchSubscription(
  id: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`/api/subscriptions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "요청에 실패했습니다.");
  }
}
