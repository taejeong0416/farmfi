"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Card } from "@/components/ui";
import { useAuth } from "@/lib/useAuth";
import { postJson, shortDate, won, type Investment } from "../api";

const QUESTIONS = [
  {
    q: "이 투자금은 예금처럼 원금이 보장되나요?",
    a: "매출과 운영 상황에 따라 회수 기간과 금액이 달라질 수 있어요.",
  },
  {
    q: "투자한 뒤 필요할 때 바로 돌려받을 수 있나요?",
    a: "중도 환금이 어렵고, 약정된 회수 구조를 따라요.",
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  /*
   * 화면에 들어오면 신청 한 건을 만들어 둔다. 같은 프로젝트에 진행 중인 건이 있으면
   * 그것을 잇는다. 이 주소를 로그인 없이 바로 열면 신청을 만들 수 없으므로,
   * 오류 문구 대신 로그인으로 보내고 끝나면 입력 금액 그대로 여기로 돌아온다.
   */
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      const here = `/projects/${projectId}/invest/eligibility?amount=${amount}`;
      router.replace(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
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
  }, [projectId, amount, isAuthenticated, authLoading, router]);

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
    <Overlay projectId={projectId} width="max-w-panel">
      <p className="text-14 font-medium text-brand">투자 전 확인</p>
      <h1 className="mt-4 text-24 font-bold text-ink">
        나에게 맞는 투자인지 먼저 확인해요
      </h1>
      <p className="mt-3 text-14 text-body">
        투자 구조와 위험을 충분히 이해했는지 함께 확인하는 과정입니다.
      </p>

      <div className="mt-5 flex items-center justify-between gap-6 rounded-10 bg-surface px-4 py-4">
        <p className="text-14 font-medium text-ink">약 2분이면 끝나요!</p>
        <p className="text-12 text-body">
          답변에 따라 투자 한도가 달라지거나 추가 안내가 필요할 수 있어요.
        </p>
      </div>

      <div className="mt-[18px] space-y-[18px]">
        {QUESTIONS.map((item, i) => (
          <button
            key={item.q}
            type="button"
            aria-pressed={checked[i]}
            onClick={() =>
              setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)))
            }
            className="flex w-full items-center gap-4 rounded-10 border border-line bg-white px-4 py-4 text-left"
          >
            <span className="flex-1">
              <span className="block text-18 font-bold text-ink">
                {i + 1}&nbsp;&nbsp;{item.q}
              </span>
              <span className="mt-2 block text-14 font-medium text-brand">
                {item.a}
              </span>
            </span>
            <span
              className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-4 border text-11 text-white ${
                checked[i] ? "border-brand bg-brand" : "border-line bg-white"
              }`}
            >
              {checked[i] ? "✓" : ""}
            </span>
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-[18px]">
        <Button full disabled={!allChecked || !investment || busy} onClick={submit}>
          {busy ? "확인 중" : "확인하고 다음으로"}
        </Button>
      </div>

      <p className="mt-[18px] text-center text-12 text-muted">
        투자 위험과 적합성 기준 자세히 보기
      </p>
    </Overlay>
  );
}

/**
 * 이 흐름은 프로젝트 상세 위에 뜨는 모달이다. 질문지와 판정 결과가 같은 층에
 * 있어야 뒤에 무엇을 보다가 왔는지 유지되고, 닫으면 그 자리로 돌아간다.
 */
function Overlay({
  projectId,
  width,
  children,
}: {
  projectId: string;
  width: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/70 p-6">
      <div
        className={`relative my-auto w-full ${width} rounded-10 bg-white px-[34px] py-[34px]`}
      >
        <Link
          href={`/projects/${projectId}`}
          aria-label="닫기"
          className="absolute right-7 top-8 text-16 text-ink"
        >
          ✕
        </Link>
        {children}
      </div>
    </div>
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

  /*
   * 부적격 사유는 하나가 아니다. 본인확인을 안 마친 사람에게 한도 이야기를 하면
   * 실명 확인이 끝난 것처럼 읽히고, 정작 해야 할 일(신분증·계좌 확인)은 화면 어디에도
   * 없다. 사유가 본인확인이면 그 화면으로 데려간다.
   */
  const identityBlocked = !investment.eligible && investment.status === "IDENTITY_REQUIRED";
  const backHere = `/projects/${projectId}/invest/eligibility?amount=${investment.amount}`;

  if (identityBlocked) {
    return (
      <Overlay projectId={projectId} width="max-w-modal">
        <h1 className="text-24 font-bold text-ink">본인확인을 먼저 마쳐 주세요</h1>
        <p className="mt-3 text-13 leading-6 text-muted">
          {investment.eligibilityMemo ?? "첫 투자 전에는 본인확인이 필요합니다."}
        </p>

        <Card className="mt-6" padded={false}>
          <div className="px-5">
            <Row label="모바일 신분증 확인" ok={false} />
            <Row label="본인 명의 계좌 확인" ok={false} />
          </div>
        </Card>

        <div className="mt-5 rounded-8 border border-brand bg-brand-soft px-5 py-4">
          <p className="text-13 font-bold text-brand">확인을 마치면 이 신청으로 돌아와요</p>
          <p className="mt-2 text-12 text-body">
            입력한 금액 {won(investment.amount)}은 그대로 남습니다. 신분증과 계좌를 확인한 뒤
            바로 이어서 신청할 수 있어요.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <Button full href={`/verify?next=${encodeURIComponent(backHere)}`}>
            본인확인 시작하기
          </Button>
          <Button full variant="ghost" href={`/projects/${projectId}`}>
            프로젝트로 돌아가기
          </Button>
        </div>

        <p className="mt-5 text-12 text-muted">
          FarmFi는 실명·성인 여부 등 필요한 확인값만 저장하고 신분증 원문은 보관하지 않아요.
        </p>
      </Overlay>
    );
  }

  return (
    <Overlay projectId={projectId} width="max-w-modal">
      <h1 className="text-24 font-bold text-ink">지금은 투자 신청이 어려워요</h1>
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

      <p className="mt-5 text-12 text-muted">
        표시된 한도가 실제와 다르면 한도 안내에서 확인을 요청할 수 있어요. 판정 결과는 투자 신청 기록에 남습니다.
      </p>
    </Overlay>
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
