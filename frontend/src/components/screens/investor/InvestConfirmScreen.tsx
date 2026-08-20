"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, Checkbox, PanelShell, SkeletonBlock } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { postJson, useInvestment, won, type Investment } from "../api";

const DOCUMENTS = ["투자계약서", "핵심위험 안내서", "개인정보 제공 동의"];

export function InvestConfirmScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const iid = params?.get("iid") ?? null;

  const { data: investment, isLoading, refetch } = useInvestment(iid);
  const [agreed, setAgreed] = useState<boolean[]>([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (isLoading || !investment) {
    return (
      <PanelShell>
        <SkeletonBlock height={420} />
      </PanelShell>
    );
  }

  if (failure) {
    return (
      <DepositFailureView
        projectId={projectId}
        investment={investment}
        reason={failure}
        onRetry={async () => {
          setFailure(null);
          await refetch();
        }}
      />
    );
  }

  async function submit() {
    if (!investment) return;
    setBusy(true);
    try {
      await postJson(`/api/investments/${investment.id}/consent`, {
        signature: "전자서명 동의",
      });
      await postJson(`/api/investments/${investment.id}/deposit`);
      router.push(
        `/projects/${projectId}/invest/done?iid=${investment.id}`,
      );
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "납입에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const allAgreed = agreed.every(Boolean);

  return (
    <PanelShell>
      <p className="text-13 font-medium text-brand">마지막 단계</p>
      <h1 className="mt-3 text-24 font-bold text-ink">
        신청 내용을 한 번 더 확인해 주세요
      </h1>
      <p className="mt-3 text-14 leading-6 text-body">
        계약을 확인하면 신청 금액이 신탁 계좌로 예치됩니다. 예치 후 신청 상태를 확인할 수 있습니다.
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
        <p className="mt-2 text-15 font-bold text-ink">확인된 본인 명의 계좌</p>
        <p className="mt-3 text-12 text-muted">
          계약 동의 후 신청 금액이 신탁 계좌로 예치됩니다.
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
          계약서와 위험 안내를 확인한 뒤 동의해 주세요. 동의와 예치 확인 내역은 변경하기 어렵게 기록됩니다.
        </p>
      </Card>

      <div className="mt-6 space-y-3">
        <Button full disabled={!allAgreed || busy} onClick={submit}>
          {busy ? "처리 중" : "계약 동의하고 예치하기"}
        </Button>
        <Button full variant="ghost" href={`/projects/${projectId}`}>
          신청 내용 수정
        </Button>
      </div>

      <p className="mt-5 text-12 text-muted">
        예치 확인이 늦어지면 처리 내역 확인을 요청할 수 있어요.
      </p>
    </PanelShell>
  );
}

/** I-03E · 납입 실패 · 재시도 */
function DepositFailureView({
  projectId,
  investment,
  reason,
  onRetry,
}: {
  projectId: string;
  investment: Investment;
  reason: string;
  onRetry: () => void;
}) {
  return (
    <PanelShell>
      <p className="text-13 text-brand">투자 신청</p>
      <h1 className="mt-3 text-24 font-bold text-ink">
        아직 신청이 완료되지 않았어요
      </h1>
      <p className="mt-3 text-14 leading-6 text-body">
        예치가 확인되지 않았습니다. 아래 내용을 확인한 뒤 다시 시도해 주세요.
      </p>

      <div className="mt-6 rounded-12 border border-line bg-white px-6 py-5">
        <p className="text-17 font-bold text-danger">예치 확인 대기</p>
        <p className="mt-2 text-14 font-medium text-ink">
          {investment.project?.name ?? "프로젝트"} /{" "}
          <span className="font-num">{won(investment.amount)}</span>
        </p>
        <p className="mt-2 text-12 text-muted">
          마지막 확인 {formatDate(new Date())}
        </p>
        <p className="mt-3 text-12 text-danger">{reason}</p>
      </div>

      <div className="mt-4 rounded-12 border border-line bg-white px-6 py-5">
        <p className="text-14 font-medium text-ink">
          1. 등록 계좌의 잔액과 신청 금액이 맞는지 확인해 주세요.
        </p>
        <p className="mt-3 text-14 font-medium text-ink">
          2. 이미 처리했다면 처리 내역 확인을 요청할 수 있어요.
        </p>
        <p className="mt-3 text-13 text-muted">
          3. 모집 마감이 지났다면 신청을 새로 시작해 주세요.
        </p>
      </div>

      <div className="mt-4 rounded-12 border border-brand bg-brand-soft px-6 py-5">
        <p className="text-15 font-bold text-brand">
          신청 물량은 잠시 동안만 유지돼요
        </p>
        <p className="mt-2 text-12 text-body">
          시간이 지나면 투자 가능 금액이 다른 신청자에게 열릴 수 있어요.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <Button full onClick={onRetry}>
          다시 시도하기
        </Button>
        <Button full variant="ghost" href={`/projects/${projectId}`}>
          신청 취소 · 프로젝트로 돌아가기
        </Button>
      </div>
    </PanelShell>
  );
}
