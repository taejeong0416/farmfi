"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  PanelShell,
  ProgressBar,
} from "@/components/ui";
import { patchApplication, useOperatorApplication } from "../api";
import { ApplyStepLine } from "./ApplyStepLine";

const MODULES = [
  { seq: 1, title: "기초 교육", upTo: 40 },
  { seq: 2, title: "안전·위생", upTo: 80 },
  { seq: 3, title: "수료 확인", upTo: 100 },
];

export function ApplyEducationScreen() {
  const router = useRouter();
  const { data: application, refetch } = useOperatorApplication();
  const [busy, setBusy] = useState(false);
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

  const progress = application.educationProgress;

  async function advance(to: number) {
    setBusy(true);
    setError(null);
    try {
      await patchApplication(application!.id, { step: "education", progress: to });
      await refetch();
      if (to >= 100) router.push("/operator/apply/confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const currentModule =
    MODULES.find((m) => progress < m.upTo) ?? MODULES[MODULES.length - 1];

  return (
    <PanelShell>
      <ApplyStepLine application={application} current="education" />

      <h1 className="text-24 font-bold text-ink">
        운영에 필요한 기준부터 익혀요
      </h1>
      <p className="mt-3 text-14 leading-6 text-body">
        조건부 승인 후 필수 교육을 진행합니다. 중단한 곳부터 이어서 들을 수 있어요.
      </p>

      <div className="mt-7 grid grid-cols-3 gap-4">
        {MODULES.map((m) => {
          const done = progress >= m.upTo;
          const active = m.seq === currentModule.seq && !done;
          return (
            <div
              key={m.seq}
              className={`rounded-14 border px-5 py-5 ${
                done || active ? "border-brand bg-brand-soft" : "border-line bg-white"
              }`}
            >
              <p className="text-15 font-bold text-ink">
                {m.seq} {m.title}
              </p>
              <p
                className={`mt-2 text-13 ${done ? "text-brand" : "text-muted"}`}
              >
                {done ? "완료" : active ? "진행 중" : "예정"}
              </p>
            </div>
          );
        })}
      </div>

      <Card className="mt-4 rounded-14">
        <h2 className="text-17 font-bold text-ink">{currentModule.title}</h2>
        <div className="mt-4">
          <ProgressBar value={progress} label={`진도 ${progress}%`} height={8} />
        </div>
        <p className="mt-4 text-13 text-muted">
          중단한 곳부터 이어서 볼 수 있어요. 퀴즈를 통과하면 자동으로 수료 처리됩니다.
        </p>

        {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

        <div className="mt-5 space-y-3">
          <Button
            full
            disabled={busy || progress >= 100}
            onClick={() => void advance(Math.min(100, currentModule.upTo))}
          >
            {progress >= 100 ? "수료 완료" : busy ? "저장 중" : "교육 이어보기"}
          </Button>
          {progress >= 100 ? (
            <Button full variant="secondary" href="/operator/apply/confirm">
              공간 확정으로
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="mt-6">
        <Button full variant="ghost" href="/operator">
          저장하고 나가기
        </Button>
      </div>
    </PanelShell>
  );
}
