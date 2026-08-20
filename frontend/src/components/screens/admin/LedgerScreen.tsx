"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { getJson, num, shortDate, useProjects, won } from "../api";
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

const DEFAULT_COSTS: CostLine[] = [
  { id: "rent", label: "임대료", amount: "" },
  { id: "utility", label: "전기 · 수도", amount: "" },
  { id: "labor", label: "인건비", amount: "" },
  { id: "supply", label: "자재 · 소모품", amount: "" },
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

  const [costs, setCosts] = useState<CostLine[]>(DEFAULT_COSTS);

  const revenue = data?.summary.totalAmount ?? 0;
  const totalCost = costs.reduce(
    (s, c) => s + Number(c.amount.replace(/\D/g, "") || 0),
    0,
  );
  const distributable = Math.max(0, revenue - totalCost);

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
      title="매출 · 비용 입력"
      desc="정산 산출의 입력값. 매출은 판매 기록에서 자동으로 채워지고, 비용만 담당자가 적는다."
      action={
        <span className="text-12 text-muted">
          기준일 {data?.dataAsOf ? shortDate(data.dataAsOf) : "-"}
        </span>
      }
    >
      <div className="mb-5 max-w-[320px]">
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

      {isLoading ? (
        <SkeletonBlock height={320} />
      ) : (
        <>
          <Card padded={false}>
            <div className="grid grid-cols-3">
              <Stat label="기간 매출 (90일)" value={`${num(revenue)}원`} />
              <Stat label="운영 비용" value={`${num(totalCost)}원`} bordered />
              <Stat
                label="분배 대상"
                value={`${num(distributable)}원`}
                bordered
                accent
              />
            </div>
          </Card>

          <h2 className="mt-8 text-15 font-bold text-ink">운영 비용</h2>
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
          </Card>

          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant="ghost"
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
            비용 입력값은 정산 산출에만 쓰이며, 확정 전에는 회수액에 반영되지 않습니다.
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
