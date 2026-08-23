"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Select,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import { PROJECT_STATUS_LABEL, getJson, num, shortDate, won } from "../api";
import { AdminShell } from "./AdminShell";

type Institution = {
  id: string;
  name: string;
  type: string;
  projectCount: number;
};

type ProjectRow = {
  projectId: string;
  name: string;
  status: string;
  harvestQuantity: number;
  salesQuantity: number;
  revenue: number;
  iotRecords: number;
  anomalyRate: number;
};

type Report = {
  institution: { id: string; name: string };
  periodDays: number;
  dataAsOf: string | null;
  stale: boolean;
  summary: {
    projectCount: number;
    operatingRate: number;
    totalHarvest: number;
    totalSalesQuantity: number;
    totalRevenue: number;
  };
  byProject: ProjectRow[];
};

const INSTITUTION_TYPE_LABEL: Record<string, string> = {
  public: "공공",
  university: "대학",
  esg_company: "기업 ESG",
};

const PERIODS = [30, 90, 180, 365];

export function InstitutionReportScreen() {
  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ["institutions"],
    queryFn: () => getJson<{ institutions: Institution[] }>("/api/reports/institution"),
    select: (d) => d.institutions,
    retry: false,
  });

  const [institutionId, setInstitutionId] = useState("");
  const [days, setDays] = useState(90);

  useEffect(() => {
    if (!institutionId && list && list.length > 0) setInstitutionId(list[0].id);
  }, [list, institutionId]);

  const { data, isLoading } = useQuery({
    queryKey: ["institution-report", institutionId, days],
    queryFn: () =>
      getJson<Report>(
        `/api/reports/institution?institutionId=${institutionId}&days=${days}`,
      ),
    enabled: Boolean(institutionId),
    retry: false,
  });

  const columns: Column<ProjectRow>[] = [
    {
      key: "name",
      header: "지점",
      render: (p) => <span className="text-13 text-ink">{p.name}</span>,
    },
    {
      key: "status",
      header: "상태",
      width: "110px",
      render: (p) => (
        <span className="text-12 text-body">
          {PROJECT_STATUS_LABEL[p.status] ?? p.status}
        </span>
      ),
    },
    {
      key: "harvest",
      header: "수확량",
      align: "right",
      width: "110px",
      render: (p) => <span className="font-num text-13">{num(p.harvestQuantity)}</span>,
    },
    {
      key: "salesQty",
      header: "판매량",
      align: "right",
      width: "110px",
      render: (p) => <span className="font-num text-13">{num(p.salesQuantity)}</span>,
    },
    {
      key: "revenue",
      header: "매출",
      align: "right",
      width: "150px",
      render: (p) => (
        <span className="font-num text-14 font-medium">{won(p.revenue)}</span>
      ),
    },
    {
      key: "anomaly",
      header: "이상 비율",
      align: "right",
      width: "120px",
      // 색으로 등급 매기지 않는다. 측정이 없으면 비율이 아니라 "측정 없음"이다.
      render: (p) => (
        <span className="font-num text-13 text-body">
          {p.iotRecords === 0 ? "측정 없음" : `${p.anomalyRate}%`}
        </span>
      ),
    },
  ];

  const selected = (list ?? []).find((i) => i.id === institutionId);

  return (
    <AdminShell
      label="기관 성과 리포트"
      title="기관별 공간 활용과 실적을 확인해요"
      desc="기간은 마지막 기록을 끝점으로 잡습니다."
      action={
        institutionId ? (
          <Button
            size="sm"
            variant="ghost"
            href={`/api/reports/institution?institutionId=${institutionId}&days=${days}&format=csv`}
          >
            CSV 내려받기
          </Button>
        ) : undefined
      }
    >
      {listLoading ? (
        <SkeletonBlock height={320} />
      ) : (list ?? []).length === 0 ? (
        <EmptyState
          title="등록된 도입 기관이 없습니다"
          desc="지점에 기관을 연결하면 이 화면에서 실적을 모아 봅니다."
        />
      ) : (
        <>
          <div className="mb-5 flex gap-4">
            <div className="w-[320px]">
              <Field label="도입 기관">
                <Select
                  value={institutionId}
                  onChange={(e) => setInstitutionId(e.target.value)}
                >
                  {(list ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({INSTITUTION_TYPE_LABEL[i.type] ?? i.type} · 지점{" "}
                      {i.projectCount})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-[180px]">
              <Field label="집계 기간">
                <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {PERIODS.map((d) => (
                    <option key={d} value={d}>
                      최근 {d}일
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          {isLoading || !data ? (
            <SkeletonBlock height={280} />
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3">
                <span className="text-12 text-muted">
                  기준일 {data.dataAsOf ? shortDate(data.dataAsOf) : "-"}
                </span>
                {/* 기록이 멈춘 기관을 최신 실적처럼 보여주지 않는다. */}
                {data.stale ? <Badge>기록이 멈춰 있습니다</Badge> : null}
              </div>

              <Card padded={false}>
                <div className="grid grid-cols-3">
                  <Stat label="지점 수" value={`${data.summary.projectCount}곳`} />
                  <Stat
                    label="운영률"
                    value={`${data.summary.operatingRate}%`}
                    bordered
                  />
                  <Stat
                    label={`기간 매출 (${data.periodDays}일)`}
                    value={won(data.summary.totalRevenue)}
                    bordered
                    accent
                  />
                </div>
                <div className="grid grid-cols-3 border-t border-line-soft">
                  <Stat label="수확량" value={num(data.summary.totalHarvest)} small />
                  <Stat
                    label="판매량"
                    value={num(data.summary.totalSalesQuantity)}
                    small
                    bordered
                  />
                  <Stat
                    label="기관"
                    value={selected?.name ?? data.institution.name}
                    small
                    bordered
                  />
                </div>
              </Card>

              <h2 className="mt-8 text-15 font-bold text-ink">지점별 실적</h2>
              <div className="mt-4">
                <DataTable
                  columns={columns}
                  rows={data.byProject}
                  rowKey={(p) => p.projectId}
                  empty="이 기관에 연결된 지점이 없습니다."
                />
              </div>

              <p className="mt-5 text-12 text-muted">
                수확량·판매량 단위는 봉입니다. 기간은 오늘이 아니라 이 기관의 마지막
                기록을 끝점으로 잡습니다 — 기록이 멈춘 뒤에도 마지막 실적을 그대로
                보여주기 위해서입니다.
              </p>
            </>
          )}
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
  small,
}: {
  label: string;
  value: string;
  bordered?: boolean;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`px-6 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-12 text-muted">{label}</p>
      <p
        className={`mt-1.5 font-num font-medium ${small ? "text-15" : "text-22"} ${
          accent ? "text-brand" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
