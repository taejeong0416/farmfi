"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState,
  PanelShell,
  Shell,
  SkeletonBlock,
  TextArea,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { MILESTONE_STATUS_LABEL, getJson, postJson, won } from "../api";

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

type AppealComment = {
  id: string;
  authorRole: string;
  body: string;
  attachmentUrl: string | null;
  createdAt: string;
};

type AppealDetail = {
  id: string;
  reason: string;
  status: string;
  decision: string | null;
  decidedAt: string | null;
  createdAt: string;
  comments: AppealComment[];
};

const ROLE_LABEL: Record<string, string> = {
  operator: "운영자",
  admin: "플랫폼 운영팀",
  auditor: "외부 전문가",
};

export function AppealScreen({ milestoneId }: { milestoneId: string }) {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: verification } = useQuery({
    queryKey: ["milestone-verification", milestoneId],
    queryFn: () =>
      getJson<{ items: { signal: string; label: string; verdict: string }[] }>(
        `/api/milestones/${milestoneId}/verification`,
      ),
    select: (d) => d.items,
    enabled: Boolean(milestoneId),
    retry: false,
  });

  const { data: milestone, isLoading } = useQuery({
    queryKey: ["milestone", milestoneId],
    queryFn: () =>
      getJson<{ milestone: MilestoneDetail }>(`/api/milestones/${milestoneId}`),
    select: (d) => d.milestone,
  });

  // 이미 접수된 건이 있으면 스레드를 이어서 보여준다.
  const { data: appealId } = useQuery({
    queryKey: ["appeals", milestoneId],
    queryFn: () =>
      getJson<{ appeals: { id: string }[] }>(
        `/api/appeals?milestoneId=${milestoneId}`,
      ),
    select: (d) => d.appeals[0]?.id ?? null,
  });

  const { data: appeal } = useQuery({
    queryKey: ["appeal", appealId],
    enabled: !!appealId,
    queryFn: () => getJson<{ appeal: AppealDetail }>(`/api/appeals/${appealId}`),
    select: (d) => d.appeal,
  });

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (isLoading || !milestone) {
    return (
      <Shell>
        <SkeletonBlock height={420} />
      </Shell>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (appealId) {
        await postJson(`/api/appeals/${appealId}/comments`, { body: text.trim() });
        setText("");
        await qc.invalidateQueries({ queryKey: ["appeal", appealId] });
      } else {
        await postJson(`/api/milestones/${milestoneId}/appeals`, {
          reason: text.trim(),
        });
        setDone(true);
      }
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
    <Shell>
      <p className="text-12 text-muted">{milestone.project.name}</p>
      <div className="mt-2 flex items-end justify-between gap-6">
        <h1 className="text-24 font-bold text-ink">
          {milestone.seq}단계 {milestone.name} 증빙 이의제기
        </h1>
        <div className="flex gap-2">
          <Button variant="ghost" href={`/operator/milestones/${milestoneId}/evidence`}>
            증빙 다시 제출
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !text.trim()}
            onClick={() => {
              window.localStorage.setItem(`appeal-draft:${milestoneId}`, text);
              setSaved(true);
            }}
          >
            임시 저장
          </Button>
          <Button disabled={busy || !text.trim()} onClick={submit}>
            {busy ? "보내는 중" : appealId ? "코멘트 남기기" : "이의제기 접수"}
          </Button>
        </div>
      </div>

      <div className="mt-7 flex items-start gap-8">
        <div className="w-[300px] shrink-0 space-y-4">
          <div>
            <p className="text-18 font-bold text-ink">필수 증빙</p>
            <Card className="mt-3.5" padded={false}>
              <div className="px-4">
                {(verification ?? []).length === 0 ? (
                  <p className="py-6 text-center text-12 text-muted">
                    판정된 항목이 없습니다.
                  </p>
                ) : (
                  (verification ?? []).map((v) => {
                    const idle = v.verdict === "undecided";
                    const bad = v.verdict === "unmet";
                    const label = bad
                      ? "보완 요청"
                      : idle
                        ? v.signal === "iot"
                          ? "연동 대기"
                          : "판정 전"
                        : "제출완료";
                    return (
                      <div
                        key={v.signal}
                        className="flex items-center justify-between border-b border-surface py-3 last:border-b-0"
                      >
                        <span
                          className={`text-12 ${idle ? "text-body" : "text-ink"}`}
                        >
                          {v.label}
                        </span>
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-[7px] w-[7px] rounded-full ${
                              bad ? "bg-danger" : idle ? "bg-muted" : "bg-brand"
                            }`}
                          />
                          <span
                            className={`text-11 font-medium ${
                              bad ? "text-danger" : idle ? "text-muted" : "text-brand"
                            }`}
                          >
                            {label}
                          </span>
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          <Card>
            <p className="text-14 font-bold text-ink">보완 요청 사유</p>
            <p className="mt-3 text-12 leading-5 text-body">
              {milestone.reviewNote ?? "기록된 보완 요청 사유가 없습니다."}
            </p>
            {milestone.evidenceSubmittedAt ? (
              <p className="mt-3 text-12 text-muted">
                {formatDate(milestone.evidenceSubmittedAt)}
              </p>
            ) : null}
          </Card>

          <Card>
            <p className="text-14 font-bold text-ink">제출 이력</p>
            <div className="mt-4 space-y-3">
              <HistoryRow
                label="1차 제출"
                at={milestone.evidenceSubmittedAt}
              />
              <HistoryRow label="보완 요청 접수" at={appeal?.createdAt ?? null} />
            </div>
          </Card>

          <Card>
            <p className="text-14 font-bold text-ink">단계 정보</p>
            <div className="mt-4 space-y-3">
              <HistoryRow
                label="현재 상태"
                text={MILESTONE_STATUS_LABEL[milestone.status] ?? milestone.status}
              />
              <HistoryRow label="집행 예정액" text={won(milestone.releaseAmount)} />
            </div>
          </Card>
        </div>

        <div className="flex-1 space-y-4">
          <Card padded={false}>
            <div className="px-5 py-4">
              <p className="text-11 font-medium text-danger">
                판정 : {appeal?.decision ?? "보류 유지"} ·{" "}
                {appeal?.decidedAt ? "외부 전문가 판정" : "운영팀 재검증"}
              </p>
              <p className="mt-2 text-12 text-muted">
                {milestone.reviewNote ??
                  "아직 최종 판정이 나오지 않았습니다. 운영팀 재검증이 진행 중입니다."}
              </p>
            </div>
          </Card>

          <Card>
            <p className="text-14 font-medium text-ink">코멘트 스레드</p>
            {appeal?.comments.length ? (
              <div className="mt-4 space-y-5">
                {appeal.comments.map((c) => (
                  <div key={c.id}>
                    <p className="text-12 text-muted">
                      {ROLE_LABEL[c.authorRole] ?? c.authorRole} ·{" "}
                      {formatDate(c.createdAt)}
                    </p>
                    <p className="mt-1.5 text-12 leading-5 text-ink">{c.body}</p>
                    {c.attachmentUrl ? (
                      <p className="mt-1.5 text-12 text-brand">{c.attachmentUrl}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-12 text-muted">
                아직 오간 의견이 없습니다.
              </p>
            )}

            <div className="mt-5">
              <TextArea
                placeholder="추가 설명을 입력하세요. 입력한 내용은 운영팀과 외부 전문가에게 그대로 전달됩니다."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            {saved ? (
              <p className="mt-3 text-11 text-brand">✓ 임시 저장됨</p>
            ) : null}
            {error ? <p className="mt-3 text-12 text-danger">{error}</p> : null}
            <p className="mt-3 text-12 text-muted">
              외부 전문가 최종 판정 이후에는 동일 단계에 대한 이의제기가 불가합니다.
            </p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

function HistoryRow({
  label,
  at,
  text,
}: {
  label: string;
  at?: string | null;
  text?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-12 text-muted">{label}</span>
      <span className="text-12 font-medium text-ink">
        {text ?? (at ? formatDate(at) : "—")}
      </span>
    </div>
  );
}
