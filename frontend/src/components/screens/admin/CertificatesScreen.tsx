"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  DataTable,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getJson, shortDate, type OperatorApplication } from "../api";
import { AdminShell } from "./AdminShell";

type AdminApplication = OperatorApplication & {
  user: { id: string; name: string; email: string | null };
};

async function patchAdmin(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/operator-applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "요청에 실패했습니다.");
  }
}

export function CertificatesScreen() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "operator-applications", "certificates"],
    queryFn: () =>
      getJson<{ applications: AdminApplication[] }>(
        "/api/admin/operator-applications",
      ),
    select: (d) => d.applications,
    retry: false,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <AdminShell title="보증서 관리">
        <SkeletonBlock height={360} />
      </AdminShell>
    );
  }

  const items = data ?? [];
  const ready = items.filter((a) => a.contractSignedAt && !a.certificateIssuedAt);
  const issued = items.filter((a) => a.certificateIssuedAt);

  async function act(id: string, action: "issue" | "suspend") {
    setBusy(true);
    setError(null);
    try {
      await patchAdmin({ id, action });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<AdminApplication>[] = [
    {
      key: "no",
      header: "보증서 번호",
      render: (a) => (
        <span className="font-num text-13">{a.certificateNo ?? "-"}</span>
      ),
    },
    { key: "name", header: "운영자", render: (a) => a.user.name },
    { key: "region", header: "배정 공간", render: (a) => a.region },
    {
      key: "issued",
      header: "발급일",
      align: "right",
      render: (a) => (
        <span className="text-12 text-muted">
          {shortDate(a.certificateIssuedAt)}
        </span>
      ),
    },
    {
      key: "action",
      header: "상태",
      align: "right",
      width: "120px",
      render: (a) => (
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(a.id, "suspend")}
          className="text-12 text-muted hover:text-danger"
        >
          정지
        </button>
      ),
    },
  ];

  return (
    <AdminShell
      title="승인된 운영자에게 보증서를 발급해요"
      desc="보증서는 운영자 앱에서 자격과 배정 지점을 확인할 때 사용됩니다. 발급·정지 이력은 감사 로그에 남아요."
    >
      {error ? <p className="mb-4 text-12 text-danger">{error}</p> : null}

      <h2 className="text-15 font-bold text-ink">발급 대기 {ready.length}건</h2>
      <div className="mt-4 space-y-4">
        {ready.length === 0 ? (
          <Card>
            <p className="text-13 text-muted">
              발급을 기다리는 운영자가 없습니다.
            </p>
          </Card>
        ) : (
          ready.map((a) => (
            <Card key={a.id} className="flex items-center justify-between">
              <div>
                <p className="text-15 font-bold text-ink">
                  {a.user.name} · {a.region}
                </p>
                <p className="mt-2 text-12 text-muted">
                  교육 수료 · 공간 최종 확정 · 계약 서명{" "}
                  {a.contractSignedAt ? formatDate(a.contractSignedAt) : ""}
                </p>
              </div>
              <Button
                disabled={busy}
                onClick={() => void act(a.id, "issue")}
              >
                보증서 발급하고 알림 보내기
              </Button>
            </Card>
          ))
        )}
      </div>

      <h2 className="mt-8 text-15 font-bold text-ink">발급 이력</h2>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={issued}
          rowKey={(a) => a.id}
          empty="발급된 보증서가 없습니다."
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Badge tone="pass">사용 범위</Badge>
        <span className="text-12 text-muted">
          운영자 앱 로그인 및 지점 인증 · 유효기간 1년 (운영 계약에 따라 갱신)
        </span>
      </div>
    </AdminShell>
  );
}
