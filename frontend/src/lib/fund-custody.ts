/**
 * 투자금 분리보관 어댑터 (명세 3.4 · 16.2).
 *
 * 투자금은 팜피 고유계정과 분리해 **신탁**으로 보관한다. 이는 인가·계약 사항이라
 * 출시 전 게이트에서 확정되고, 그때까지는 Mock으로 둔다. 화면에는 지금이 어느
 * 단계인지를 그대로 적는다 — "분리보관 · 출시 시 신탁 적용".
 *
 * "에스크로"라고 부르지 않는다. 도산 격리는 신탁의 역할이고, 조건 충족 시 집행은
 * 마일스톤 게이트의 역할이다. 둘 다 에스크로가 아니다.
 */

export type CustodyMode = "mock" | "trust";

export type FundCustodyStatus = {
  mode: CustodyMode;
  /** 화면에 그대로 띄우는 문구 */
  label: string;
  /** 실제로 고유계정과 분리돼 있는가 */
  separated: boolean;
  /** 신탁사 이름. Mock 단계에서는 null */
  trustee: string | null;
};

export interface FundCustodyAdapter {
  readonly provider: string;
  status(): FundCustodyStatus;
  /** 납입금이 분리보관 계정에 들어온 사실을 기록한다. */
  recordDeposit(input: { investmentId: string; amount: bigint }): Promise<void>;
  /** 마일스톤 집행으로 분리보관 계정에서 나간 사실을 기록한다. */
  recordDisbursement(input: { projectId: string; amount: bigint; memo: string }): Promise<void>;
}

/**
 * 데모용. 실제 자금을 옮기지 않고, 옮겼다고 주장하지도 않는다.
 * 흐름이 도는 것만 확인하고 출시 시 신탁사 어댑터로 통째로 교체된다.
 */
class MockFundCustodyAdapter implements FundCustodyAdapter {
  readonly provider = "mock";

  status(): FundCustodyStatus {
    return {
      mode: "mock",
      label: "분리보관 · 출시 시 신탁 적용",
      separated: false,
      trustee: null,
    };
  }

  async recordDeposit(input: { investmentId: string; amount: bigint }): Promise<void> {
    console.info(
      `[fund-custody:mock] 납입 기록 · 신청 ${input.investmentId} · ${input.amount.toString()}원`,
    );
  }

  async recordDisbursement(input: {
    projectId: string;
    amount: bigint;
    memo: string;
  }): Promise<void> {
    console.info(
      `[fund-custody:mock] 집행 기록 · 프로젝트 ${input.projectId} · ${input.amount.toString()}원 · ${input.memo}`,
    );
  }
}

let adapter: FundCustodyAdapter = new MockFundCustodyAdapter();

export function getFundCustodyAdapter(): FundCustodyAdapter {
  return adapter;
}

/** 신탁사 연동이 붙으면 여기로 갈아 끼운다. */
export function setFundCustodyAdapter(next: FundCustodyAdapter): void {
  adapter = next;
}

export function fundCustodyStatus(): FundCustodyStatus {
  return adapter.status();
}
