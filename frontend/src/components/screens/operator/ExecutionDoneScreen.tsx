"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState,
  InfoRow,
  PanelShell,
  SkeletonBlock,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getJson, num, won } from "../api";
import { useOperatorMilestones } from "./MilestonesScreen";

type MilestoneDetail = {
  id: string;
  seq: number;
  name: string;
  status: string;
  releaseAmount: number;
  completedAt: string | null;
  project: { id: string; name: string; location: string | null };
};

export function ExecutionDoneScreen({ milestoneId }: { milestoneId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["milestone", milestoneId],
    queryFn: () =>
      getJson<{ milestone: MilestoneDetail }>(`/api/milestones/${milestoneId}`),
    select: (d) => d.milestone,
  });
  const { data: all } = useOperatorMilestones();

  if (isLoading || !data) {
    return (
      <PanelShell>
        <SkeletonBlock height={320} />
      </PanelShell>
    );
  }

  if (data.status !== "completed") {
    return (
      <PanelShell>
        <EmptyState
          title="아직 집행되지 않은 단계입니다"
          desc="증빙이 승인되면 집행 결과를 여기서 볼 수 있습니다."
          action={
            <Button href={`/operator/milestones/${milestoneId}/evidence`}>
              증빙 제출
            </Button>
          }
        />
      </PanelShell>
    );
  }

  const next = (all ?? [])
    .filter(
      (m) => m.project.id === data.project.id && m.seq > data.seq && m.status !== "completed",
    )
    .sort((a, b) => a.seq - b.seq)[0];

  return (
    <PanelShell className="max-w-modal">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-14 text-white">
          ✓
        </span>
        <h1 className="text-20 font-bold text-ink">집행이 완료되었습니다</h1>
      </div>
      <p className="mt-3 text-13 text-muted">
        {data.project.name} · {data.seq}단계 {data.name}
      </p>

      <Card className="mt-7">
        <p className="text-13 text-muted">집행 금액</p>
        <p className="mt-2 font-num text-28 font-medium text-brand">
          {num(data.releaseAmount)}
          <span className="ml-1 text-15 text-body">원</span>
        </p>

        <div className="mt-6">
          <InfoRow
            label="집행 시각"
            value={data.completedAt ? formatDate(data.completedAt) : "-"}
          />
          <InfoRow label="집행 번호" value={data.id.slice(-12).toUpperCase()} />
          <InfoRow label="집행 근거" value="증빙 승인 후 자동 집행" />
        </div>
      </Card>

      {next ? (
        <Card className="mt-4">
          <p className="text-13 text-muted">
            다음 단계인 {next.seq}단계 {next.name} 증빙을 제출할 수 있습니다.
          </p>
          <div className="mt-5">
            <Button full href={`/operator/milestones/${next.id}/evidence`}>
              다음 증빙 제출하기
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="mt-5">
        <Button full variant="ghost" href="/operator/settlements">
          집행 내역 보기
        </Button>
      </div>
    </PanelShell>
  );
}
