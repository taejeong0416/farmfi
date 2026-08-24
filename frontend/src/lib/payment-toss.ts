import {
  MOCK_HOLDER_ECHO,
  PaymentAdapterError,
  type AccountHolder,
  type BankDeposit,
  type InvestmentPaymentAdapter,
  type VirtualAccountIssued,
  type VirtualAccountRef,
} from "@/lib/payment";

/**
 * 토스페이먼츠 가상계좌 어댑터.
 *
 * `POST /v1/virtual-accounts`는 결제창 없이 서버에서 바로 계좌를 발급한다.
 * 우리 흐름(신청 → 서버가 계좌 발급 → 투자자가 입금)에 그대로 맞는다.
 *
 * 두 가지가 Mock과 다르다.
 *
 * 1) **웹훅 검증이 HMAC이 아니다.** 토스는 발급 응답에 `secret`을 주고, 입금
 *    웹훅(DEPOSIT_CALLBACK) 본문의 `secret`과 같은지 대조하라고 한다. 계좌마다
 *    값이 달라 전역 시크릿 하나로는 검증할 수 없다 — `VirtualAccount.providerSecret`에
 *    저장하고 웹훅 라우트가 대조한다. 그래서 이 어댑터의
 *    `verifyWebhookSignature`는 항상 false다(그 경로를 쓰지 않는다는 표시).
 *
 * 2) **웹훅에 금액이 없다.** 본문은 `{ createdAt, secret, status, transactionKey,
 *    orderId }`뿐이다. 입금액은 발급 시 지정한 금액이므로 저장된 계좌에서 읽는다.
 *
 * @see https://docs.tosspayments.com/reference
 */

const BASE_URL = "https://api.tosspayments.com";

/** 토스 은행 코드 → 표시용 이름. 발급에 쓰는 코드만 담는다. */
const BANK_NAME: Record<string, string> = {
  "39": "경남은행",
  "34": "광주은행",
  "12": "단위농협",
  "32": "부산은행",
  "45": "새마을금고",
  "64": "산림조합",
  "88": "신한은행",
  "48": "신협",
  "27": "씨티은행",
  "20": "우리은행",
  "71": "우체국",
  "50": "저축은행",
  "37": "전북은행",
  "35": "제주은행",
  "90": "카카오뱅크",
  "89": "케이뱅크",
  "92": "토스뱅크",
  "81": "하나은행",
  "54": "홍콩상하이은행",
  "03": "기업은행",
  "04": "국민은행",
  "07": "수협은행",
  "11": "농협은행",
  "23": "SC제일은행",
  "31": "대구은행",
  "02": "산업은행",
  "05": "외환은행",
};

type TossPayment = {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  secret?: string | null;
  approvedAt?: string | null;
  virtualAccount?: {
    accountNumber: string;
    bankCode: string;
    customerName: string;
    dueDate: string;
    accountType?: string;
    expired?: boolean;
  } | null;
};

type TossError = { code?: string; message?: string };

/** 지금부터 만료까지 남은 시간(정수, 최소 1). 토스 `validHours`가 정수만 받는다. */
function hoursUntil(expiresAt: Date): number {
  const ms = expiresAt.getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
}

export class TossPaymentsAdapter implements InvestmentPaymentAdapter {
  constructor(
    private readonly secretKey: string,
    /** 발급 은행 코드. 상점에 열려 있는 은행이어야 한다. */
    private readonly bankCode: string,
    /** 입금 받는 쪽 표시 이름 */
    private readonly holderName: string,
  ) {}

  private authHeader(): string {
    // 토스 규칙: 시크릿 키 뒤에 콜론을 붙이고 base64. 비밀번호 자리는 비운다.
    return "Basic " + Buffer.from(`${this.secretKey}:`).toString("base64");
  }

  /**
   * 예금주 조회. 토스페이먼츠 코어 API에는 실명조회가 없다(별도 상품).
   *
   * null을 돌려주면 회수 계좌 등록이 **누구에게도** 열리지 않아 가입 흐름이 거기서
   * 끊긴다. 조회할 방법이 없는 것과 조회해서 남의 계좌로 판정한 것은 다르므로,
   * Mock 어댑터와 같이 "조회 불가" 표시를 돌려주고 본인 명의 판정은 호출부가
   * 본인확인 이름과 대조해서 한다. 실명조회 상품을 붙이면 그 응답으로 바꾼다.
   */
  async lookupAccountHolder({
    accountNumber,
  }: {
    bankName: string;
    accountNumber: string;
  }): Promise<AccountHolder | null> {
    const digits = accountNumber.replace(/\D/g, "");
    if (digits.length < 10) return null;
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
    // orderId는 6~64자 영문·숫자·`-`·`_`. cuid는 그대로 들어간다.
    // 신청 한 건에 계좌를 다시 발급할 수 있어야 하므로 시각을 덧붙여 유일하게 만든다.
    const orderId = `farmfi-${investmentId}-${Date.now().toString(36)}`;

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/v1/virtual-accounts`, {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Number(amount),
          orderId,
          orderName: "FarmFi 프로젝트 투자금",
          customerName: this.holderName,
          bank: this.bankCode,
          // dueDate는 ISO 8601 오프셋 표기를 요구해 `Z`(UTC)와 밀리초가 붙으면
          // INVALID_DATE로 거부된다. 같은 뜻을 정수 시간으로 보내면 형식 문제가 없다.
          validHours: hoursUntil(expiresAt),
        }),
      });
    } catch {
      throw new PaymentAdapterError(
        "VIRTUAL_ACCOUNT_FAILED",
        "입금 계좌를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }

    const body = (await res.json().catch(() => null)) as
      | (TossPayment & TossError)
      | null;

    if (!res.ok || !body?.virtualAccount) {
      // 지급사 원문 메시지는 사용자에게 그대로 보이지 않게 하고 로그로만 남긴다.
      console.error("[toss] 가상계좌 발급 실패", res.status, body?.code, body?.message);
      throw new PaymentAdapterError(
        "VIRTUAL_ACCOUNT_FAILED",
        "입금 계좌를 만들지 못했습니다.",
      );
    }

    const va = body.virtualAccount;
    return {
      provider: "toss",
      // 우리 쪽 키는 orderId다. 웹훅도 orderId로 돌아온다.
      providerAccountId: orderId,
      bankName: BANK_NAME[va.bankCode] ?? `은행코드 ${va.bankCode}`,
      accountNumber: va.accountNumber,
      holderName: this.holderName,
      amount,
      expiresAt: va.dueDate ? new Date(va.dueDate) : expiresAt,
      // 웹훅 검증에 쓸 값. 호출부가 VirtualAccount.providerSecret에 저장한다.
      providerSecret: body.secret ?? null,
    };
  }

  /**
   * 입금 조회 — 웹훅이 오지 않는 상황의 보조 경로.
   * 토스는 orderId로 결제를 조회할 수 있다. 상태가 DONE이면 입금된 것이다.
   */
  async getDeposit(account: VirtualAccountRef): Promise<BankDeposit | null> {
    let res: Response;
    try {
      res = await fetch(
        `${BASE_URL}/v1/payments/orders/${encodeURIComponent(account.providerAccountId)}`,
        { headers: { Authorization: this.authHeader() } },
      );
    } catch {
      return null; // 조회 실패는 상태를 바꾸지 않는다. 웹훅이나 다음 조회가 처리한다.
    }
    if (!res.ok) return null;

    const body = (await res.json().catch(() => null)) as TossPayment | null;
    if (!body || body.status !== "DONE") return null;

    return {
      // 같은 주문을 몇 번 조회해도 같은 값이라 providerTransactionId unique가 이중 반영을 막는다.
      providerTransactionId: `toss_${body.paymentKey}`,
      amount: BigInt(body.totalAmount),
      payerName: body.virtualAccount?.customerName ?? null,
      depositedAt: body.approvedAt ? new Date(body.approvedAt) : new Date(),
    };
  }

  /**
   * 이 어댑터는 이 경로를 쓰지 않는다. 토스 검증은 계좌별 secret 대조이고
   * `/api/webhooks/toss/deposits`가 담당한다. 여기로 들어온 요청은 거부한다 —
   * 검증되지 않은 입금 통지를 통과시키는 것보다 안 받는 편이 낫다.
   */
  verifyWebhookSignature(): boolean {
    return false;
  }
}
