"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState,
  InfoRow,
  PanelShell,
  SkeletonBlock,
  TextArea,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  MILESTONE_STATUS_LABEL,
  getJson,
  postJson,
  won,
} from "../api";

type MilestoneDetail = {
  id: string;
  seq: number;
  name: string;
  status: string;
  releaseAmount: number;
  reviewNote: string | null;
  evidenceSubmittedAt: string | null;
  project: { id: string; name: string; location: string | null };
};

export function AppealScreen({ milestoneId }: { milestoneId: string }) {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["milestone", milestoneId],
    queryFn: () =>
      getJson<{ milestone: MilestoneDetail }>(`/api/milestones/${milestoneId}`),
    select: (d) => d.milestone,
  });

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (isLoading || !data) {
    return (
      <PanelShell>
        <SkeletonBlock height={360} />
      </PanelShell>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/milestones/${milestoneId}/appeals`, {
        reason: reason.trim(),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "접수에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <PanelShell>
        <EmptyState
          title="이의제기가 접수됐습니다"
          desc="운영팀이 다시 확인한 뒤 판정 결과를 알려드립니다."
          action={
            <Button onClick={() => router.push("/operator/milestones")}>
              검증 현황으로
            </Button>
          }
        />
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <h1 className="text-22 font-bold text-ink">증빙 보완 · 이의제기</h1>
      <p className="mt-3 text-14 text-body">
        판정에 이견이 있으면 근거를 적어 다시 검토를 요청할 수 있습니다.
      </p>

      <Card className="mt-7">
        <p className="text-15 font-bold text-ink">
          {data.project.name} · {data.seq}단계 {data.name}
        </p>
        <div className="mt-4">
          <InfoRow
            label="현재 상태"
            value={MILESTONE_STATUS_LABEL[data.status] ?? data.status}
          />
          <InfoRow label="집행 예정액" value={won(data.releaseAmount)} />
          <InfoRow
            label="최근 제출"
            value={
              data.evidenceSubmittedAt
                ? formatDate(data.evidenceSubmittedAt)
                : "없음"
            }
          />
        </div>
        {data.reviewNote ? (
          <div className="mt-5 rounded-8 border border-line bg-surface px-5 py-4">
            <p className="text-12 font-medium text-danger">판정 사유</p>
            <p className="mt-2 text-12 leading-5 text-body">{data.reviewNote}</p>
          </div>
        ) : null}
      </Card>

      <Card className="mt-4">
        <p className="text-14 font-bold text-ink">이의제기 사유</p>
        <div className="mt-3">
          <TextArea
            placeholder="어떤 부분이 사실과 다른지, 어떤 자료로 확인할 수 있는지 적어 주세요."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button full disabled={busy || !reason.trim()} onClick={submit}>
            {busy ? "접수 중" : "이의제기 접수"}
          </Button>
          <Button
            full
            variant="ghost"
            href={`/operator/milestones/${milestoneId}/evidence`}
          >
            증빙 다시 제출
          </Button>
        </div>
      </Card>
    </PanelShell>
  );
}
