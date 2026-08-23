"use client";

import {
  Button,
  Card,
  DataTable,
  EmptyState,
  InfoRow,
  PanelShell,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import {
  PAYOUT_STATUS_LABEL,
  shortDate,
  useBankAccount,
  usePayouts,
  won,
  type PayoutItem,
} from "../api";

export function PayoutDetailScreen({ id }: { id: string }) {
  const { data, isLoading, isError } = usePayouts();
  const { data: bankAccount } = useBankAccount();

  if (isLoading) {
    return (
      <PanelShell>
        <SkeletonBlock height={360} />
      </PanelShell>
    );
  }

  const payout = data?.payouts.find((p) => p.id === id);

  if (isError || !payout) {
    return (
      <PanelShell>
        <EmptyState
          title="회수 내역을 찾을 수 없습니다"
          desc="목록에서 다시 선택해 주세요."
          action={<Button href="/investor/holdings">보유 투자로</Button>}
        />
      </PanelShell>
    );
  }

  // 같은 프로젝트의 지난 회수 내역
  const history = data!.payouts
    .filter((p) => p.projectId === payout.projectId)
    .sort((a, b) => b.period.localeCompare(a.period));

  const columns: Column<PayoutItem>[] = [
    { key: "period", header: "기간", render: (p) => p.period },
    {
      key: "amount",
      header: "회수액",
      align: "right",
      render: (p) => (
        <span className="font-num text-14 font-medium">{won(p.amount)}</span>
      ),
    },
    {
      key: "paidAt",
      header: "지급일",
      align: "right",
      render: (p) => (
        <span className="text-12 text-body">{shortDate(p.paidAt)}</span>
      ),
    },
    {
      key: "status",
      header: "상태",
      align: "right",
      width: "100px",
      render: (p) => (
        <span
          className={`text-12 font-medium ${
            p.status === "paid"
              ? "text-brand"
              : p.status === "failed"
                ? "text-danger"
                : "text-body"
          }`}
        >
          {PAYOUT_STATUS_LABEL[p.status] ?? p.status}
        </span>
      ),
    },
  ];

  return (
    <PanelShell>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-15 font-bold text-ink">받은 수익 자세히 보기</h1>
          <p className="mt-2 text-12 text-muted">
            {payout.project.name} · {payout.period}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          href={`/api/payouts?projectId=${payout.projectId}&format=csv`}
        >
          내역 내보내기
        </Button>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="grid grid-cols-3">
          <Cell label="이번 달 예상 회수액" value={won(payout.amount)} accent />
          <Cell
            label="회수 예정일"
            value={payout.paidAt ? shortDate(payout.paidAt) : payout.period}
            bordered
          />
          <Cell
            label="상태"
            value={PAYOUT_STATUS_LABEL[payout.status] ?? payout.status}
            bordered
            small
          />
        </div>
      </Card>

      {payout.status === "failed" ? (
        <Card className="mt-5">
          <p className="text-14 font-bold text-danger">
            회수금을 보내지 못했습니다
          </p>
          <p className="mt-2 text-12 leading-5 text-body">
            {payout.failure?.hint ??
              payout.failureReason ??
              "사유를 확인하는 중입니다. 잠시 후 다시 확인해 주세요."}
          </p>
          {/* 수취인이 고칠 수 있는 실패만 계좌 수정 경로를 연다. 은행 일시 오류에
              계좌를 고치라고 하면 멀쩡한 계좌를 건드리게 된다. */}
          {payout.failure?.actor === "payee" ? (
            <>
              <div className="mt-4 rounded-8 border border-line bg-surface px-4 py-3">
                <p className="text-11 text-muted">지금 등록된 계좌</p>
                <p className="mt-1 text-13 text-ink">
                  {bankAccount
                    ? `${bankAccount.bankName} ${bankAccount.maskedNumber} · ${bankAccount.holderName}`
                    : "등록된 계좌가 없습니다"}
                </p>
              </div>
              <div className="mt-4">
                <Button
                  size="sm"
                  href={`/verify/account?next=${encodeURIComponent(`/investor/payouts/${payout.id}`)}`}
                >
                  {bankAccount ? "회수 계좌 수정" : "회수 계좌 등록"}
                </Button>
              </div>
              <p className="mt-3 text-11 text-muted">
                계좌를 고치면 운영팀이 다시 보냅니다. 본인 명의 계좌만 등록할 수 있습니다.
              </p>
            </>
          ) : (
            <p className="mt-3 text-11 text-muted">
              운영팀이 확인하고 다시 보냅니다. 따로 하실 일은 없습니다.
            </p>
          )}
        </Card>
      ) : null}

      <h2 className="mt-8 text-14 font-bold text-ink">산정 근거</h2>
      <Card className="mt-4" padded={false}>
        <div className="px-6">
          <InfoRow label="수취 항목" value={payout.payeeName} />
          <InfoRow label="정산 기간" value={payout.period} />
          <InfoRow label="내 예상 회수액" value={
            <span className="text-brand">{won(payout.amount)}</span>
          } />
          <InfoRow label="비고" value={payout.memo ?? "-"} />
          {payout.status === "failed" ? (
            <InfoRow
              label="실패 사유"
              value={
                <span className="text-danger">
                  {payout.failure?.label ?? payout.failureReason ?? "확인 필요"}
                </span>
              }
            />
          ) : null}
        </div>
      </Card>

      <h2 className="mt-8 text-14 font-bold text-ink">월별 회수 내역</h2>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={history}
          rowKey={(p) => p.id}
          empty="회수 내역이 없습니다."
        />
      </div>

      <p className="mt-5 text-12 text-muted">
        매출이 낮은 달에는 회수액도 함께 줄어들 수 있습니다. 표시 금액은 원천징수 전 기준입니다.
      </p>
    </PanelShell>
  );
}

function Cell({
  label,
  value,
  bordered,
  accent,
  small,
}: {
  label: string;
  value: string;
  bordered?: boolean;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`px-5 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-13 text-muted">{label}</p>
      <p
        className={`mt-1.5 font-num font-medium ${small ? "text-15" : "text-24"} ${
          accent ? "text-brand" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
