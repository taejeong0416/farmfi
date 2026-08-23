// 지급 실패 사유별 다음 행동 (명세 2.2.1)
//
// 실패를 한 덩어리로 다루면 "다시 시도" 버튼이 늘 열려 있고, 계좌가 잘못된 건은
// 눌러도 같은 자리에서 또 실패한다. 사유마다 다음에 할 일이 다르므로 코드로 나눈다.
//
//   · 은행 일시 오류    → 그대로 다시 걸면 된다
//   · 등록 계좌 문제    → 수취인이 계좌를 고쳐야 재시도가 의미를 갖는다
//   · 자동 이체 비대상  → 사람이 이체하고 결과를 적는다
//
// 어댑터가 새 코드를 내면 여기에 추가한다. 모르는 코드는 UNKNOWN 정책으로 떨어지고,
// 그때는 재시도를 막는다 — 무엇이 잘못됐는지 모르는 채로 돈을 다시 보내지 않는다.

/** 실패를 풀려면 누가 움직여야 하는가. */
export type PayoutFailureActor =
  /** 관리자가 그대로 다시 걸면 된다 */
  | "admin"
  /** 수취인이 등록 계좌를 고쳐야 한다 */
  | "payee"
  /** 사람이 직접 이체하고 결과를 적는다 */
  | "manual";

export interface PayoutFailurePolicy {
  code: string;
  /** 화면에 그대로 쓰는 짧은 이름 */
  label: string;
  /** 자동 재시도(어댑터 재실행)가 의미 있는가 */
  retryable: boolean;
  actor: PayoutFailureActor;
  /** 관리자 화면에 띄우는 다음 할 일 */
  adminHint: string;
  /** 수취인 화면(I-08)에 띄우는 다음 할 일. 수취인이 할 일이 없으면 null */
  payeeHint: string | null;
}

const POLICIES: Record<string, PayoutFailurePolicy> = {
  PAYOUT_NO_ACCOUNT: {
    code: "PAYOUT_NO_ACCOUNT",
    label: "등록 계좌 없음",
    retryable: false,
    actor: "payee",
    adminHint: "수취인이 회수 계좌를 등록해야 합니다. 등록되면 다시 시도할 수 있습니다.",
    payeeHint: "회수 계좌가 등록되어 있지 않습니다. 본인 명의 계좌를 등록해 주세요.",
  },
  PAYOUT_ACCOUNT_INVALID: {
    code: "PAYOUT_ACCOUNT_INVALID",
    label: "계좌 정보 불일치",
    retryable: false,
    actor: "payee",
    adminHint: "계좌번호나 예금주가 맞지 않습니다. 수취인이 고친 뒤 다시 시도합니다.",
    payeeHint: "등록된 계좌로 보낼 수 없습니다. 계좌번호와 예금주를 다시 확인해 주세요.",
  },
  PAYOUT_BANK_ERROR: {
    code: "PAYOUT_BANK_ERROR",
    label: "은행 처리 오류",
    retryable: true,
    actor: "admin",
    adminHint: "은행 쪽 일시 오류입니다. 그대로 다시 시도해 주세요.",
    payeeHint: null,
  },
  PAYOUT_MANUAL_REQUIRED: {
    code: "PAYOUT_MANUAL_REQUIRED",
    label: "수동 이체 대상",
    retryable: false,
    actor: "manual",
    adminHint: "계정이 없는 수취인입니다. 이체한 뒤 결과를 등록해 주세요.",
    payeeHint: null,
  },
};

const UNKNOWN: PayoutFailurePolicy = {
  code: "PAYOUT_UNKNOWN",
  label: "확인 필요",
  retryable: false,
  actor: "admin",
  adminHint: "알 수 없는 실패입니다. 사유를 확인한 뒤 처리해 주세요.",
  payeeHint: null,
};

/**
 * 실패 코드의 정책. 코드가 없거나(사람이 손으로 실패 처리한 건) 모르는 코드면
 * 재시도를 열지 않는다 — 원인을 모르는 채 다시 보내는 것이 가장 나쁘다.
 */
export function payoutFailurePolicy(code: string | null): PayoutFailurePolicy {
  if (!code) return UNKNOWN;
  return POLICIES[code] ?? { ...UNKNOWN, code };
}

/** 실패 건에 재시도 버튼을 열어도 되는가. */
export function canRetryPayout(code: string | null): boolean {
  return payoutFailurePolicy(code).retryable;
}
