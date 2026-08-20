import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * 투자금 납입 지급사 어댑터 (명세 17.2 · InvestmentPaymentAdapter).
 *
 * 은행 가상계좌 발급·입금 조회·예금주 조회·웹훅 서명 검증을 이 인터페이스 뒤에 둔다.
 * 도메인 코드(lib/deposit.ts와 API route)는 어댑터만 호출하고, 제공사가 정해지면
 * getPaymentAdapter가 돌려주는 구현체만 바꾼다.
 */

export type AccountHolder = {
  holderName: string;
};

export type VirtualAccountIssued = {
  provider: string;
  providerAccountId: string;
  bankName: string;
  accountNumber: string;
  /** 입금 받는 쪽 예금주 (신탁 계정) */
  holderName: string;
  amount: bigint;
  expiresAt: Date;
};

export type BankDeposit = {
  providerTransactionId: string;
  amount: bigint;
  payerName: string | null;
  depositedAt: Date;
};

/** 조회 대상 가상계좌. 실제 제공사는 providerAccountId만 쓰고 나머지는 무시한다. */
export type VirtualAccountRef = {
  providerAccountId: string;
  amount: bigint;
  createdAt: Date;
};

/** 어댑터가 돌려주는 실패. code는 명세 14장의 오류 코드다. */
export class PaymentAdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface InvestmentPaymentAdapter {
  /** 실명조회. 계좌를 찾지 못하면 null. */
  lookupAccountHolder(params: {
    bankName: string;
    accountNumber: string;
  }): Promise<AccountHolder | null>;

  /** 건별 가상계좌 발급. 실패는 PaymentAdapterError로 던진다. */
  issueVirtualAccount(params: {
    investmentId: string;
    amount: bigint;
    expiresAt: Date;
  }): Promise<VirtualAccountIssued>;

  /** 입금 조회. 아직 입금이 없으면 null. */
  getDeposit(account: VirtualAccountRef): Promise<BankDeposit | null>;

  /** 웹훅 서명 검증. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
}

/** 예금주 조회가 본인확인 이름을 그대로 돌려준다는 표시. 호출부가 이 값을 실명으로 바꾼다. */
export const MOCK_HOLDER_ECHO = "__SELF__";

/**
 * 데모용 Mock. 제공사 계약 전까지 이 구현체가 은행 역할을 한다.
 *
 * MOCK_BANK_SCENARIO로 I-03E의 네 분기를 재현한다.
 * - normal(기본): 발급 후 MOCK_BANK_DEPOSIT_DELAY_SEC가 지나면 정확한 금액이 입금된다
 * - issue_failed: 가상계좌 발급 실패
 * - mismatch: 신청 금액보다 10,000원 적게 입금된다
 * - delayed: 입금이 조회되지 않는다 (확인 지연)
 */
class MockInvestmentPaymentAdapter implements InvestmentPaymentAdapter {
  private get scenario(): string {
    return process.env.MOCK_BANK_SCENARIO || "normal";
  }

  async lookupAccountHolder({
    accountNumber,
  }: {
    bankName: string;
    accountNumber: string;
  }): Promise<AccountHolder | null> {
    const digits = accountNumber.replace(/\D/g, "");
    if (digits.length < 10) return null;
    // 실명조회 자리. 제공사가 붙기 전까지는 계좌 주인을 확인해 줄 방법이 없어
    // 조회에 성공한 것으로 두고, 본인 명의 판정은 호출부가 본인확인 이름과 대조해 한다.
    return { holderName: MOCK_HOLDER_ECHO };
  }

  async issueVirtualAccount({
    investmentId,
    amount,
    expiresAt,
  }: {
    investmentId: string;
    amount: bigint;
    expiresAt: Date;
  }): Promise<VirtualAccountIssued> {
    if (this.scenario === "issue_failed") {
      throw new PaymentAdapterError(
        "VIRTUAL_ACCOUNT_FAILED",
        "입금 계좌를 만들지 못했습니다.",
      );
    }
    const seed = createHash("sha256").update(investmentId).digest("hex");
    const digits = BigInt("0x" + seed.slice(0, 12)) % BigInt(1_000_000_000_000);
    const account = digits.toString().padStart(12, "0");
    return {
      provider: "mock",
      providerAccountId: `mock_va_${investmentId}`,
      bankName: "부산은행",
      accountNumber: `${account.slice(0, 3)}-${account.slice(3, 7)}-${account.slice(7)}`,
      holderName: "팜피 투자금 분리보관 계정",
      amount,
      expiresAt,
    };
  }

  async getDeposit(account: VirtualAccountRef): Promise<BankDeposit | null> {
    if (this.scenario === "delayed") return null;

    const delaySec = Number(process.env.MOCK_BANK_DEPOSIT_DELAY_SEC ?? "0");
    const readyAt = account.createdAt.getTime() + delaySec * 1000;
    if (Date.now() < readyAt) return null;

    const amount =
      this.scenario === "mismatch"
        ? bigIntMax(account.amount - BigInt(10_000), BigInt(1))
        : account.amount;

    // 거래번호는 계좌당 고정이다. 몇 번을 조회해도 같은 값이라
    // providerTransactionId unique로 한 번만 반영된다.
    return {
      providerTransactionId: `mock_tx_${account.providerAccountId}`,
      amount,
      payerName: null,
      depositedAt: new Date(readyAt),
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    const secret = process.env.BANK_WEBHOOK_SECRET;
    // 제공사 시크릿이 없으면 검증할 것이 없다. 로컬·데모에서만 이 경로를 탄다.
    if (!secret) return true;
    if (!signature) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}

function bigIntMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

let adapter: InvestmentPaymentAdapter | null = null;

export function getPaymentAdapter(): InvestmentPaymentAdapter {
  if (!adapter) adapter = new MockInvestmentPaymentAdapter();
  return adapter;
}

/** 입금기한. 제공사 정책이 정해지면 어댑터 응답 값으로 대체한다. */
export function depositDeadline(from: Date = new Date()): Date {
  const hours = Number(process.env.DEPOSIT_DEADLINE_HOURS ?? "24");
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

/** 계좌번호 원문 대신 저장할 식별 토큰. 지급사 토큰이 생기면 그 값으로 바꾼다. */
export function accountToken(bankName: string, accountNumber: string): string {
  const salt = process.env.JWT_SECRET ?? "farmfi";
  return createHash("sha256")
    .update(`${salt}:${bankName}:${accountNumber.replace(/\D/g, "")}`)
    .digest("hex");
}

/** 표시용 마스킹. 앞 3자리와 뒤 4자리만 남긴다. */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length < 7) return "*".repeat(digits.length);
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}
