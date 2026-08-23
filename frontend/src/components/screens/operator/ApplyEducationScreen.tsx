"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  PanelShell,
  ProgressBar,
  SkeletonBlock,
} from "@/components/ui";
import {
  saveCourseProgress,
  useOperatorApplication,
  useOperatorCourses,
  type OperatorCourse,
} from "../api";
import { ApplyStepLine } from "./ApplyStepLine";

/** 이어보기 한 번에 나아가는 분량. 재생 대신 이 단위로 진도를 남긴다. */
const STEP_PERCENT = 25;

function minutes(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ApplyEducationScreen() {
  const router = useRouter();
  const { data: application } = useOperatorApplication();
  const { data, isLoading, refetch } = useOperatorCourses();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!application) {
    return (
      <PanelShell>
        <EmptyState
          title="진행 중인 신청이 없습니다"
          desc="자격·서류 신청을 먼저 마쳐 주세요."
          action={<Button href="/operator/apply">신청 시작</Button>}
        />
      </PanelShell>
    );
  }

  if (isLoading || !data) {
    return (
      <PanelShell>
        <SkeletonBlock height={420} />
      </PanelShell>
    );
  }

  const { courses, educationProgress } = data;
  // 아직 안 끝난 첫 과정이 지금 들을 것. 다 끝났으면 마지막 과정을 보여준다.
  const current =
    courses.find((c) => c.progress < 100) ?? courses[courses.length - 1];
  const allDone = courses.length > 0 && courses.every((c) => c.progress >= 100);

  async function advance(course: OperatorCourse) {
    setBusy(course.id);
    setError(null);
    try {
      const next = Math.min(100, course.progress + STEP_PERCENT);
      const position = Math.round((next / 100) * course.durationSec);
      const res = await saveCourseProgress(course.id, next, position);
      await refetch();
      if (res.education.done) router.push("/operator/apply/confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PanelShell>
      <ApplyStepLine application={application} current="education" />

      <h1 className="text-24 font-bold text-ink">
        운영에 필요한 기준부터 익혀요
      </h1>
      <p className="mt-3 text-14 leading-6 text-body">
        조건부 승인 후 필수 교육을 진행합니다. 멈춘 지점이 과정마다 저장돼 거기서 이어볼 수 있어요.
      </p>

      <Card className="mt-7 rounded-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-17 font-bold text-ink">전체 진도</h2>
          <span className="font-num text-15 font-medium text-brand">
            {educationProgress}%
          </span>
        </div>
        <div className="mt-4">
          <ProgressBar value={educationProgress} height={8} />
        </div>
        <p className="mt-3 text-12 text-muted">
          과정마다 비중이 달라 전체 진도는 비중을 반영해 계산합니다.
        </p>
      </Card>

      <div className="mt-4 space-y-3">
        {courses.map((c) => {
          const done = c.progress >= 100;
          const active = c.id === current?.id && !done;
          return (
            <Card
              key={c.id}
              className={`rounded-10 ${active ? "border-brand" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-15 font-bold text-ink">
                    {c.seq} {c.title}
                  </p>
                  <p className="mt-1 text-13 text-muted">{c.summary}</p>
                </div>
                <span
                  className={`shrink-0 text-13 font-medium ${done ? "text-brand" : "text-muted"}`}
                >
                  {done ? "수료" : active ? "진행 중" : "예정"}
                </span>
              </div>

              <div className="mt-4">
                <ProgressBar value={c.progress} height={6} />
              </div>
              <p className="mt-2 text-12 text-muted">
                {done
                  ? `전체 ${minutes(c.durationSec)} 시청 완료`
                  : `${minutes(c.lastPositionSec)} / ${minutes(c.durationSec)} 지점에서 멈췄어요`}
              </p>

              {!done ? (
                <div className="mt-4">
                  <Button
                    full
                    disabled={busy !== null}
                    onClick={() => void advance(c)}
                  >
                    {busy === c.id
                      ? "저장 중"
                      : c.progress > 0
                        ? "이어보기"
                        : "교육 시작"}
                  </Button>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-6 space-y-3">
        {allDone ? (
          <Button full href="/operator/apply/confirm">
            공간 확정으로
          </Button>
        ) : null}
        <Button full variant="ghost" href="/operator">
          저장하고 나가기
        </Button>
      </div>
    </PanelShell>
  );
}
