"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Field,
  Select,
  SkeletonBlock,
  TextInput,
} from "@/components/ui";
import { getJson, useProjects, won } from "../api";
import { AdminShell } from "./AdminShell";

type RuleResponse = {
  projectId: string;
  projectName: string;
  rule: {
    experienceFeeRate: number;
    b2bFeeRate: number;
    deficitInvestorShare: number;
    surplusInvestorShare: number;
    monthlyPlatformFee: number;
    breakEvenRevenue: number;
  };
  landlordRent: { name: string; monthlyRent: number } | null;
};

const FIELDS: {
  key: keyof RuleResponse["rule"];
  label: string;
  note: string;
  kind: "rate" | "amount";
}[] = [
  {
    key: "deficitInvestorShare",
    label: "적자 구간 투자자 배분율",
    note: "손익분기 아래에서 투자자에게 돌아가는 비율",
    kind: "rate",
  },
  {
    key: "surplusInvestorShare",
    label: "흑자 구간 투자자 배분율",
    note: "손익분기 위에서 투자자에게 돌아가는 비율",
    kind: "rate",
  },
  {
    key: "experienceFeeRate",
    label: "체험 중개 수수료율",
    note: "체험 매출에서 떼는 비율",
    kind: "rate",
  },
  {
    key: "b2bFeeRate",
    label: "B2B 성사 수수료율",
    note: "B2B 납품 매출에서 떼는 비율",
    kind: "rate",
  },
  {
    key: "monthlyPlatformFee",
    label: "월 플랫폼 이용료",
    note: "매출에서 먼저 반영",
    kind: "amount",
  },
  {
    key: "breakEvenRevenue",
    label: "흑자 전환 기준 매출",
    note: "이 값을 넘으면 흑자 구간 배분율을 적용",
    kind: "amount",
  },
];

export function SettlementRulesScreen() {
  const { data: projects } = useProjects();
  const [projectId, setProjectId] = useState<string>("");

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["settlement-rule", projectId],
    queryFn: () =>
      getJson<RuleResponse>(`/api/projects/${projectId}/settlement-rule`),
    enabled: Boolean(projectId),
  });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = data.rule[f.key];
      next[f.key] = f.kind === "rate" ? String(Math.round(v * 100)) : String(v);
    }
    setDraft(next);
  }, [data]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, number> = {};
      for (const f of FIELDS) {
        const raw = Number((draft[f.key] ?? "").replace(/[^\d.]/g, ""));
        if (!Number.isFinite(raw)) continue;
        body[f.key] = f.kind === "rate" ? raw / 100 : Math.round(raw);
      }
      const res = await fetch(`/api/projects/${projectId}/settlement-rule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? "저장에 실패했습니다.");
      }
      await refetch();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="정산에 적용할 규칙을 설정해요"
      desc={data ? `${data.projectName} · 다음 정산부터 적용` : "프로젝트를 고르세요"}
      action={
        <Button disabled={busy || !projectId} onClick={save}>
          {busy ? "저장 중" : "규칙 저장"}
        </Button>
      }
    >
      <div className="mb-5 max-w-[320px]">
        <Field label="프로젝트">
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error ? <p className="mb-4 text-12 text-danger">{error}</p> : null}
      {saved ? <p className="mb-4 text-12 text-brand">저장했습니다.</p> : null}

      {isLoading || !data ? (
        <SkeletonBlock height={320} />
      ) : (
        <>
          <Card padded={false}>
            <div className="grid grid-cols-[1fr_200px_1fr] border-b border-line bg-surface px-6 py-3">
              <span className="text-11 text-muted">항목</span>
              <span className="text-right text-12 text-muted">비율 · 금액</span>
              <span className="pl-6 text-11 text-muted">비고</span>
            </div>
            {FIELDS.map((f) => (
              <div
                key={f.key}
                className="grid grid-cols-[1fr_200px_1fr] items-center gap-3 border-b border-surface px-6 py-3 last:border-b-0"
              >
                <span className="text-13 text-ink">{f.label}</span>
                <div className="flex items-center gap-2">
                  <TextInput
                    className="text-right"
                    inputMode="numeric"
                    value={draft[f.key] ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                  <span className="shrink-0 text-12 text-muted">
                    {f.kind === "rate" ? "%" : "원"}
                  </span>
                </div>
                <span className="pl-6 text-12 text-muted">{f.note}</span>
              </div>
            ))}
          </Card>

          {data.landlordRent ? (
            <Card className="mt-5">
              <p className="text-14 font-bold text-ink">임대료</p>
              <p className="mt-2 text-12 text-muted">
                {data.landlordRent.name} · 월{" "}
                {won(data.landlordRent.monthlyRent)} · 매출에서 먼저 반영됩니다.
              </p>
            </Card>
          ) : null}

          <p className="mt-5 text-12 text-muted">
            규칙을 바꾸면 다음 정산 회차부터 적용됩니다. 이미 확정된 회차는 그대로 둡니다.
          </p>
        </>
      )}
    </AdminShell>
  );
}
