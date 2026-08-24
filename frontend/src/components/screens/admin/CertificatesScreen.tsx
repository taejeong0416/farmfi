"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Modal,
  SkeletonBlock,
  type Column,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  CREDENTIAL_REASON_LABEL,
  CREDENTIAL_STATUS_LABEL,
  getJson,
  postJson,
  shortDate,
} from "../api";
import { AdminShell } from "./AdminShell";

type AdminCredential = {
  id: string;
  credentialNo: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  statusReason: string | null;
  statusNote: string | null;
  user: { id: string; name: string; email: string | null };
  application: { id: string; region: string };
};

type PendingApplication = {
  id: string;
  region: string;
  user: { id: string; name: string };
  contractSignedAt: string | null;
  termEnd: string | null;
};

/** 정지·해지에 고를 수 있는 사유. 값의 정본은 서버의 lib/credential.ts다. */
const SUSPEND_REASONS = [
  "training_expired",
  "safety_check_expired",
  "serious_violation",
  "contract_ended",
  "other",
] as const;

async function patchStatus(
  id: string,
  body: { status: string; reason?: string; note?: string },
) {
  const res = await fetch(`/api/admin/operator-credentials/${id}/status`, {
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
    queryKey: ["admin", "operator-credentials"],
    queryFn: () =>
      getJson<{ credentials: AdminCredential[]; pending: PendingApplication[] }>(
        "/api/admin/operator-credentials",
      ),
    retry: false,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<{
    credential: AdminCredential;
    next: "suspended" | "revoked";
  } | null>(null);
  const [reason, setReason] = useState<string>(SUSPEND_REASONS[0]);
  const [note, setNote] = useState("");

  if (isLoading) {
    return (
      <AdminShell title="승인된 운영자에게 디지털 보증서를 발급해요">
        <SkeletonBlock height={360} />
      </AdminShell>
    );
  }

  const credentials = data?.credentials ?? [];
  const pending = data?.pending ?? [];

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submitStatus() {
    if (!target) return;
    await run(async () => {
      await patchStatus(target.credential.id, {
        status: target.next,
        ...(target.next === "suspended" ? { reason } : {}),
        note: note.trim() || undefined,
      });
      setTarget(null);
      setNote("");
    });
  }

  const columns: Column<AdminCredential>[] = [
    {
      key: "no",
      header: "보증서 번호",
      render: (c) => <span className="font-num text-13">{c.credentialNo}</span>,
    },
    { key: "name", header: "운영자", render: (c) => c.user.name },
    { key: "region", header: "배정 공간", render: (c) => c.application.region },
    {
      key: "term",
      header: "유효기간",
      align: "right",
      render: (c) => (
        <span className="text-12 text-muted">{shortDate(c.expiresAt)}까지</span>
      ),
    },
    {
      key: "status",
      header: "상태",
      align: "right",
      render: (c) => (
        <span className="text-13 text-ink">
          {CREDENTIAL_STATUS_LABEL[c.status] ?? c.status}
          {c.statusReason ? (
            <span className="ml-2 text-12 text-muted">
              {CREDENTIAL_REASON_LABEL[c.statusReason] ?? c.statusReason}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "action",
      header: "처리",
      align: "right",
      width: "200px",
      render: (c) => (
        <div className="flex justify-end gap-3">
          {c.status === "active" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setTarget({ credential: c, next: "suspended" })}
              className="text-12 text-muted hover:text-danger"
            >
              정지
            </button>
          ) : null}
          {c.status === "suspended" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  patchStatus(c.id, { status: "active", note: "정지 사유 해소" }),
                )
              }
              className="text-12 text-brand hover:underline"
            >
              정지 해제
            </button>
          ) : null}
          {c.status !== "revoked" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setTarget({ credential: c, next: "revoked" })}
              className="text-12 text-muted hover:text-danger"
            >
              폐기
            </button>
          ) : null}
          {c.status === "expired" || c.status === "revoked" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await postJson("/api/admin/operator-credentials", {
                    applicationId: c.application.id,
                    reissue: true,
                  });
                })
              }
              className="text-12 text-brand hover:underline"
            >
              재발급
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <AdminShell
      title="승인된 운영자에게 디지털 보증서를 발급해요"
      desc="보증서는 운영자 앱에서 자격과 배정 지점을 확인할 때 사용됩니다. 발급·정지·재발급 이력은 감사 로그에 남아요."
    >
      {error ? <p className="mb-4 text-12 text-danger">{error}</p> : null}

      <h2 className="text-15 font-bold text-ink">발급 대기 {pending.length}건</h2>
      <div className="mt-4 space-y-4">
        {pending.length === 0 ? (
          <Card>
            <p className="text-13 text-muted">발급을 기다리는 운영자가 없습니다.</p>
          </Card>
        ) : (
          pending.map((a) => (
            <Card key={a.id} className="flex items-center justify-between">
              <div>
                <p className="text-15 font-bold text-ink">
                  {a.user.name} · {a.region}
                </p>
                <p className="mt-2 text-12 text-muted">
                  교육 수료 · 공간 최종 확정 · 계약 서명{" "}
                  {a.contractSignedAt ? formatDate(a.contractSignedAt) : ""}
                  {a.termEnd ? ` · 계약 종료 ${shortDate(a.termEnd)}` : ""}
                </p>
              </div>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await postJson("/api/admin/operator-credentials", {
                      applicationId: a.id,
                    });
                  })
                }
              >
                보증서 발급하고 알림 보내기
              </Button>
            </Card>
          ))
        )}
      </div>

      {/* `.fig` A-03 — 발급 전에 무엇이 나가는지 보여준다. */}
      <h2 className="mt-8 text-15 font-bold text-ink">미리보기</h2>
      <div className="mt-4 max-w-[420px] rounded-14 bg-brand px-6 py-6">
        <p className="text-11 font-medium text-[#D1E0D6]">FARMFI OPERATOR</p>
        <p className="mt-2 text-24 font-bold text-white">운영자 보증서</p>
        <p className="mt-5 text-12 text-[#D1E0D6]">
          {pending[0]
            ? `${pending[0].user.name} · ${pending[0].region}`
            : (credentials[0]?.user.name ?? "발급 대상 없음")}
        </p>
        <p className="mt-1 text-12 text-[#D1E0D6]">
          교육 수료 · 공간 최종 확정 · 계약 서명 완료
        </p>
      </div>
      <p className="mt-3 text-12 text-muted">
        상태 변경 시 운영자에게 즉시 알림이 갑니다.
      </p>

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="text-15 font-bold text-ink">발급 이력</h2>
        <span className="text-11 text-muted">발급 이력 전체 보기 →</span>
      </div>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={credentials}
          rowKey={(c) => c.id}
          empty="발급된 보증서가 없습니다."
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Badge tone="pass">사용 범위</Badge>
        <span className="text-12 text-muted">
          운영자 앱 로그인 및 지점 인증 · 유효기간은 운영계약 종료일과 같습니다
        </span>
      </div>

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target?.next === "revoked" ? "보증서 해지" : "보증서 정지"}
        desc={
          target
            ? `${target.credential.user.name} · ${target.credential.credentialNo}`
            : undefined
        }
        footer={
          <div className="flex gap-3">
            <Button full variant="ghost" onClick={() => setTarget(null)}>
              취소
            </Button>
            <Button
              full
              disabled={busy || note.trim() === ""}
              onClick={() => void submitStatus()}
            >
              {busy ? "처리 중" : "확인"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            {SUSPEND_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`flex w-full items-center rounded-12 border px-4 py-3 text-left text-14 ${
                  reason === r
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line bg-white text-ink hover:bg-surface"
                }`}
              >
                {CREDENTIAL_REASON_LABEL[r]}
              </button>
            ))}
          </div>
          <Field
            label="설명"
            hint="운영자가 앱에서 막히는 이유로 그대로 보입니다."
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="운영자에게 전달될 설명"
              className="h-11 w-full rounded-10 border border-line px-4 text-14 text-ink outline-none focus:border-brand"
            />
          </Field>
          <p className="text-12 text-muted">
            정지되면 운영자 앱의 운영 기능이 잠기고, 운영자에게 알림이 갑니다.
          </p>
        </div>
      </Modal>
    </AdminShell>
  );
}
