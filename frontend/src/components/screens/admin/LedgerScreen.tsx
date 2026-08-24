"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  DataTable,
  Field,
  Select,
  SkeletonBlock,
  TextInput,
  type Column,
} from "@/components/ui";
import { getJson, num, putJson, postJson, shortDate, useProjects, won } from "../api";
import { AdminShell } from "./AdminShell";

type SalesResponse = {
  periodDays: number;
  dataAsOf: string | null;
  summary: { totalAmount: number; totalQuantity: number; orderCount: number };
  daily: { date: string; amount: number; quantity: number; orderCount: number }[];
  recent: {
    id: string;
    soldAt: string;
    productName: string;
    unit: string;
    quantity: number;
    amount: number;
  }[];
};

type CostLine = { id: string; label: string; amount: string };

type PeriodRecord = {
  id: string;
  period: string;
  revenue: number;
  costs: { label: string; amount: number }[];
  totalCost: number;
  status: string;
  confirmNote: string | null;
  confirmedAt: string | null;
};

type RecordsResponse = {
  period: string;
  record: PeriodRecord | null;
  salesTotal: number;
  editable: boolean;
};

function thisPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 임대료는 여기 없다. 파트너 계약(ProjectPartner)의 월 고정 임대료가 지급 원장에서
// 따로 빠지므로, 여기 또 적으면 운영자 몫에서 두 번 차감된다.
const DEFAULT_COSTS: CostLine[] = [
  { id: "labor", label: "인건비", amount: "" },
  { id: "utility", label: "전력 · 수도", amount: "" },
  { id: "supply", label: "자재 · 소모품", amount: "" },
  { id: "etc", label: "기타 운영비", amount: "" },
];

export function LedgerScreen() {
  const { data: projects } = useProjects();
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const { data, isLoading } = useQuery({
    queryKey: ["sales", projectId],
    queryFn: () =>
      getJson<SalesResponse>(`/api/sales?projectId=${projectId}&days=90`),
    enabled: Boolean(projectId),
    retry: false,
  });

  const qc = useQueryClient();
  const [period, setPeriod] = useState(thisPeriod());
  const [costs, setCosts] = useState<CostLine[]>(DEFAULT_COSTS);
  const [revenueInput, setRevenueInput] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // 저장된 기간 입력값. 없으면 판매 기록 합계를 매출 초안으로 얹어 준다.
  const { data: records } = useQuery({
    queryKey: ["period-records", projectId, period],
    queryFn: () =>
      getJson<RecordsResponse>(
        `/api/admin/projects/${projectId}/records?period=${period}`,
      ),
    enabled: Boolean(projectId),
    retry: false,
  });

  // 기간이나 프로젝트가 바뀌면 서버 값으로 화면을 다시 채운다.
  useEffect(() => {
    if (!records) return;
    const r = records.record;
    setRevenueInput(String(r ? r.revenue : records.salesTotal));
    setCosts(
      r && r.costs.length > 0
        ? r.costs.map((c, i) => ({ id: `c-${i}`, label: c.label, amount: String(c.amount) }))
        : DEFAULT_COSTS,
    );
    setNote(r?.confirmNote ?? "");
    setMsg(null);
  }, [records]);

  const confirmed = records?.record?.status === "confirmed";
  const revenue = Number(revenueInput.replace(/\D/g, "") || 0);
  const totalCost = costs.reduce(
    (s, c) => s + Number(c.amount.replace(/\D/g, "") || 0),
    0,
  );
  const distributable = Math.max(0, revenue - totalCost);

  const payload = () => ({
    period,
    revenue,
    costs: costs
      .filter((c) => c.label.trim())
      .map((c) => ({ label: c.label, amount: Number(c.amount.replace(/\D/g, "") || 0) })),
  });

  const save = useMutation({
    mutationFn: () => putJson(`/api/admin/projects/${projectId}/records`, payload()),
    onSuccess: () => {
      setMsg("저장했습니다. 확정해야 정산에 들어갑니다.");
      qc.invalidateQueries({ queryKey: ["period-records"] });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "저장에 실패했습니다."),
  });

  const confirm = useMutation({
    mutationFn: async (undo?: boolean) => {
      if (!undo) await putJson(`/api/admin/projects/${projectId}/records`, payload());
      return postJson(`/api/admin/projects/${projectId}/records/confirm`, {
        period,
        note,
        ...(undo ? { undo: true } : {}),
      });
    },
    onSuccess: (_r, undo) => {
      setMsg(undo ? "확정을 해제했습니다." : "확정했습니다. 이제 정산 계산에 들어갑니다.");
      qc.invalidateQueries({ queryKey: ["period-records"] });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "처리에 실패했습니다."),
  });

  const salesColumns: Column<SalesResponse["recent"][number]>[] = [
    {
      key: "soldAt",
      header: "일자",
      width: "120px",
      render: (r) => (
        <span className="text-12 text-muted">{shortDate(r.soldAt)}</span>
      ),
    },
    { key: "product", header: "품목", render: (r) => r.productName },
    {
      key: "qty",
      header: "수량",
      align: "right",
      width: "100px",
      render: (r) => (
        <span className="font-num text-13">
          {r.quantity}
          {r.unit}
        </span>
      ),
    },
    {
      key: "amount",
      header: "금액",
      align: "right",
      width: "140px",
      render: (r) => (
        <span className="font-num text-14 font-medium">{won(r.amount)}</span>
      ),
    },
  ];

  return (
    <AdminShell
      title="이번 기간의 매출과 비용을 입력해요"
      desc="입력값을 저장하면 정산 규칙에 따라 정산 결과가 자동 산출됩니다. 입력 · 수정 이력은 감사 로그에 기록됩니다."
      action={
        <div className="flex items-center gap-2">
          <span className="text-12 text-muted">
            기준일 {data?.dataAsOf ? shortDate(data.dataAsOf) : "-"}
          </span>
          <button
            type="button"
            disabled={confirmed || save.isPending}
            onClick={() => save.mutate()}
            className="h-8 rounded-6 border border-line px-3.5 text-11 font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            임시 저장
          </button>
          <a
            href="/admin/settlements"
            className="flex h-8 items-center rounded-6 bg-brand px-3.5 text-11 font-medium text-white"
          >
            정산 산출
          </a>
        </div>
      }
    >
      <div className="mb-5 flex max-w-[640px] gap-4">
        <div className="flex-1">
          <Field label="프로젝트">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-[180px]">
          <Field label="정산 기간">
            <TextInput
              placeholder="YYYY-MM"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {isLoading ? (
        <SkeletonBlock height={320} />
      ) : (
        <>
          <Card padded={false}>
            <div className="grid grid-cols-5">
              <Stat label="기간 매출" value={`${num(revenue)}원`} />
              <Stat label="비용 합계" value={`${num(totalCost)}원`} bordered />
              <Stat
                label="분배 대상"
                value={`${num(distributable)}원`}
                bordered
                accent
              />
              <Stat
                label="손익 구간"
                value={distributable > 0 ? "정산 가능" : "미달"}
                bordered
              />
              <Stat
                label="월 배분 가능액"
                value={`${num(Math.max(0, distributable))}원`}
                bordered
              />
            </div>
          </Card>

          {confirmed ? (
            <div className="mt-4 rounded-8 border border-line bg-brand-soft px-5 py-4">
              <p className="text-13 font-medium text-brand">
                {period} 확정됨 · {records?.record?.confirmedAt ? shortDate(records.record.confirmedAt) : "-"}
              </p>
              <p className="mt-1.5 text-12 text-body">{records?.record?.confirmNote}</p>
            </div>
          ) : null}

          <h2 className="mt-8 text-15 font-bold text-ink">매출</h2>
          <Card className="mt-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <TextInput
                  className="text-right"
                  inputMode="numeric"
                  placeholder="0"
                  disabled={confirmed}
                  value={revenueInput}
                  onChange={(e) => setRevenueInput(e.target.value)}
                />
              </div>
              <span className="shrink-0 text-12 text-muted">원</span>
            </div>
            <div className="mt-4 space-y-2 border-t border-line-soft pt-4">
              <div className="flex items-center justify-between text-12">
                <span className="text-body">자체몰 판매</span>
                <span className="flex items-center gap-4">
                  <span className="font-num text-ink">
                    {num(records?.salesTotal ?? 0)}원
                  </span>
                  <span className="w-[56px] text-right text-muted">연동</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-12">
                <span className="text-body">보정 · 직접 입력</span>
                <span className="flex items-center gap-4">
                  <span className="font-num text-ink">
                    {num(revenue - (records?.salesTotal ?? 0))}원
                  </span>
                  <span className="w-[56px] text-right text-muted">직접 입력</span>
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-line-soft pt-2 text-12 font-medium">
                <span className="text-ink">매출 합계</span>
                <span className="font-num text-ink">{num(revenue)}원</span>
              </div>
            </div>
            <p className="mt-3 text-12 text-muted">
              판매 기록 합계 {num(records?.salesTotal ?? 0)}원. 반품·현장 판매 보정을 넣어 확정합니다.
            </p>
          </Card>

          <h2 className="mt-8 text-15 font-bold text-ink">운영 비용</h2>
          <p className="mt-1.5 text-12 text-muted">
            임대료는 적지 않습니다. 파트너 계약의 월 고정 임대료가 지급 원장에서 따로
            빠집니다.
          </p>
          <Card className="mt-4" padded={false}>
            <div className="grid grid-cols-[1fr_220px] border-b border-line bg-surface px-6 py-3">
              <span className="text-11 text-muted">항목</span>
              <span className="text-right text-11 text-muted">금액</span>
            </div>
            {costs.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-[1fr_220px] items-center gap-3 border-b border-surface px-6 py-3 last:border-b-0"
              >
                <span className="text-13 text-ink">{c.label}</span>
                <div className="flex items-center gap-2">
                  <TextInput
                    className="text-right"
                    inputMode="numeric"
                    placeholder="0"
                    disabled={confirmed}
                    value={c.amount}
                    onChange={(e) =>
                      setCosts((prev) =>
                        prev.map((x) =>
                          x.id === c.id ? { ...x, amount: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <span className="shrink-0 text-12 text-muted">원</span>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_220px] items-center border-t border-line px-6 py-3">
              <span className="text-13 font-medium text-ink">비용 합계</span>
              <span className="text-right font-num text-13 font-medium text-ink">
                {num(totalCost)}원
              </span>
            </div>
          </Card>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={confirmed}
              onClick={() =>
                setCosts((prev) => [
                  ...prev,
                  { id: `extra-${prev.length}`, label: "기타", amount: "" },
                ])
              }
            >
              항목 추가
            </Button>
            <Button size="sm" variant="ghost" href="/admin/settlements">
              정산 결과 보기
            </Button>
          </div>

          {/* 확정 — 사유가 없으면 왜 그 숫자인지가 사라진다. 그래서 필수다. */}
          <Card className="mt-6">
            <Field label="확정 사유">
              <TextInput
                placeholder="예: 8월 판매 마감, 반품 2건 차감 반영"
                disabled={confirmed}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="mt-4 flex gap-3">
              {confirmed ? (
                <Button
                  variant="ghost"
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate(true)}
                >
                  확정 해제
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    disabled={save.isPending || !projectId}
                    onClick={() => save.mutate()}
                  >
                    저장
                  </Button>
                  <Button
                    disabled={confirm.isPending || !note.trim() || !projectId}
                    onClick={() => confirm.mutate(false)}
                  >
                    확정
                  </Button>
                </>
              )}
            </div>
            {msg ? <p className="mt-3 text-12 text-body">{msg}</p> : null}
          </Card>

          <h2 className="mt-8 text-15 font-bold text-ink">최근 판매 기록</h2>
          <div className="mt-4">
            <DataTable
              columns={salesColumns}
              rows={data?.recent ?? []}
              rowKey={(r) => r.id}
              empty="판매 기록이 없습니다."
            />
          </div>

          <p className="mt-5 text-12 text-muted">
확정하지 않은 기간은 회수금 분배가 거부됩니다. 확정 사유는 감사 로그에 남습니다.
          </p>
        </>
      )}
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  bordered,
  accent,
}: {
  label: string;
  value: string;
  bordered?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`px-6 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-12 text-muted">{label}</p>
      <p
        className={`mt-1.5 font-num text-22 font-medium ${accent ? "text-brand" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}
