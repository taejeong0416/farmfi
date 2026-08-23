/**
 * 마일스톤 상태 흐름. 조건부 집행의 뼈대다.
 *
 *   pending ─┬─→ evidence_submitted ─→ verified ─→ completed
 *   in_progress                ↑           │
 *            revision_required ┴───────────┘ (보완 요청)
 *                              manual_review (AI 2회 실패 → 사람이 판정)
 *
 * 자금은 `verified`에서만 나간다. 그리고 `verified`에 도달하는 길은 두 개뿐이다 —
 * 운영자 증빙에 대한 AI 검증 통과, 또는 관리자 승인(A-08). 둘 다 증빙 제출이 전제다.
 * 증빙 없이 집행되는 구간을 남기면 "조건 충족 시에만 집행"이라는 자금통제 근거가 사라진다.
 */
export const MILESTONE_STATUS = [
  "pending",
  "evidence_submitted",
  "in_progress",
  "manual_review",
  "revision_required",
  "verified",
  "completed",
  "failed",
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: "예정",
  evidence_submitted: "증빙 제출됨",
  // 직전 단계가 집행되면 다음 단계가 여기로 온다. "검증중"이 아니라 "운영자가 지금 하는 단계"다.
  in_progress: "진행중",
  manual_review: "보류",
  revision_required: "보완 요청",
  verified: "통과",
  completed: "집행 완료",
  failed: "실패",
};

/**
 * 운영자가 증빙을 새로 낼 수 있는 상태.
 * `in_progress`가 빠져 있으면 2단계 이후로는 증빙을 낼 수 없다 —
 * complete가 다음 단계를 `in_progress`로 열기 때문이다.
 */
export function canSubmitEvidence(status: string): boolean {
  return (
    status === "pending" ||
    status === "in_progress" ||
    status === "revision_required" ||
    status === "evidence_submitted" ||
    status === "manual_review"
  );
}

/**
 * 관리자가 승인·보완요청 판정을 내릴 수 있는 상태.
 * 집행 전이라면 `verified`도 포함한다 — 증빙 없이 verified가 된 옛 데이터를
 * 보완 요청으로 되돌릴 길이 없으면 그 단계는 영영 집행도 회수도 못 하는 채로 남는다.
 */
export function canReview(status: string): boolean {
  return (
    status === "evidence_submitted" ||
    status === "in_progress" ||
    status === "manual_review" ||
    status === "revision_required" ||
    status === "verified"
  );
}

export type GateResult = { ok: true } | { ok: false; error: string };

/**
 * AI 검증을 돌릴 수 있는지. 증빙이 없으면 검증할 대상 자체가 없다.
 * 검증 신호가 하나도 정의되지 않은 단계는 `every`가 공허참으로 통과해 버리므로 막는다.
 */
export function canRunVerification(m: {
  status: string;
  evidenceSubmittedAt: Date | null;
  requiredSignals: string[];
}): GateResult {
  if (m.status === "completed") {
    return { ok: false, error: "이미 집행이 끝난 단계입니다." };
  }
  if (m.status === "verified") {
    return { ok: false, error: "이미 판정이 끝난 단계입니다." };
  }
  if (m.status === "failed") {
    return { ok: false, error: "실패로 마감된 단계입니다." };
  }
  if (!m.evidenceSubmittedAt) {
    return {
      ok: false,
      error: "운영자 증빙이 제출되지 않았습니다. 증빙 제출 후 검증할 수 있습니다.",
    };
  }
  if (m.requiredSignals.length === 0) {
    return {
      ok: false,
      error: "검증 신호가 설정되지 않은 단계입니다. 마일스톤 설정에서 먼저 지정해 주세요.",
    };
  }
  return { ok: true };
}

/**
 * 트랜치를 집행해도 되는지. 자금이 나가는 마지막 관문이라 상태값 하나만 믿지 않고
 * 증빙 존재와 판정 기록까지 함께 본다.
 */
export function canRelease(
  m: {
    seq: number;
    status: string;
    evidenceSubmittedAt: Date | null;
    reviewedAt: Date | null;
    aiVerificationResult: unknown;
  },
  /**
   * 같은 프로젝트의 모든 단계. 앞 단계가 끝나지 않았는데 뒤 단계를 집행하면
   * 트랜치가 순서를 건너뛰고 나간다 — 자금 계획이 무너진다.
   * 넘기지 않으면 순서 검사를 건너뛴다(호출부가 이미 확인한 경우).
   */
  siblings?: { seq: number; status: string }[],
): GateResult {
  if (m.status === "completed") {
    return { ok: false, error: "이미 집행이 끝난 단계입니다." };
  }
  if (m.status === "manual_review") {
    return { ok: false, error: "보류 단계입니다. 증빙 검토(A-08)에서 판정해 주세요." };
  }
  if (m.status === "revision_required") {
    return { ok: false, error: "보완 요청된 단계입니다. 재제출된 증빙을 다시 판정해 주세요." };
  }
  if (m.status !== "verified") {
    return { ok: false, error: "증빙이 승인된 단계만 집행할 수 있습니다." };
  }
  if (!m.evidenceSubmittedAt) {
    return {
      ok: false,
      error: "운영자 증빙이 없는 단계는 집행할 수 없습니다.",
    };
  }
  // 판정 없이 상태만 verified가 된 행(수동 조작·마이그레이션 잔재)을 걸러낸다.
  if (!m.reviewedAt && m.aiVerificationResult == null) {
    return {
      ok: false,
      error: "증빙 판정 기록이 없습니다. AI 검증 또는 관리자 승인을 먼저 거쳐야 합니다.",
    };
  }
  if (siblings) {
    const unfinished = siblings
      .filter((s) => s.seq < m.seq && s.status !== "completed")
      .sort((a, b) => a.seq - b.seq);
    if (unfinished.length > 0) {
      return {
        ok: false,
        error: `${unfinished[0].seq}단계가 아직 집행되지 않았습니다. 단계는 순서대로 집행합니다.`,
      };
    }
  }
  return { ok: true };
}

// ── 조건 항목별 판정 (A-08) ──────────────────────────────────────────────────

/** 항목 판정값. `undecided`가 하나라도 있으면 승인이 열리지 않는다. */
export type ItemVerdict = "undecided" | "met" | "unmet";

export interface ReviewItem {
  signal: string;
  verdict: string;
  evidenceUrl?: string | null;
}

export const SIGNAL_LABEL: Record<string, string> = {
  contract: "계약서",
  receipt: "영수증",
  photo: "현장 사진",
  iot: "센서 데이터",
  crossCheck: "교차검증",
};

/**
 * 이 단계가 판정해야 할 항목 목록.
 * `requiredSignals`에 교차검증이 걸려 있으면 그것도 하나의 항목이다 —
 * 영수증과 사진이 각각 통과해도 서로 안 맞으면 조건을 못 채운 것이다.
 */
export function reviewSignalsOf(m: {
  requiredSignals: string[];
  crossCheck: string | null;
}): string[] {
  return m.crossCheck ? [...m.requiredSignals, "crossCheck"] : [...m.requiredSignals];
}

/**
 * 승인해도 되는지. 명세 A-08: "각 항목마다 충족·미충족과 근거가 된 증빙을
 * 지정해야 승인 버튼이 열린다. 한 항목이라도 미지정이면 승인할 수 없다."
 *
 * 근거 증빙 지정은 파일이 필요한 항목에만 요구한다. IoT·교차검증은 수집 데이터와
 * 대조 결과라 지정할 파일이 없다.
 */
const FILE_BACKED = new Set(["contract", "receipt", "photo"]);

export function canApproveItems(
  signals: string[],
  items: ReviewItem[],
): GateResult {
  const bySignal = new Map(items.map((i) => [i.signal, i]));

  const undecided = signals.filter(
    (sig) => (bySignal.get(sig)?.verdict ?? "undecided") === "undecided",
  );
  if (undecided.length > 0) {
    const names = undecided.map((s) => SIGNAL_LABEL[s] ?? s).join(" · ");
    return { ok: false, error: `아직 판정하지 않은 항목이 있습니다 — ${names}` };
  }

  const unmet = signals.filter((sig) => bySignal.get(sig)?.verdict === "unmet");
  if (unmet.length > 0) {
    const names = unmet.map((s) => SIGNAL_LABEL[s] ?? s).join(" · ");
    return {
      ok: false,
      error: `충족하지 못한 항목이 있어 승인할 수 없습니다 — ${names}. 보완 요청 또는 반려로 처리해 주세요.`,
    };
  }

  const noEvidence = signals.filter(
    (sig) => FILE_BACKED.has(sig) && !bySignal.get(sig)?.evidenceUrl,
  );
  if (noEvidence.length > 0) {
    const names = noEvidence.map((s) => SIGNAL_LABEL[s] ?? s).join(" · ");
    return { ok: false, error: `근거 증빙을 지정하지 않은 항목이 있습니다 — ${names}` };
  }

  return { ok: true };
}
