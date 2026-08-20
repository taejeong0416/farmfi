"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, PanelShell } from "@/components/ui";
import { postJson, shortDate, won, type Investment } from "../api";

const QUESTIONS = [
  {
    q: "이 투자금은 예금처럼 원금이 보장되나요?",
    a: "아니요. 매출과 운영 상황에 따라 회수 기간과 금액이 달라질 수 있어요.",
  },
  {
    q: "투자한 뒤 필요할 때 바로 돌려받을 수 있나요?",
    a: "아니요. 중도 환금이 어렵고, 약정된 회수 구조를 따라요.",
  },
  {
    q: "손실 가능성을 감당할 수 있는 금액인가요?",
    a: "생활에 필요한 자금과 분리된 여유 자금으로만 참여해 주세요.",
  },
];

export function InvestEligibilityScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const amount = Number(params?.get("amount") ?? 0);

  const [investment, setInvestment] = useState<Investment | null>(null);
  const [checked, setChecked] = useState<boolean[]>([false, false, false]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<Investment | null>(null);

  // 화면에 들어오면 신청 한 건을 만들어 둔다. 같은 프로젝트에 진행 중인 건이 있으면 그것을 잇는다.
  useEffect(() => {
    let cancelled = false;
    postJson<{ investment: Investment }>("/api/investments", {
      projectId,
      amount,
    })
      .then((d) => {
        if (!cancelled) setInvestment(d.investment);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "신청을 시작하지 못했습니다."),
      );
    return () => {
      cancelled = true;
    };
  }, [projectId, amount]);

  async function submit() {
    if (!investment) return;
    setBusy(true);
    setError(null);
    try {
      const d = await postJson<{ investment: Investment }>(
        `/api/investments/${investment.id}/eligibility`,
      );
      if (d.investment.eligible) {
        router.push(`/projects/${projectId}/invest/confirm?iid=${d.investment.id}`);
      } else {
        setRejected(d.investment);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "판정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (rejected) {
    return <IneligibleView projectId={projectId} investment={rejected} />;
  }

  const allChecked = checked.every(Boolean);

  return (
    <PanelShell>
      <p className="text-13 font-medium text-brand">투자 전 확인</p>
      <h1 className="mt-3 text-24 font-bold text-ink">
        나에게 맞는 투자인지 먼저 확인해요
      </h1>
      <p className="mt-3 text-14 leading-6 text-body">
        정답을 맞히는 절차가 아니라, 투자 구조와 위험을 충분히 이해했는지 함께 확인하는 과정입니다.
      </p>

      <div className="mt-7 rounded-14 bg-brand-soft px-6 py-5">
        <p className="text-15 font-bold text-brand">약 2분이면 끝나요</p>
        <p className="mt-2 text-13 text-body">
          답변에 따라 투자 한도가 달라지거나 추가 안내가 필요할 수 있어요.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {QUESTIONS.map((item, i) => (
          <button
            key={item.q}
            type="button"
            onClick={() =>
              setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)))
            }
            className={`block w-full rounded-14 border px-6 py-5 text-left transition-colors ${
              checked[i] ? "border-brand bg-brand-soft" : "border-line bg-white"
            }`}
          >
            <p className="text-15 font-medium text-ink">
              {i + 1} {item.q}
            </p>
            <p
              className={`mt-2 text-13 ${checked[i] ? "text-brand" : "text-muted"}`}
            >
              {checked[i] ? "선택됨 · " : ""}
              {item.a}
            </p>
          </button>
        ))}
      </div>

      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <span className="text-13 text-muted">신청 금액</span>
          <span className="font-num text-15 font-medium text-ink">
            {won(amount)}
          </span>
        </div>
      </Card>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-6">
        <Button full disabled={!allChecked || !investment || busy} onClick={submit}>
          {busy ? "확인 중" : "확인하고 다음으로"}
        </Button>
      </div>

      <p className="mt-5 text-12 text-muted">
        투자 위험과 적합성 기준 자세히 보기
      </p>
    </PanelShell>
  );
}

/** I-02E · 투자 부적격·한도 초과 안내 */
function IneligibleView({
  projectId,
  investment,
}: {
  projectId: string;
  investment: Investment;
}) {
  const limit = investment.annualLimit;
  const renewal = new Date(new Date().getFullYear() + 1, 0, 1);

  return (
    <PanelShell className="max-w-modal">
      <h1 className="text-20 font-bold text-ink">지금은 투자 신청이 어려워요</h1>
      <p className="mt-3 text-13 leading-6 text-muted">
        {investment.eligibilityMemo ?? "신청 조건을 충족하지 못했습니다."}
      </p>

      <Card className="mt-6" padded={false}>
        <div className="px-5">
          <Row label="성인 여부" ok />
          <Row label="실명 확인" ok />
          <Row
            label="연간 투자 한도"
            ok={false}
            value={limit != null ? won(limit) : undefined}
          />
        </div>
      </Card>

      <div className="mt-4 rounded-8 border border-line bg-surface px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-12 text-muted">잔여 한도</span>
          <span className="font-num text-14 font-medium text-ink">
            {limit != null ? won(Math.max(0, limit)) : "-"}
            <span className="ml-2 text-12 font-normal text-muted">
              · 갱신 {shortDate(renewal)}
            </span>
          </span>
        </div>
      </div>

      <div className="mt-5 rounded-8 border border-brand bg-brand-soft px-5 py-4">
        <p className="text-13 font-bold text-brand">
          한도는 {shortDate(renewal)}에 자동으로 갱신돼요
        </p>
        <p className="mt-2 text-12 text-body">
          지금은 추가 투자가 어려워요. 한도가 갱신되는 날짜를 확인하고 다시 시도해 주세요.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <Button full href="/verify">
          한도 정보 다시 확인하기
        </Button>
        <Button full variant="ghost" href={`/projects/${projectId}`}>
          프로젝트로 돌아가기
        </Button>
      </div>

      <p className="mt-5 text-11 text-muted">
        표시된 한도가 실제와 다르면 한도 안내에서 확인을 요청할 수 있어요. 판정 결과는 투자 신청 기록에 남습니다.
      </p>
    </PanelShell>
  );
}

function Row({
  label,
  ok,
  value,
}: {
  label: string;
  ok: boolean;
  value?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-surface py-3.5 last:border-b-0">
      <span className="text-13 text-ink">{label}</span>
      <span className="flex items-center gap-2">
        {value ? <span className="text-12 text-muted">{value}</span> : null}
        <span
          className={`h-[7px] w-[7px] rounded-full ${ok ? "bg-brand" : "bg-danger"}`}
        />
        <span
          className={`text-12 font-medium ${ok ? "text-brand" : "text-danger"}`}
        >
          {ok ? "충족" : "초과"}
        </span>
      </span>
    </div>
  );
}
