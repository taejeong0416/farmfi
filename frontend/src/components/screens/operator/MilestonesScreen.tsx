"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  MILESTONE_STATUS_LABEL,
  getJson,
  milestoneTone,
  shortDate,
  won,
} from "../api";

export type OperatorMilestone = {
  id: string;
  seq: number;
  name: string;
  status: string;
  releaseAmount: number;
  evidenceSubmittedAt: string | null;
  reviewNote: string | null;
  completedAt: string | null;
  project: { id: string; name: string; location: string | null };
};

export function useOperatorMilestones() {
  return useQuery({
    queryKey: ["milestones", "operator"],
    queryFn: () => getJson<{ milestones: OperatorMilestone[] }>("/api/milestones"),
    select: (d) => d.milestones,
    retry: false,
  });
}

/** 항목별 판정. 원본은 `GET /api/milestones/[id]/verification`이다. */
type VerificationItem = {
  signal: string;
  label: string;
  autoDraft: boolean | null;
  verdict: string;
  note: string | null;
  decidedAt: string | null;
};

type Verification = {
  evidenceUrls: string[];
  milestone: {
    id: string;
    seq: number;
    name: string;
    status: string;
    conditionText: string | null;
    reviewNote: string | null;
    project: { id: string; name: string };
  };
  items: VerificationItem[];
};

type Appeal = {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
};

const VERDICT_LABEL: Record<string, string> = {
  met: "충족",
  unmet: "불충족",
  undecided: "판정 전",
};

/** `.fig` O-10 분쟁/재검증 타임라인 — 이의제기가 있으면 그 이력을 그린다. */
const APPEAL_STEPS = [
  { key: "opened", title: "운영팀 검토 시작" },
  { key: "reviewing", title: "운영팀 재검증 완료" },
  { key: "expert", title: "외부 전문가 배정" },
  { key: "decided", title: "외부 전문가 최종 판정" },
];

export function MilestonesScreen() {
  const { data, isLoading, isError } = useOperatorMilestones();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId || !data || data.length === 0) return;
    // 보완 요청이 있으면 그것부터 본다 — 지금 손댈 것이 그거다.
    const first = data.find((m) => m.status === "revision_required") ?? data[0];
    setSelectedId(first.id);
  }, [data, selectedId]);

  const { data: verification } = useQuery({
    queryKey: ["milestone-verification", selectedId],
    queryFn: () =>
      getJson<Verification>(`/api/milestones/${selectedId}/verification`),
    enabled: Boolean(selectedId),
    retry: false,
  });

  const { data: appeals } = useQuery({
    queryKey: ["appeals", selectedId],
    queryFn: () =>
      getJson<{ appeals: Appeal[] }>(`/api/appeals?milestoneId=${selectedId}`),
    select: (d) => d.appeals,
    enabled: Boolean(selectedId),
    retry: false,
  });

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={480} />
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <EmptyState
          title="마일스톤을 볼 수 없습니다"
          desc="운영자로 로그인한 뒤 다시 확인해 주세요."
          action={<Button href="/login?next=/operator/milestones">로그인</Button>}
        />
      </Shell>
    );
  }

  const list = data ?? [];
  const revision = list.filter((m) => m.status === "revision_required");
  const selected = list.find((m) => m.id === selectedId) ?? null;
  const appeal = appeals?.[0] ?? null;

  return (
    <Shell>
      <h1 className="text-22 font-bold text-ink">마일스톤 검증 현황</h1>
      <p className="mt-3 text-13 text-muted">
        제출한 증빙의 판정과 다음에 할 일을 여기서 본다.
      </p>

      {/* `.fig` O-10 ContentRow — 왼쪽 349 목록, 오른쪽 955 상세. */}
      <div className="mt-6 flex gap-8">
        <div className="w-[349px] shrink-0 space-y-8">
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-18 font-bold text-ink">
                보완 요청 {revision.length}건
              </h2>
              {revision.length > 2 ? (
                <span className="text-12 text-muted">더보기</span>
              ) : null}
            </div>
            <Card className="mt-3.5" padded={false}>
              {revision.length === 0 ? (
                <p className="px-5 py-8 text-center text-12 text-muted">
                  보완 요청이 없습니다.
                </p>
              ) : (
                <div className="px-4">
                  {revision.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className="flex w-full gap-3 border-b border-surface py-3 text-left last:border-b-0"
                    >
                      <span
                        className={`mt-1 w-[3px] shrink-0 self-stretch rounded-full ${
                          m.id === selectedId ? "bg-brand" : "bg-transparent"
                        }`}
                      />
                      <span className="flex-1">
                        <span className="block text-14 font-medium text-ink">
                          {m.project.name}
                        </span>
                        <span className="mt-1 flex items-center justify-between">
                          <span className="text-12 text-muted">
                            {m.seq}단계 {m.name} · 보완 요청
                          </span>
                          <span className="text-12 text-muted">
                            {m.evidenceSubmittedAt
                              ? formatDate(m.evidenceSubmittedAt)
                              : "-"}
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </section>

          <section>
            <h2 className="text-18 font-bold text-ink">마일스톤 현황</h2>
            <Card className="mt-3.5" padded={false}>
              {list.length === 0 ? (
                <p className="px-5 py-8 text-center text-12 text-muted">
                  맡은 마일스톤이 없습니다.
                </p>
              ) : (
                <div className="px-4">
                  {list.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className={`block w-full border-b border-surface py-3 text-left last:border-b-0 ${
                        m.id === selectedId ? "bg-surface/60" : ""
                      }`}
                    >
                      <span className="block text-12 text-body">
                        {m.project.name}
                      </span>
                      <span className="mt-1 block text-12 text-ink">
                        {m.seq}단계 {m.name} ·{" "}
                        <span
                          className={`font-medium ${
                            milestoneTone(m.status) === "pass"
                              ? "text-brand"
                              : milestoneTone(m.status) === "fail"
                                ? "text-danger"
                                : "text-body"
                          }`}
                        >
                          {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {selected ? (
              <Link
                href={`/operator/milestones/${selected.id}/evidence`}
                className="mt-4 flex h-[46px] items-center justify-center rounded-6 border border-brand text-14 font-medium text-brand hover:bg-surface"
              >
                증빙 제출하기
              </Link>
            ) : null}
          </section>

          <section>
            <h2 className="text-18 font-bold text-ink">분쟁 / 재검증 현황</h2>
            <div className="relative mt-3.5 pl-5">
              <span className="absolute bottom-2 left-[4px] top-2 w-px bg-line" />
              {appeal ? (
                APPEAL_STEPS.map((step, i) => {
                  const reached =
                    i === 0 ||
                    (i === 1 && appeal.status !== "open") ||
                    (i === 2 && appeal.status === "expert_review") ||
                    (i === 3 && Boolean(appeal.decidedAt));
                  return (
                    <div key={step.key} className="relative pb-6 last:pb-0">
                      <span
                        className={`absolute -left-5 top-1.5 h-[9px] w-[9px] rounded-full border ${
                          reached ? "border-brand bg-brand" : "border-line bg-white"
                        }`}
                      />
                      <p className="text-12 text-muted">
                        {i === 0
                          ? shortDate(appeal.createdAt)
                          : appeal.decidedAt && i === 3
                            ? shortDate(appeal.decidedAt)
                            : "—"}
                      </p>
                      <p
                        className={`mt-0.5 text-14 font-medium ${reached ? "text-ink" : "text-body"}`}
                      >
                        {step.title}
                      </p>
                      {i === 1 && appeal.decisionNote ? (
                        <p className="mt-1 text-12 text-muted">
                          재검토 결과 : {appeal.decisionNote}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="py-4 text-12 text-muted">
                  진행 중인 이의제기가 없습니다.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* 오른쪽 — 고른 단계의 판정 근거. */}
        <div className="flex-1">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-12 text-muted">{selected.project.name}</p>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <h2 className="text-24 font-bold text-ink">
                      {selected.seq}단계 {selected.name}
                    </h2>
                    <Badge tone={milestoneTone(selected.status)}>
                      {MILESTONE_STATUS_LABEL[selected.status] ?? selected.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex shrink-0 gap-3">
                  <Button href={`/operator/milestones/${selected.id}/evidence`}>
                    재제출하기
                  </Button>
                  <Button
                    variant="secondary"
                    href={`/operator/milestones/${selected.id}/appeal`}
                  >
                    이의제기하기
                  </Button>
                </div>
              </div>

              <p className="mt-4 text-12 leading-5 text-muted">
                {selected.reviewNote ??
                  verification?.milestone.conditionText ??
                  "판정 결과가 등록되면 여기에 사유가 표시됩니다."}
              </p>

              <h3 className="mt-6 text-18 font-bold text-ink">
                판정 항목 ({verification?.items.length ?? 0}건)
              </h3>
              <Card className="mt-3.5" padded={false}>
                <div className="grid grid-cols-[1fr_160px_120px] border-b border-line-soft px-6 py-3 text-12 text-muted">
                  <span>항목</span>
                  <span>근거</span>
                  <span>판정</span>
                </div>
                <div className="px-6">
                  {(verification?.items ?? []).length === 0 ? (
                    <p className="py-10 text-center text-12 text-muted">
                      아직 판정된 항목이 없습니다.
                    </p>
                  ) : (
                    (verification?.items ?? []).map((it) => (
                      <div
                        key={it.signal}
                        className="grid grid-cols-[1fr_160px_120px] items-center border-b border-surface py-3.5 last:border-b-0"
                      >
                        <span className="text-13 text-ink">{it.label}</span>
                        <span className="text-12 text-body">
                          {it.note ?? (it.autoDraft == null ? "—" : "자동 검증")}
                        </span>
                        <span
                          className={`text-12 font-medium ${
                            it.verdict === "met"
                              ? "text-brand"
                              : it.verdict === "unmet"
                                ? "text-danger"
                                : "text-muted"
                          }`}
                        >
                          {VERDICT_LABEL[it.verdict] ?? it.verdict}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* `.fig` O-10 현장 신호 요약 — 항목마다 충족 여부와 무엇이 판단했는지. */}
              <h3 className="mt-8 text-18 font-bold text-ink">현장 신호 요약</h3>
              <Card className="mt-3.5" padded={false}>
                <div className="px-6">
                  {(verification?.items ?? []).length === 0 ? (
                    <p className="py-8 text-center text-12 text-muted">
                      아직 판정된 신호가 없습니다.
                    </p>
                  ) : (
                    (verification?.items ?? []).map((it) => (
                      <div
                        key={`sig-${it.signal}`}
                        className="grid grid-cols-3 items-center border-b border-surface py-3 last:border-b-0"
                      >
                        <span className="text-13 text-ink">{it.label}</span>
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-[7px] w-[7px] rounded-full ${
                              it.verdict === "met"
                                ? "bg-brand"
                                : it.verdict === "unmet"
                                  ? "bg-danger"
                                  : "bg-muted"
                            }`}
                          />
                          <span
                            className={`text-12 ${
                              it.verdict === "met"
                                ? "text-brand"
                                : it.verdict === "unmet"
                                  ? "text-danger"
                                  : "text-muted"
                            }`}
                          >
                            {it.verdict === "met"
                              ? "충족"
                              : it.verdict === "unmet"
                                ? "미충족"
                                : "판정 전"}
                          </span>
                        </span>
                        <span className="text-12 text-muted">
                          {it.decidedAt
                            ? "사람이 확인"
                            : it.autoDraft == null
                              ? "자동 검증 전"
                              : "자동 검증 초안"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <h3 className="mt-8 text-18 font-bold text-ink">제출된 증빙</h3>
              <Card className="mt-3.5" padded={false}>
                <div className="px-6">
                  {(verification?.evidenceUrls ?? []).length === 0 ? (
                    <p className="py-8 text-center text-12 text-muted">
                      올라온 증빙이 없습니다.
                    </p>
                  ) : (
                    (verification?.evidenceUrls ?? []).map((u) => (
                      <a
                        key={u}
                        href={u}
                        className="flex items-center justify-between border-b border-surface py-3 text-13 text-brand last:border-b-0"
                      >
                        {decodeURIComponent(u.split("/").pop() ?? u)}
                        <span className="text-12 text-muted">열기</span>
                      </a>
                    ))
                  )}
                </div>
              </Card>

              <p className="mt-4 text-12 text-muted">
                집행 예정액 {won(selected.releaseAmount)} · 제출{" "}
                {selected.evidenceSubmittedAt
                  ? formatDate(selected.evidenceSubmittedAt)
                  : "없음"}
              </p>
            </>
          ) : (
            <EmptyState
              title="맡은 마일스톤이 없습니다"
              desc="배정된 지점의 단계가 열리면 여기에 나옵니다."
            />
          )}
        </div>
      </div>
    </Shell>
  );
}
