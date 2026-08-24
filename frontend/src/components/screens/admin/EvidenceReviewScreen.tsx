"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState,
  SkeletonBlock,
  TextArea,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { MILESTONE_STATUS_LABEL, getJson, postJson, won } from "../api";
import { AdminShell } from "./AdminShell";

type ReviewItem = {
  id: string;
  seq: number;
  name: string;
  status: string;
  releaseAmount: number;
  requiredSignals: string[];
  evidenceUrls: string[];
  evidenceNote: string | null;
  evidenceSubmittedAt: string | null;
  reviewNote: string | null;
  aiVerificationResult: unknown;
  project: { id: string; name: string; location: string | null };
};

export function EvidenceReviewScreen() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["milestones", "pendingReview"],
    queryFn: () =>
      getJson<{ milestones: ReviewItem[] }>("/api/milestones?pendingReview=1"),
    select: (d) => d.milestones,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && data && data.length > 0) setSelectedId(data[0].id);
  }, [data, selectedId]);

  if (isLoading) {
    return (
      <AdminShell label="운영팀 재검증" title="증빙 재검토">
        <SkeletonBlock height={420} />
      </AdminShell>
    );
  }

  const items = data ?? [];
  const selected = items.find((m) => m.id === selectedId) ?? null;

  async function decide(decision: "approve" | "revise") {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/milestones/${selected.id}/approve`, {
        decision,
        note: note.trim() || undefined,
      });
      setNote("");
      setSelectedId(null);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "판정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      label="운영팀 재검증"
      title="증빙 재검토"
      desc="제출된 증빙을 검토하고 재검증해요. 자동 판정이 보류된 단계를 사람이 다시 보고, 승인해야 집행이 열린다."
      action={<span className="text-12 text-muted">대기 {items.length}건</span>}
    >
      {items.length === 0 ? (
        <EmptyState
          title="재검토할 증빙이 없습니다"
          desc="운영자가 증빙을 제출하면 이 목록에 올라옵니다."
        />
      ) : (
        <div className="flex items-start gap-8">
          <Card className="w-[300px] shrink-0" padded={false}>
            {items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedId(m.id);
                  setNote("");
                }}
                className={`flex w-full items-start gap-3 border-b border-surface px-4 py-4 text-left last:border-b-0 ${
                  selectedId === m.id ? "bg-surface" : ""
                }`}
              >
                <span
                  className={`mt-1 h-full w-[3px] shrink-0 rounded-full ${
                    selectedId === m.id ? "bg-brand" : "bg-transparent"
                  }`}
                />
                <span>
                  <span className="block text-12 font-medium text-ink">
                    {m.project.name} · {m.seq}단계
                  </span>
                  <span className="mt-1.5 block text-11 text-muted">
                    {MILESTONE_STATUS_LABEL[m.status] ?? m.status} ·{" "}
                    {m.evidenceSubmittedAt
                      ? formatDate(m.evidenceSubmittedAt)
                      : "제출 시각 없음"}
                  </span>
                </span>
              </button>
            ))}
          </Card>

          {selected ? (
            <Card className="flex-1">
              <h2 className="text-14 font-bold text-ink">
                {selected.project.name} · {selected.seq}단계 {selected.name}
              </h2>
              <p className="mt-2 text-12 text-muted">
                필요 증빙 {selected.requiredSignals.length}종 · 집행 예정액{" "}
                {won(selected.releaseAmount)}
              </p>

              <div className="mt-5 rounded-8 border border-line px-5 py-2">
                <Row label="제출 시각" value={
                  selected.evidenceSubmittedAt
                    ? formatDate(selected.evidenceSubmittedAt)
                    : "-"
                } />
                <Row label="첨부 파일" value={`${selected.evidenceUrls.length}건`} />
                <Row label="운영자 설명" value={selected.evidenceNote ?? "-"} />
                {selected.reviewNote ? (
                  <Row label="지난 판정 사유" value={selected.reviewNote} />
                ) : null}
              </div>

              {selected.evidenceUrls.length > 0 ? (
                <div className="mt-5 grid grid-cols-4 gap-3">
                  {selected.evidenceUrls.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={u}
                      src={u}
                      alt={`증빙 ${i + 1}`}
                      className="h-[110px] w-full rounded-8 border border-line object-cover"
                    />
                  ))}
                </div>
              ) : null}

              {/* `.fig` A-08 — 통과·보류 유지·반려·이관 네 갈래. 고른 뒤 사유를 적는다. */}
              <p className="mt-7 text-12 text-muted">판정</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { key: "approve", label: "통과 처리" },
                  { key: "revise", label: "보완 요청" },
                  { key: "hold", label: "보류 유지" },
                  { key: "reject", label: "반려" },
                ].map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setVerdict(c.key)}
                    className={`h-9 rounded-6 border px-4 text-12 ${
                      verdict === c.key
                        ? "border-brand font-medium text-brand"
                        : "border-line text-body hover:bg-surface"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <p className="mt-6 text-12 text-muted">판정 사유</p>
              <div className="mt-2">
                <TextArea
                  placeholder="판정 사유를 입력하세요. 사유는 운영자에게 그대로 전달됩니다."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {error ? (
                <p className="mt-4 text-12 text-danger">{error}</p>
              ) : null}

              <div className="mt-5 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    window.localStorage.setItem(
                      `review-draft:${selected.id}`,
                      note,
                    );
                    setSaved(true);
                  }}
                >
                  임시 저장
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !verdict}
                  onClick={() =>
                    void decide(verdict === "approve" ? "approve" : "revise")
                  }
                >
                  판정 제출
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  href="/admin/expert-review"
                >
                  외부 전문가 이관
                </Button>
              </div>
              {saved ? (
                <p className="mt-3 text-11 text-brand">✓ 임시 저장됨</p>
              ) : null}

              <p className="mt-4 text-11 text-muted">
                통과 처리한 단계만 집행 API가 받아들입니다.
              </p>
            </Card>
          ) : null}
        </div>
      )}
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-surface py-3 last:border-b-0">
      <span className="shrink-0 text-12 text-muted">{label}</span>
      <span className="text-right text-12 text-ink">{value}</span>
    </div>
  );
}
