"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InfoRow,
  SkeletonBlock,
  TextArea,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getJson, postJson } from "../api";
import { AdminShell } from "./AdminShell";

type Appeal = {
  id: string;
  projectId: string;
  milestoneId: string;
  reason: string;
  status: string;
  attachmentUrl: string | null;
  createdAt: string;
  milestone: { seq: number; name: string; status: string };
  _count: { comments: number };
};

const STATUS_LABEL: Record<string, string> = {
  open: "접수",
  under_review: "검토 중",
  escalated: "외부 전문가 이관",
  approved: "인용",
  rejected: "기각",
};

export function ExpertReviewScreen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["appeals"],
    queryFn: () => getJson<{ appeals: Appeal[] }>("/api/appeals"),
    select: (d) => d.appeals,
    retry: false,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <AdminShell title="외부 전문가 최종 판정">
        <SkeletonBlock height={360} />
      </AdminShell>
    );
  }

  if (isError || !data) {
    return (
      <AdminShell title="외부 전문가 최종 판정">
        <EmptyState
          title="이의제기 목록을 볼 수 없습니다"
          desc="관리자로 로그인한 뒤 다시 확인해 주세요."
        />
      </AdminShell>
    );
  }

  const selected = data.find((a) => a.id === selectedId) ?? data[0] ?? null;

  // review → escalate → approve/reject 순서로 상태를 옮긴다. 최종 판정에는 사유가 필수다.
  async function decide(action: "review" | "escalate" | "approve" | "reject") {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/appeals/${selected.id}/decision`, {
        action,
        decision: note.trim() || undefined,
      });
      setNote("");
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "판정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="외부 전문가 최종 판정"
      desc="운영팀 재검증에서도 결론이 나지 않은 건을 외부 전문가가 마지막으로 본다."
      action={<span className="text-12 text-muted">접수 {data.length}건</span>}
    >
      {data.length === 0 ? (
        <EmptyState
          title="판정할 건이 없습니다"
          desc="이의제기가 접수되면 여기에 올라옵니다."
        />
      ) : (
        <div className="flex items-start gap-8">
          <Card className="w-[300px] shrink-0" padded={false}>
            {data.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelectedId(a.id);
                  setNote("");
                }}
                className={`block w-full border-b border-surface px-5 py-4 text-left last:border-b-0 ${
                  selected?.id === a.id ? "bg-surface" : ""
                }`}
              >
                <span className="block text-12 font-medium text-ink">
                  {a.milestone.seq}단계 {a.milestone.name}
                </span>
                <span className="mt-1.5 block text-11 text-muted">
                  {STATUS_LABEL[a.status] ?? a.status} · {formatDate(a.createdAt)}
                </span>
              </button>
            ))}
          </Card>

          {selected ? (
            <Card className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-16 font-bold text-ink">
                  {selected.milestone.seq}단계 {selected.milestone.name}
                </h2>
                <Badge tone="plain">
                  {STATUS_LABEL[selected.status] ?? selected.status}
                </Badge>
              </div>

              <div className="mt-5">
                <InfoRow label="접수 시각" value={formatDate(selected.createdAt)} />
                <InfoRow label="댓글" value={`${selected._count.comments}건`} />
                <InfoRow
                  label="현재 단계 상태"
                  value={selected.milestone.status}
                />
              </div>

              <p className="mt-6 text-12 text-muted">이의제기 사유</p>
              <p className="mt-2 rounded-8 border border-line bg-surface px-5 py-4 text-13 leading-6 text-body">
                {selected.reason}
              </p>

              {selected.attachmentUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.attachmentUrl}
                  alt="첨부 자료"
                  className="mt-4 h-[180px] w-full rounded-8 border border-line object-cover"
                />
              ) : null}

              <p className="mt-7 text-12 text-muted">판정 사유</p>
              <div className="mt-2">
                <TextArea
                  placeholder="판정 근거를 적어 주세요. 운영자와 감사 로그에 그대로 남습니다."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

              <div className="mt-5 flex gap-2">
                {selected.status === "open" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void decide("review")}
                  >
                    검토 착수
                  </Button>
                ) : null}
                {selected.status === "open" || selected.status === "under_review" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void decide("escalate")}
                  >
                    외부 전문가 이관
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || !note.trim()}
                  onClick={() => void decide("approve")}
                >
                  인용 (재검증 열기)
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || !note.trim()}
                  onClick={() => void decide("reject")}
                >
                  기각 (보류 유지)
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </AdminShell>
  );
}
