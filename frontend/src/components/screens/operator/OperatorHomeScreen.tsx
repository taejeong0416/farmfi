"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState,
  ProgressBar,
  Shell,
  SkeletonBlock,
  StepList,
} from "@/components/ui";
import { useAuth } from "@/lib/useAuth";
import {
  MILESTONE_STATUS_LABEL,
  getJson,
  milestoneTone,
  shortDate,
  useOperatorApplication,
  won,
} from "../api";

type OperatorMilestone = {
  id: string;
  seq: number;
  name: string;
  status: string;
  releaseAmount: number;
  evidenceSubmittedAt: string | null;
  project: { id: string; name: string; location: string | null };
};

export function OperatorHomeScreen() {
  const { user } = useAuth();
  const { data: application, isLoading } = useOperatorApplication();
  const { data: milestones } = useQuery({
    queryKey: ["milestones", "operator"],
    queryFn: () => getJson<{ milestones: OperatorMilestone[] }>("/api/milestones"),
    select: (d) => d.milestones,
    retry: false,
  });

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={420} />
      </Shell>
    );
  }

  if (!application) {
    return (
      <Shell>
        <EmptyState
          title="아직 운영 신청이 없습니다"
          desc="운영 가능한 공간을 먼저 살펴보세요."
          action={<Button href="/operator/spaces">공간 둘러보기</Button>}
        />
      </Shell>
    );
  }

  const steps = [
    {
      title: "본인 · 운영 자격 확인",
      desc: user?.identityVerified
        ? "신원과 운영 가능 여부가 확인됐어요"
        : "본인확인이 필요합니다",
      done: Boolean(user?.identityVerified && application.documents.length > 0),
      href: "/operator/apply",
    },
    {
      title: "현장 방문",
      desc: application.visitAt
        ? `${shortDate(application.visitAt)} 방문 예약`
        : "방문 일정을 잡아 주세요",
      done: Boolean(application.visitAt),
      href: "/operator/apply/visit",
    },
    {
      title: "필수 교육 수료",
      desc: `온라인 교육 ${application.educationProgress}% 수강`,
      done: Boolean(application.educationDoneAt),
      href: "/operator/apply/education",
    },
    {
      title: "공간 최종 확정",
      desc: application.confirmedAt
        ? `${shortDate(application.confirmedAt)} 확정`
        : "교육 수료 후 확정할 수 있어요",
      done: Boolean(application.confirmedAt),
      href: "/operator/apply/confirm",
    },
    {
      title: "운영 계약 서명",
      desc: application.contractSignedAt
        ? "최종 배정된 공간과 조건으로 서명했어요"
        : "계약서를 확인하고 서명해 주세요",
      done: Boolean(application.contractSignedAt),
      href: "/operator/apply/contract",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);
  const next = steps.find((s) => !s.done);

  return (
    <Shell>
      <h1 className="text-28 font-bold text-ink">
        {next ? `개점까지 ${steps.length - doneCount}단계 남았어요` : "개점 준비가 끝났어요"}
      </h1>
      <p className="mt-3 text-14 text-body">
        {application.region} · 신청 {shortDate(application.createdAt)}
      </p>

      <div className="mt-7 flex items-start gap-8">
        <div className="flex-1">
          <div className="rounded-12 bg-brand px-7 py-7">
            <p className="text-13 font-medium text-brand-soft">전체 준비도</p>
            <p className="mt-2 font-num text-3xl font-bold text-white">
              {progress}%
            </p>
            <p className="mt-3 text-11 text-brand-soft">
              {application.certificateNo
                ? "보증서가 발급됐어요. 이제 공간과 설비 준비를 마치면 운영을 시작할 수 있어요."
                : "남은 단계를 마치면 보증서가 발급됩니다."}
            </p>
          </div>

          <h2 className="mt-8 text-20 font-semibold text-ink">내가 준비할 것</h2>
          <Card className="mt-4" padded={false}>
            <div className="px-6">
              <StepList
                items={steps.map((s) => ({
                  title: s.title,
                  desc: s.desc,
                  state: s.done ? "done" : s === next ? "current" : "todo",
                  right: (
                    <Link
                      href={s.href}
                      className="text-12 font-medium text-brand"
                    >
                      {s.done ? "보기" : "이어하기"}
                    </Link>
                  ),
                }))}
              />
            </div>
          </Card>

          {(milestones ?? []).length > 0 ? (
            <>
              <h2 className="mt-8 text-20 font-bold text-ink">마일스톤 증빙</h2>
              <Card className="mt-4" padded={false}>
                <div className="px-6">
                  {(milestones ?? []).map((m) => {
                    const tone = milestoneTone(m.status);
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-4 border-b border-surface py-4 last:border-b-0"
                      >
                        <span className="flex-1 text-14 text-ink">
                          {m.project.name} · {m.seq}단계 {m.name}
                        </span>
                        <span
                          className={`w-[90px] text-12 ${
                            tone === "pass"
                              ? "font-medium text-brand"
                              : tone === "fail"
                                ? "font-medium text-danger"
                                : "text-body"
                          }`}
                        >
                          {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
                        </span>
                        <span className="w-[110px] text-right font-num text-13 text-ink">
                          {won(m.releaseAmount)}
                        </span>
                        <Link
                          href={`/operator/milestones/${m.id}/evidence`}
                          className="w-[70px] text-right text-12 font-medium text-brand"
                        >
                          증빙 제출
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          ) : null}
        </div>

        <div className="w-[360px] shrink-0 space-y-6">
          <Card>
            <h2 className="text-15 font-semibold text-ink">지금 할 일</h2>
            {next ? (
              <>
                <p className="mt-4 text-17 font-bold text-ink">{next.title}</p>
                <p className="mt-2 text-12 text-muted">{next.desc}</p>
                <div className="mt-5">
                  <Button full href={next.href}>
                    이어서 하기
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-13 text-muted">
                  준비 단계를 모두 마쳤습니다. 보증서로 운영자 앱에 로그인하세요.
                </p>
                <div className="mt-5">
                  <Button full href="/operator/certificate">
                    보증서 보기
                  </Button>
                </div>
              </>
            )}
          </Card>

          <Card>
            <h2 className="text-20 font-semibold text-ink">공간 준비 현황</h2>
            <div className="mt-4">
              <ProgressBar value={progress} label={`준비도 ${progress}%`} />
            </div>
            <p className="mt-4 text-12 text-muted">
              단계가 끝날 때마다 담당 매니저가 확인 결과를 알려드려요.
            </p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
