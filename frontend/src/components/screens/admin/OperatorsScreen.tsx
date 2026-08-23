"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState,
  InfoRow,
  SkeletonBlock,
  TextArea,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getJson, type OperatorApplication } from "../api";
import { AdminShell } from "./AdminShell";

type AdminApplication = OperatorApplication & {
  user: { id: string; name: string; email: string | null; identityVerified: boolean };
};

const STATUS_LABEL: Record<string, string> = {
  applied: "접수",
  docs: "서류 검토",
  visit: "방문 예약",
  education: "교육 진행",
  matched: "공간 확정",
  operating: "운영 중",
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

export function OperatorsScreen() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "operator-applications"],
    queryFn: () =>
      getJson<{ applications: AdminApplication[] }>(
        "/api/admin/operator-applications",
      ),
    select: (d) => d.applications,
    retry: false,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <AdminShell title="신청 내용을 한곳에서 검토해요">
        <SkeletonBlock height={360} />
      </AdminShell>
    );
  }

  const items = data ?? [];
  const selected = items.find((a) => a.id === selectedId) ?? items[0] ?? null;

  async function act(action: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await patchAdmin({ id: selected.id, action, note: note.trim() || undefined });
      setNote("");
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="신청 내용을 한곳에서 검토해요"
      desc="자격과 현장 방문 결과를 확인하고 희망 공간을 가배정합니다."
      action={<span className="text-12 text-muted">대기 {items.length}건</span>}
    >
      {items.length === 0 ? (
        <EmptyState
          title="심사할 신청이 없습니다"
          desc="운영자가 자격 심사를 요청하면 여기에 올라옵니다."
        />
      ) : (
        <div className="flex items-start gap-8">
          <Card className="w-[300px] shrink-0" padded={false}>
            {items.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelectedId(a.id);
                  setNote("");
                }}
                className={`block w-full border-b border-surface px-5 py-4 text-left last:border-b-0 ${
                  selected?.id === a.id ? "bg-surface" : ""
                }`}
              >
                <span className="block text-12 font-medium text-ink">
                  {a.user.name} · {a.region}
                </span>
                <span className="mt-1.5 block text-11 text-muted">
                  {STATUS_LABEL[a.status] ?? a.status} · {formatDate(a.createdAt)}
                </span>
              </button>
            ))}
          </Card>

          {selected ? (
            <Card className="flex-1">
              <h2 className="text-16 font-bold text-ink">
                {selected.user.name} · {selected.region}
              </h2>
              <p className="mt-2 text-12 text-muted">
                {selected.user.email ?? "이메일 없음"}
              </p>

              <div className="mt-5">
                <InfoRow
                  label="본인확인"
                  value={
                    selected.user.identityVerified ? (
                      <span className="text-brand">확인 완료</span>
                    ) : (
                      "확인 전"
                    )
                  }
                />
                <InfoRow label="재배 경험" value={selected.cropExperience} />
                <InfoRow label="투입 가능 시간" value={selected.availableHours} />
                <InfoRow
                  label="제출 서류"
                  value={`${selected.documents.length}건`}
                />
                <InfoRow
                  label="현장 방문"
                  value={
                    selected.visitAt ? formatDate(selected.visitAt) : "예약 전"
                  }
                />
                <InfoRow
                  label="필수 교육"
                  value={`${selected.educationProgress}%`}
                />
                <InfoRow
                  label="계약 서명"
                  value={
                    selected.contractSignedAt
                      ? formatDate(selected.contractSignedAt)
                      : "미서명"
                  }
                />
              </div>

              {selected.documents.length > 0 ? (
                <div className="mt-5 grid grid-cols-4 gap-3">
                  {selected.documents.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={u}
                      src={u}
                      alt={`제출 서류 ${i + 1}`}
                      className="h-[110px] w-full rounded-8 border border-line object-cover"
                    />
                  ))}
                </div>
              ) : null}

              <p className="mt-7 text-12 text-muted">판정 사유</p>
              <div className="mt-2">
                <TextArea
                  placeholder="사유는 운영자에게 그대로 전달됩니다."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

              <div className="mt-5 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void act("approve")}
                >
                  조건부 승인하고 가배정
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void act("revise")}
                >
                  보완 요청 보내기
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </AdminShell>
  );
}
