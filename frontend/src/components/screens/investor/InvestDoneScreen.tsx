"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Card, EmptyState, PanelShell, SkeletonBlock } from "@/components/ui";
import {
  MILESTONE_STATUS_LABEL,
  milestoneTone,
  num,
  shortDate,
  useInvestment,
  useProject,
  won,
} from "../api";

export function InvestDoneScreen({ projectId }: { projectId: string }) {
  const params = useSearchParams();
  const iid = params?.get("iid") ?? null;
  const { data: investment, isLoading, isError } = useInvestment(iid);
  const { data: project } = useProject(projectId);

  // 신청 번호 없이 들어오면 보여줄 완료 내역이 없다. 무한 스켈레톤 대신 안내를 준다.
  if (!iid || isError) {
    return (
      <PanelShell>
        <EmptyState
          title="완료된 투자 신청을 찾을 수 없습니다"
          desc="내 투자에서 신청 내역을 확인할 수 있습니다."
          action={
            <Link href="/investor/applications">
              <Button>신청 내역 보기</Button>
            </Link>
          }
        />
      </PanelShell>
    );
  }

  if (isLoading || !investment) {
    return (
      <PanelShell>
        <SkeletonBlock height={360} />
      </PanelShell>
    );
  }

  const milestones = [...(project?.milestones ?? [])].sort(
    (a, b) => a.seq - b.seq,
  );

  return (
    <PanelShell>
      <h1 className="text-22 font-bold text-ink">투자 신청이 완료됐어요</h1>
      <p className="mt-3 text-13 text-muted">
        예치 확인이 완료됐어요. 프로젝트가 시작되면 진행 과정과 사용 내역을 확인할 수 있습니다.
      </p>

      <Card className="mt-7" padded={false}>
        <div className="grid grid-cols-3">
          <Cell label="투자 금액" value={num(investment.amount)} unit="원" />
          <Cell label="예치 상태" value="완료" accent bordered />
          <Cell
            label="배정 예정일"
            value={shortDate(investment.project?.fundingEnd)}
            bordered
          />
        </div>
        <div className="grid grid-cols-3 border-t border-line-soft">
          <Cell
            label="프로젝트"
            value={investment.project?.name ?? "-"}
            small
          />
          <Cell
            label="신청 번호"
            value={investment.id.slice(-12).toUpperCase()}
            small
            bordered
          />
          <Cell label="신청 상태" value="접수 완료" small accent bordered />
        </div>
      </Card>

      <h2 className="mt-8 text-15 font-bold text-ink">투자금 사용 예정</h2>
      <div className="mt-4">
        {milestones.map((m) => {
          const tone = milestoneTone(m.status);
          return (
            <div
              key={m.id}
              className="flex items-center gap-4 border-b border-surface py-3.5 last:border-b-0"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  tone === "pass" ? "bg-brand" : "border border-line bg-white"
                }`}
              />
              <span className="flex-1 text-14 text-ink">
                {m.seq}단계 {m.name}
              </span>
              <span
                className={`w-[70px] text-13 ${
                  tone === "pass" ? "font-medium text-brand" : "text-muted"
                }`}
              >
                {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
              </span>
              <span className="w-[110px] text-right font-num text-14 font-medium text-ink">
                {won(m.releaseAmount)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3">
        <Button full href="/investor/holdings">
          내 투자 보기
        </Button>
        <Button full variant="ghost" href={`/projects/${projectId}`}>
          프로젝트로 돌아가기
        </Button>
      </div>

      <p className="mt-5 text-12 text-muted">
        배정 결과는 모집 마감 후 안내되며, 미배정분은 확인된 본인 계좌로 환불됩니다.
      </p>
    </PanelShell>
  );
}

function Cell({
  label,
  value,
  unit,
  bordered,
  accent,
  small,
}: {
  label: string;
  value: string;
  unit?: string;
  bordered?: boolean;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`px-5 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-13 text-muted">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span
          className={`font-num font-medium ${small ? "text-14" : "text-24"} ${
            accent ? "text-brand" : "text-ink"
          }`}
        >
          {value}
        </span>
        {unit ? <span className="text-15 text-body">{unit}</span> : null}
      </p>
    </div>
  );
}
