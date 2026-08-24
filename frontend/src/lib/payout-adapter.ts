/**
 * 지급 어댑터 (명세 16.2 · PayoutAdapter).
 *
 * 운영자 보수·공간사용료·투자 회수금을 등록 계좌로 보내는 자리다.
 * 실제 이체는 지급대행 계약이 있어야 하고, 그건 출시 전 게이트(17.3)다.
 * 그때까지는 Mock이 이체 역할을 하고, **화면은 그 사실을 그대로 적는다** —
 * 신탁 표기(`분리보관 · 출시 시 신탁 적용`)와 같은 규칙이다.
 *
 * 토스페이먼츠 지급대행을 붙일 때는 이 인터페이스 뒤에 구현체만 갈아 끼운다.
 * 지급대행은 Request Body를 JWE로 암호화해야 해서 **보안 키**가 추가로 필요하다
 * (가상계좌 발급에 쓰는 시크릿 키와 별개다).
 */

export type PayoutRequest = {
  payoutId: string;
  payeeName: string;
  amount: bigint;
  /** 지급 사유 표시용 */
  memo: string;
  bankName: string | null;
  /**
   * 지급사가 준 계좌 토큰. 계좌번호 원문은 DB에 없다 — 있으면 유출 시 그대로
   * 쓸 수 있는 값이 된다. 이체도 토큰으로 건다.
   */
  accountToken: string | null;
  /** 표시용 마스킹 번호. 로그·화면에만 쓴다. */
  maskedNumber: string | null;
};

export type PayoutResult =
  | { ok: true; providerTransferId: string; transferredAt: Date }
  | { ok: false; code: string; message: string };

export type PayoutMode = "mock" | "live";

export type PayoutProviderStatus = {
  mode: PayoutMode;
  /** 화면에 그대로 띄우는 문구 */
  label: string;
  provider: string;
};

/**
 * 이체 결과 조회 응답.
 *
 * `unknown`은 "실패"가 아니다. 지급사가 아직 모른다는 뜻이고, 그때 재송금하면
 * 이중 이체가 된다. 그래서 성공·실패와 따로 둔다.
 */
export type PayoutInquiry =
  | { state: "sent"; providerTransferId: string; transferredAt: Date }
  | { state: "failed"; code: string; message: string }
  | { state: "not_found" }
  | { state: "unknown"; message: string };

export interface PayoutAdapter {
  readonly provider: string;
  status(): PayoutProviderStatus;
  transfer(request: PayoutRequest): Promise<PayoutResult>;
  /**
   * 같은 거래번호로 결과를 조회한다.
   *
   * 이체 요청이 응답 없이 끊겼을 때 재송금 대신 이걸 부른다 — 돈이 이미 나갔는지
   * 지급사에게 묻는 게 유일하게 안전한 길이다. 명세 16.2 지급 어댑터 규약.
   */
  inquire(payoutId: string): Promise<PayoutInquiry>;
}

/**
 * 데모용. 실제 돈을 옮기지 않고, 옮겼다고 주장하지도 않는다.
 *
 * MOCK_PAYOUT_SCENARIO로 실패 분기를 재현한다 (S2 지급 실패 처리 시연용).
 * - normal(기본): 성공
 * - no_account: 등록 계좌가 없어 실패
 * - account_invalid: 계좌번호·예금주 불일치로 실패
 * - bank_error: 은행 응답 오류로 실패
 *
 * 코드별로 다음에 할 일이 갈린다 — lib/payout-failure.ts가 그 표를 들고 있다.
 */
class MockPayoutAdapter implements PayoutAdapter {
  readonly provider = "mock";

  private get scenario(): string {
    return process.env.MOCK_PAYOUT_SCENARIO || "normal";
  }

  status(): PayoutProviderStatus {
    return {
      mode: "mock",
      label: "모의 지급 · 출시 시 지급대행 연동",
      provider: this.provider,
    };
  }

  async transfer(request: PayoutRequest): Promise<PayoutResult> {
    if (this.scenario === "no_account" || !request.accountToken) {
      return {
        ok: false,
        code: "PAYOUT_NO_ACCOUNT",
        message: "등록된 회수 계좌가 없습니다. 계좌를 등록한 뒤 다시 시도해 주세요.",
      };
    }
    if (this.scenario === "account_invalid") {
      return {
        ok: false,
        code: "PAYOUT_ACCOUNT_INVALID",
        message: "등록된 계좌로 보낼 수 없습니다. 계좌번호와 예금주를 확인해 주세요.",
      };
    }
    if (this.scenario === "bank_error") {
      return {
        ok: false,
        code: "PAYOUT_BANK_ERROR",
        message: "은행 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }

    if (this.scenario === "timeout") {
      // 보냈는지 아닌지 모르는 상태. 호출부가 재송금 대신 조회로 가야 한다.
      return {
        ok: false,
        code: "PAYOUT_TIMEOUT",
        message: "지급사 응답이 없습니다. 결과를 조회한 뒤 처리합니다.",
      };
    }

    console.info(
      `[payout:mock] ${request.payeeName} · ${request.amount.toString()}원 · ${request.memo}`,
    );
    return {
      // 같은 지급 건은 같은 값이 나온다 — 재시도가 이중 이체로 보이지 않게.
      ok: true,
      providerTransferId: `mock_transfer_${request.payoutId}`,
      transferredAt: new Date(),
    };
  }

  async inquire(payoutId: string): Promise<PayoutInquiry> {
    // Mock은 실제로 보낸 적이 없으므로 시나리오가 답을 정한다.
    // timeout 시나리오는 "사실은 나갔더라"를 재현한다 — 재송금했다면 이중 이체였을 상황.
    if (this.scenario === "timeout") {
      return {
        state: "sent",
        providerTransferId: `mock_transfer_${payoutId}`,
        transferredAt: new Date(),
      };
    }
    if (this.scenario === "timeout_unknown") {
      return { state: "unknown", message: "지급사가 아직 결과를 확정하지 못했습니다." };
    }
    return { state: "not_found" };
  }
}

let adapter: PayoutAdapter = new MockPayoutAdapter();

export function getPayoutAdapter(): PayoutAdapter {
  return adapter;
}

/** 지급대행 계약이 붙으면 여기로 갈아 끼운다. */
export function setPayoutAdapter(next: PayoutAdapter): void {
  adapter = next;
}

export function payoutProviderStatus(): PayoutProviderStatus {
  return adapter.status();
}
