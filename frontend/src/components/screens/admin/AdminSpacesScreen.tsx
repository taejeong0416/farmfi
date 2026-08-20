"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import {
  SPACE_STATUS_LABEL,
  SPACE_TYPE_LABEL,
  getJson,
  shortDate,
  won,
  type SpaceItem,
} from "../api";
import { AdminShell } from "./AdminShell";

export function AdminSpacesScreen() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "spaces"],
    queryFn: () => getJson<{ spaces: SpaceItem[] }>("/api/spaces"),
    select: (d) => d.spaces,
    retry: false,
  });

  if (isLoading) {
    return (
      <AdminShell title="공간 · 설비 구성">
        <SkeletonBlock height={360} />
      </AdminShell>
    );
  }

  if (isError) {
    return (
      <AdminShell title="공간 · 설비 구성">
        <EmptyState
          title="공간 목록을 볼 수 없습니다"
          desc="관리자로 로그인한 뒤 다시 확인해 주세요."
        />
      </AdminShell>
    );
  }

  const spaces = data ?? [];

  const columns: Column<SpaceItem>[] = [
    { key: "address", header: "공간", render: (s) => s.address },
    {
      key: "type",
      header: "유형",
      width: "110px",
      render: (s) => (
        <span className="text-12 text-body">
          {SPACE_TYPE_LABEL[s.spaceType] ?? s.spaceType}
        </span>
      ),
    },
    { key: "area", header: "면적", width: "100px", render: (s) => s.area },
    {
      key: "utility",
      header: "전력 · 급수",
      render: (s) => (
        <span className="text-12 text-body">
          {s.electricity} · {s.water}
        </span>
      ),
    },
    {
      key: "score",
      header: "적합도",
      align: "right",
      width: "90px",
      render: (s) => (
        <span className="font-num text-13">
          {s.suitabilityScore != null ? `${s.suitabilityScore}점` : "-"}
        </span>
      ),
    },
    {
      key: "rent",
      header: "예상 임대",
      align: "right",
      width: "130px",
      render: (s) => (
        <span className="font-num text-13">
          {s.estimatedRent ? won(s.estimatedRent) : "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "상태",
      align: "right",
      width: "110px",
      render: (s) => (
        <Badge tone={s.status === "approved" ? "pass" : "plain"}>
          {SPACE_STATUS_LABEL[s.status] ?? s.status}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "등록일",
      align: "right",
      width: "110px",
      render: (s) => (
        <span className="text-12 text-muted">{shortDate(s.createdAt)}</span>
      ),
    },
  ];

  return (
    <AdminShell
      title="공간에 들어갈 설비를 먼저 구성해요"
      desc="웹에서는 종류·수량·배치를 관리하고, 현장 운영자는 앱으로 설비 코드를 스캔해 실제 장치와 연결합니다."
    >
      <Card padded={false}>
        <div className="grid grid-cols-4">
          <Stat label="등록 공간" value={`${spaces.length}개`} />
          <Stat
            label="신청 가능"
            value={`${spaces.filter((s) => s.status === "approved").length}개`}
            bordered
          />
          <Stat
            label="검토 중"
            value={`${spaces.filter((s) => s.status === "reviewing" || s.status === "submitted").length}개`}
            bordered
          />
          <Stat
            label="반려"
            value={`${spaces.filter((s) => s.status === "rejected").length}개`}
            bordered
          />
        </div>
      </Card>

      <h2 className="mt-8 text-15 font-bold text-ink">등록된 공간</h2>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={spaces}
          rowKey={(s) => s.id}
          empty="등록된 공간이 없습니다."
        />
      </div>

      <Card className="mt-6">
        <p className="text-14 font-bold text-ink">운영 가능 전환 조건</p>
        <p className="mt-2 text-12 text-muted">
          필수 설비 연결 100% · 통신 테스트 통과 · 센서값 정상. 운영자 앱에서 설비 코드를 스캔하면 이 공간에 자동 연결됩니다.
        </p>
      </Card>
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  bordered,
}: {
  label: string;
  value: string;
  bordered?: boolean;
}) {
  return (
    <div className={`px-5 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-12 text-muted">{label}</p>
      <p className="mt-1.5 font-num text-20 font-medium text-ink">{value}</p>
    </div>
  );
}
