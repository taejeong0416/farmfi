"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Shell,
  SkeletonBlock,
  StepList,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/lib/useAuth";
import {
  SPACE_STATUS_LABEL,
  SPACE_TYPE_LABEL,
  getJson,
  num,
  shortDate,
  won,
  type SpaceItem,
} from "../api";

type MySpace = SpaceItem & { ownerId: string | null };

const FLOW = ["공간 등록", "적합도 진단", "심사", "계약 체결", "운영 시작"];

export function LandlordScreen() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["spaces", "mine"],
    queryFn: () => getJson<{ spaces: MySpace[] }>("/api/spaces"),
    select: (d) => d.spaces,
    enabled: isAuthenticated,
    retry: false,
  });

  // 관리자 계정은 전체를 받으므로 화면에서 내 것만 남긴다.
  const mySpaces = (data ?? []).filter((s) => s.ownerId === user?.id);

  if (authLoading || (isAuthenticated && isLoading)) {
    return (
      <Shell>
        <SkeletonBlock height={360} />
      </Shell>
    );
  }

  if (!isAuthenticated) {
    return (
      <Shell>
        <EmptyState
          title="로그인하면 내 공간을 볼 수 있어요"
          desc="등록한 공간의 적합도와 예상 임대 수익을 확인할 수 있습니다."
          action={<Button href="/login?next=/landlord">로그인</Button>}
        />
      </Shell>
    );
  }

  const totalRent = mySpaces.reduce((s, x) => s + (x.estimatedRent ?? 0), 0);
  const avgScore =
    mySpaces.length === 0
      ? 0
      : Math.round(
          mySpaces.reduce((s, x) => s + (x.suitabilityScore ?? 0), 0) /
            mySpaces.length,
        );

  const columns: Column<MySpace>[] = [
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
      header: "예상 월 임대",
      align: "right",
      width: "140px",
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
    <Shell>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-24 font-bold text-ink">
            내가 등록한 공간, 한눈에 보기
          </h1>
          <p className="mt-3 text-13 text-muted">
            적합도와 예상 임대 수익, 심사 진행 상황을 여기서 확인합니다.
          </p>
        </div>
        <Button href="/space">공간 등록하기</Button>
      </div>

      {isError ? (
        <p className="mt-6 text-12 text-danger">
          공간 목록을 불러오지 못했습니다.
        </p>
      ) : null}

      <Card className="mt-6" padded={false}>
        <div className="grid grid-cols-3">
          <Stat label="등록 공간" value={`${mySpaces.length}개`} />
          <Stat label="평균 적합도" value={`${avgScore}점`} bordered />
          <Stat
            label="예상 월 임대 합계"
            value={`${num(totalRent)}원`}
            bordered
            accent
          />
        </div>
      </Card>

      <h2 className="mt-8 text-15 font-bold text-ink">내 공간</h2>
      <div className="mt-4">
        {mySpaces.length === 0 ? (
          <EmptyState
            title="아직 등록한 공간이 없습니다"
            desc="첫 공간을 등록하면 적합도와 예상 임대 수익을 계산해 드립니다."
            action={<Button href="/space">공간 등록하기</Button>}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={mySpaces}
            rowKey={(s) => s.id}
            empty="등록한 공간이 없습니다."
          />
        )}
      </div>

      <h2 className="mt-8 text-15 font-bold text-ink">공간 등록부터 계약까지</h2>
      <Card className="mt-4 max-w-panel" padded={false}>
        <div className="px-6">
          <StepList
            items={FLOW.map((title, i) => ({
              title: `${i + 1}. ${title}`,
              state:
                mySpaces.length === 0
                  ? i === 0
                    ? "current"
                    : "todo"
                  : i <= 1
                    ? "done"
                    : i === 2
                      ? "current"
                      : "todo",
            }))}
          />
        </div>
      </Card>

      <p className="mt-6 text-12 text-muted">
        더 많은 공간을 등록하면{" "}
        <Link href="/space" className="text-brand">
          적합도 진단
        </Link>
        을 바로 받아볼 수 있습니다.
      </p>
    </Shell>
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
