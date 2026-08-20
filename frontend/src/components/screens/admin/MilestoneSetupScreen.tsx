"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  SkeletonBlock,
  TextInput,
} from "@/components/ui";
import {
  MILESTONE_STATUS_LABEL,
  milestoneTone,
  num,
  useProject,
  won,
} from "../api";
import { AdminShell } from "./AdminShell";

const SIGNAL_LABEL: Record<string, string> = {
  contract: "계약서",
  receipt: "영수증",
  photo: "현장사진",
  iot: "센서",
};

async function patchMilestone(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/milestones/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "저장에 실패했습니다.");
  }
}

export function MilestoneSetupScreen({ projectId }: { projectId: string }) {
  const { data: project, isLoading, refetch } = useProject(projectId);
  const queryClient = useQueryClient();

  const [drafts, setDrafts] = useState<Record<string, { name: string; amount: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!project) return;
    const next: Record<string, { name: string; amount: string }> = {};
    for (const m of project.milestones) {
      next[m.id] = { name: m.name, amount: String(m.releaseAmount) };
    }
    setDrafts(next);
  }, [project]);

  if (isLoading || !project) {
    return (
      <AdminShell title="마일스톤 설정">
        <SkeletonBlock height={360} />
      </AdminShell>
    );
  }

  const milestones = [...project.milestones].sort((a, b) => a.seq - b.seq);
  const total = milestones.reduce((s, m) => s + m.releaseAmount, 0);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      for (const m of milestones) {
        if (m.status === "completed") continue;
        const d = drafts[m.id];
        if (!d) continue;
        const amount = Number(d.amount.replace(/\D/g, ""));
        if (d.name === m.name && amount === m.releaseAmount) continue;
        await patchMilestone(m.id, { name: d.name, releaseAmount: amount });
      }
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="마일스톤 설정"
      desc={`${project.name} · 총 ${milestones.length}단계 · 집행 합계 ${won(total)}`}
      action={
        <Button disabled={busy} onClick={save}>
          {busy ? "저장 중" : "저장"}
        </Button>
      }
    >
      {error ? <p className="mb-4 text-12 text-danger">{error}</p> : null}
      {saved ? <p className="mb-4 text-12 text-brand">저장했습니다.</p> : null}

      <Card padded={false}>
        <div className="grid grid-cols-[60px_1fr_200px_220px_110px] border-b border-line bg-surface px-5 py-3">
          <span className="text-11 text-muted">순서</span>
          <span className="text-11 text-muted">단계명</span>
          <span className="text-right text-11 text-muted">집행 금액</span>
          <span className="text-11 text-muted">필수 증빙</span>
          <span className="text-right text-11 text-muted">상태</span>
        </div>

        {milestones.map((m) => {
          const locked = m.status === "completed";
          const d = drafts[m.id] ?? { name: m.name, amount: String(m.releaseAmount) };
          const tone = milestoneTone(m.status);
          return (
            <div
              key={m.id}
              className="grid grid-cols-[60px_1fr_200px_220px_110px] items-center gap-3 border-b border-surface px-5 py-3 last:border-b-0"
            >
              <span className="font-num text-13 text-ink">{m.seq}</span>
              <TextInput
                value={d.name}
                disabled={locked}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [m.id]: { ...d, name: e.target.value },
                  }))
                }
              />
              <TextInput
                className="text-right"
                inputMode="numeric"
                disabled={locked}
                value={num(Number(d.amount.replace(/\D/g, "")))}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [m.id]: { ...d, amount: e.target.value },
                  }))
                }
              />
              <span className="text-12 text-body">
                {m.requiredSignals
                  .map((s) => SIGNAL_LABEL[s] ?? s)
                  .join(" · ") || "-"}
              </span>
              <span className="flex justify-end">
                <Badge tone={tone}>
                  {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
                </Badge>
              </span>
            </div>
          );
        })}
      </Card>

      <p className="mt-5 text-12 text-muted">
        집행이 끝난 단계는 수정할 수 없습니다. 이미 나간 자금의 근거이기 때문입니다.
      </p>
    </AdminShell>
  );
}
