"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  DataTable,
  EmptyState,
  Select,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import { shortDate } from "../api";
import { getJson } from "../api";
import { AdminShell } from "./AdminShell";

type AdminUser = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  identityVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
};

/** 화면에 적는 소속. 계정 자체에는 조직 필드가 없어 역할에서 읽는다. */
const ROLE_GROUP: Record<string, string> = {
  investor: "일반 투자자",
  landlord: "공간 제공자",
  operator: "운영자",
  admin: "플랫폼 운영팀",
};

const ROLE_LABEL: Record<string, string> = {
  investor: "투자자",
  landlord: "공간주",
  operator: "운영자",
  admin: "관리자",
};

export function RolesScreen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () =>
      getJson<{ users: AdminUser[]; roles: string[] }>("/api/admin/users"),
    retry: false,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <AdminShell title="운영자별 접근 권한을 관리해요">
        <SkeletonBlock height={360} />
      </AdminShell>
    );
  }

  if (isError || !data) {
    return (
      <AdminShell title="운영자별 접근 권한을 관리해요">
        <EmptyState
          title="사용자 목록을 볼 수 없습니다"
          desc="관리자로 로그인한 뒤 다시 확인해 주세요."
        />
      </AdminShell>
    );
  }

  async function changeRole(id: string, role: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, role }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? "변경에 실패했습니다.");
      }
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<AdminUser>[] = [
    { key: "name", header: "사용자", render: (u) => u.name },
    {
      key: "email",
      header: "소속 · 계정",
      render: (u) => (
        <span className="text-12 text-muted">
          {ROLE_GROUP[u.role] ?? "—"} · {u.email ?? "-"}
        </span>
      ),
    },
    {
      key: "role",
      header: "권한",
      width: "180px",
      render: (u) => (
        <Select
          value={u.role}
          disabled={busy}
          onChange={(e) => void changeRole(u.id, e.target.value)}
          className="h-9 text-12"
        >
          {data.roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r] ?? r}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: "status",
      header: "상태",
      align: "right",
      width: "120px",
      render: (u) => (
        <Badge tone={u.identityVerified ? "pass" : "plain"}>
          {u.identityVerified ? "활성" : "본인확인 전"}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "가입일",
      align: "right",
      width: "110px",
      render: (u) => (
        <span className="text-12 text-muted">{shortDate(u.createdAt)}</span>
      ),
    },
  ];

  return (
    <AdminShell
      title="운영자별 접근 권한을 관리해요"
      desc="권한 변경은 즉시 적용되며 변경 전후 값이 감사 로그에 기록됩니다. 외부 전문가 권한은 배정된 건에 한해 기한부로 부여됩니다."
      action={
        <span className="text-12 text-muted">사용자 {data.users.length}명</span>
      }
    >
      {error ? <p className="mb-4 text-12 text-danger">{error}</p> : null}
      <DataTable
        columns={columns}
        rows={data.users}
        rowKey={(u) => u.id}
        empty="사용자가 없습니다."
      />
    </AdminShell>
  );
}
