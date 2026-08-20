"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Checkbox, PanelShell, SkeletonBlock } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  cancelInvestment,
  issueVirtualAccount,
  postJson,
  requestDepositInquiry,
  useBankAccount,
  useDepositStatus,
  useInvestment,
  won,
  type DepositState,
} from "../api";

const DOCUMENTS = ["투자계약서", "핵심위험 안내서", "개인정보 제공 동의"];

export function InvestConfirmScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const iid = params?.get("iid") ?? null;

  const { data: investment, isLoading } = useInvestment(iid);
  const { data: bankAccount } = useBankAccount();
  const [agreed, setAgreed] = useState<boolean[]>([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);

  // 동의를 마쳤으면 입금 대기 화면이다. 새로고침으로 돌아와도 신청 상태로 판단한다.
  const awaiting =
    consented ||
    investment?.status === "AWAITING_DEPOSIT" ||
    investment?.status === "DEPOSIT_CONFIRMED";

  const { data: deposit, refetch } = useDepositStatus(awaiting ? iid : null, awaiting);
  const completed = deposit?.status === "COMPLETED";

  useEffect(() => {
    if (completed && iid) {
      router.push(`/projects/${projectId}/invest/done?iid=${iid}`);
    }
  }, [completed, iid, projectId, router]);

  if (isLoading || !investment) {
    return (
      <PanelShell>
        <SkeletonBlock height={420} />
      </PanelShell>
    );
  }

  async function submit() {
    if (!investment) return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/investments/${investment.id}/consent`, {
        signature: "전자서명 동의",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "동의를 저장하지 못했습니다.");
      setBusy(false);
      return;
    }
    // 동의는 끝났다. 계좌 발급이 실패해도 입금 화면에서 다시 받는다.
    try {
      await issueVirtualAccount(investment.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "입금 계좌를 만들지 못했습니다.");
    } finally {
      setConsented(true);
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (awaiting) {
    return (
      <DepositView
        projectId={projectId}
        deposit={deposit ?? null}
        amount={investment.amount}
        projectName={investment.project?.name ?? "프로젝트"}
        busy={busy}
        error={error}
        onReissue={() => run(() => issueVirtualAccount(investment.id).then(() => undefined))}
        onInquiry={() => run(() => requestDepositInquiry(investment.id))}
        onRefresh={() => run(async () => undefined)}
        onCancel={() =>
          run(async () => {
            await cancelInvestment(investment.id);
            router.push(`/projects/${projectId}`);
          })
        }
      />
    );
  }

  const allAgreed = agreed.every(Boolean);

  return (
    <PanelShell>
      <p className="text-13 font-medium text-brand">마지막 단계</p>
      <h1 className="mt-3 text-24 font-bold text-ink">
        신청 내용을 한 번 더 확인해 주세요
      </h1>
      <p className="mt-3 text-14 leading-6 text-body">
        계약에 동의하면 이 신청 건에만 쓰는 입금 계좌를 받습니다. 입금이 확인되면 신청이 완료됩니다.
      </p>

      <Card className="mt-7 rounded-14">
        <p className="text-17 font-bold text-ink">
          {investment.project?.name ?? "프로젝트"}
        </p>
        <p className="mt-3 text-15 font-medium text-ink">
          투자금액 <span className="font-num">{won(investment.amount)}</span>
        </p>
        <p className="mt-3 text-14 text-ink">
          보유 구좌 <span className="font-num">{investment.units}</span>구좌
        </p>
        <p className="mt-3 text-12 text-muted">
          예상치는 매출과 비용에 따라 달라지며 원금과 수익을 보장하지 않습니다.
        </p>
      </Card>

      <Card className="mt-4 rounded-14">
        <p className="text-13 text-muted">회수금을 받을 계좌</p>
        {bankAccount ? (
          <>
            <p className="mt-2 text-15 font-bold text-ink">
              {bankAccount.bankName}{" "}
              <span className="font-num">{bankAccount.maskedNumber}</span>
            </p>
            <p className="mt-2 text-13 text-body">예금주 {bankAccount.holderName}</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-15 font-bold text-ink">확인된 계좌가 없어요</p>
            <p className="mt-2 text-13 text-body">
              회수금과 환불을 받으려면 본인 명의 계좌를 먼저 확인해 주세요.
            </p>
            <div className="mt-4">
              <Button variant="ghost" href="/verify/account">
                계좌 확인하러 가기
              </Button>
            </div>
          </>
        )}
        <p className="mt-3 text-12 text-muted">
          투자금은 이 계좌가 아니라 신청 건별 입금 계좌로 납입합니다.
        </p>
      </Card>

      <Card className="mt-4 rounded-14">
        <div className="space-y-3">
          {DOCUMENTS.map((d, i) => (
            <Checkbox
              key={d}
              label={<span className="text-14 font-medium text-ink">{d}</span>}
              checked={agreed[i]}
              onChange={(e) =>
                setAgreed((v) =>
                  v.map((x, idx) => (idx === i ? e.target.checked : x)),
                )
              }
            />
          ))}
        </div>
        <p className="mt-4 text-12 leading-5 text-muted">
          계약서와 위험 안내를 확인한 뒤 동의해 주세요. 동의와 입금 확인 내역은 변경하기 어렵게 기록됩니다.
        </p>
      </Card>

      {error ? <p className="mt-4 text-13 text-danger">{error}</p> : null}

      <div className="mt-6 space-y-3">
        <Button full disabled={!allAgreed || busy} onClick={submit}>
          {busy ? "처리 중" : "계약 동의하고 입금 계좌 받기"}
        </Button>
        <Button full variant="ghost" href={`/projects/${projectId}`}>
          신청 내용 수정
        </Button>
      </div>
    </PanelShell>
  );
}

/** I-03 입금 대기 · I-03E 네 분기 (발급 실패 · 기한 만료 · 금액 불일치 · 확인 지연) */
function DepositView({
  projectId,
  deposit,
  amount,
  projectName,
  busy,
  error,
  onReissue,
  onInquiry,
  onRefresh,
  onCancel,
}: {
  projectId: string;
  deposit: DepositState | null;
  amount: number;
  projectName: string;
  busy: boolean;
  error: string | null;
  onReissue: () => void;
  onInquiry: () => void;
  onRefresh: () => void;
  onCancel: () => void;
}) {
  const code = deposit?.failureCode ?? null;
  const account = deposit?.virtualAccount ?? null;
  const confirmed = deposit?.status === "DEPOSIT_CONFIRMED";

  if (confirmed) {
    return (
      <PanelShell>
        <p className="text-13 font-medium text-brand">투자 신청</p>
        <h1 className="mt-3 text-24 font-bold text-ink">
          입금 확인 완료 · 기록 처리 중
        </h1>
        <p className="mt-3 text-14 leading-6 text-body">
          입금이 확인됐어요. 처리 결과는 곧 신청 완료 화면에서 보여드릴게요.
        </p>
        <div className="mt-6">
          <Button full variant="ghost" onClick={onRefresh} disabled={busy}>
            상태 새로고침
          </Button>
        </div>
      </PanelShell>
    );
  }

  const headline =
    code === "VIRTUAL_ACCOUNT_FAILED"
      ? "입금 계좌를 만들지 못했어요"
      : code === "DEPOSIT_EXPIRED"
        ? "입금 시간이 지났어요"
        : code === "AMOUNT_MISMATCH"
          ? "신청 금액과 입금액이 달라요"
          : code === "DEPOSIT_INQUIRY"
            ? "입금 확인을 요청했어요"
            : "아래 계좌로 입금하면 신청이 완료돼요";

  const lead =
    code === "VIRTUAL_ACCOUNT_FAILED"
      ? "계좌를 다시 받아 주세요. 계속 실패하면 잠시 후 다시 시도해 주세요."
      : code === "DEPOSIT_EXPIRED"
        ? "입금기한이 지나 계좌가 닫혔어요. 새 입금 계좌를 받으면 이어서 신청할 수 있어요."
        : code === "AMOUNT_MISMATCH"
          ? "입금액이 신청 금액과 달라 자동으로 확정하지 않았어요. 확인 후 안내드릴게요."
          : code === "DEPOSIT_INQUIRY"
            ? "입금 내역을 확인하고 있어요. 확인되면 신청이 자동으로 완료됩니다."
            : "입금이 확인되면 이 화면이 자동으로 넘어가요.";

  return (
    <PanelShell>
      <p className="text-13 font-medium text-brand">투자 신청</p>
      <h1 className={`mt-3 text-24 font-bold ${code ? "text-danger" : "text-ink"}`}>
        {headline}
      </h1>
      <p className="mt-3 text-14 leading-6 text-body">{lead}</p>

      <Card className="mt-7 rounded-14">
        <p className="text-13 text-muted">{projectName}</p>
        <p className="mt-2 text-15 font-medium text-ink">
          신청 금액 <span className="font-num">{won(amount)}</span>
        </p>
        {account && account.status === "ISSUED" ? (
          <div className="mt-4 rounded-12 bg-surface px-5 py-5">
            <p className="text-14 font-bold text-ink">
              {account.bankName}{" "}
              <span className="font-num">{account.accountNumber}</span>
            </p>
            <p className="mt-2 text-13 text-body">예금주 {account.holderName}</p>
            <p className="mt-2 text-13 text-body">
              입금할 금액 <span className="font-num">{won(account.amount)}</span>
            </p>
            <p className="mt-2 text-12 text-muted">
              입금기한 {formatDate(account.expiresAt)}
            </p>
            {deposit?.custody ? (
              <p className="mt-3 border-t border-line-soft pt-3 text-12 text-muted">
                투자금 보관 · {deposit.custody.label}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-13 text-muted">지금 쓸 수 있는 입금 계좌가 없어요.</p>
        )}
        {deposit?.deposit && deposit.deposit.status === "AMOUNT_MISMATCH" ? (
          <p className="mt-4 text-13 text-danger">
            확인된 입금액 <span className="font-num">{won(deposit.deposit.amount)}</span> ·
            신청 금액 <span className="font-num">{won(deposit.deposit.expectedAmount)}</span>
          </p>
        ) : null}
      </Card>

      <div className="mt-4 rounded-12 border border-line bg-white px-6 py-5">
        <p className="text-14 font-medium text-ink">
          1. 입금자 이름이 달라도 계좌가 같으면 확인됩니다.
        </p>
        <p className="mt-3 text-14 font-medium text-ink">
          2. 기한이 지나면 계좌가 닫히고, 새 계좌를 받아 다시 입금할 수 있어요.
        </p>
        <p className="mt-3 text-13 text-muted">
          3. 신청 물량은 입금기한까지만 유지돼요.
        </p>
      </div>

      {error ? <p className="mt-4 text-13 text-danger">{error}</p> : null}

      <div className="mt-6 space-y-3">
        {code === "VIRTUAL_ACCOUNT_FAILED" || code === "DEPOSIT_EXPIRED" ? (
          <Button full disabled={busy} onClick={onReissue}>
            {code === "DEPOSIT_EXPIRED" ? "새 입금 계좌 받기" : "입금 계좌 다시 받기"}
          </Button>
        ) : code === "DEPOSIT_INQUIRY" || code === "AMOUNT_MISMATCH" ? (
          <Button full disabled={busy} onClick={onRefresh}>
            상태 새로고침
          </Button>
        ) : (
          <Button full variant="ghost" disabled={busy} onClick={onInquiry}>
            입금내역 확인 요청
          </Button>
        )}
        <Button full variant="ghost" disabled={busy} onClick={onCancel}>
          신청 취소
        </Button>
        <Button full variant="ghost" href={`/projects/${projectId}`}>
          프로젝트로 돌아가기
        </Button>
      </div>
    </PanelShell>
  );
}
