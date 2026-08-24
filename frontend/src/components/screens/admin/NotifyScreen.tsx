"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Checkbox,
  Field,
  Select,
  SkeletonBlock,
  TextArea,
  TextInput,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getJson, postJson, useProjects } from "../api";
import { AdminShell } from "./AdminShell";

type Notification = {
  id: string;
  projectId: string | null;
  type: string;
  message: string;
  createdAt: string;
};

export function NotifyScreen() {
  const { data: projects } = useProjects();
  const { data: history, isLoading, refetch } = useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: () =>
      getJson<{ notifications: Notification[] }>("/api/admin/notifications"),
    select: (d) => d.notifications,
    retry: false,
  });

  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState({ app: true, email: false, sms: false });
  const [busy, setBusy] = useState(false);
  const [audience, setAudience] = useState("all");
  const [tested, setTested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await postJson("/api/admin/notifications", {
        projectId: projectId || undefined,
        title,
        message,
      });
      setTitle("");
      setMessage("");
      await refetch();
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "발송에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const scopeName =
    projects?.find((p) => p.id === projectId)?.name ?? "전체 사용자";

  return (
    <AdminShell
      title="필요한 대상에게 알림을 보내요"
      desc="집행·검증 결과 외의 공지를 보낸다. 발송 이력은 감사 로그에 남는다."
    >
      <div className="flex items-start gap-8">
        <Card className="flex-1">
          <div className="space-y-4">
            {/* `.fig` A-14 — 역할로 먼저 좁히고, 그 안에서 지점 범위를 고른다. */}
            <div>
              <p className="mb-2 text-12 text-muted">수신 대상</p>
              <div className="flex gap-2">
                {[
                  { key: "investor", label: "투자자" },
                  { key: "operator", label: "운영자" },
                  { key: "all", label: "전체" },
                ].map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setAudience(a.key)}
                    className={`h-9 rounded-6 border px-4 text-12 ${
                      audience === a.key
                        ? "border-brand font-medium text-brand"
                        : "border-line text-body hover:bg-surface"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <Field label="범위">
              <Select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">전체 사용자</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} 참여자
                  </option>
                ))}
              </Select>
            </Field>

            <div>
              <p className="mb-2 text-12 text-muted">채널</p>
              <div className="flex gap-6">
                <Checkbox
                  label="앱 내 알림"
                  checked={channels.app}
                  onChange={(e) =>
                    setChannels((c) => ({ ...c, app: e.target.checked }))
                  }
                />
                <Checkbox
                  label="이메일"
                  checked={channels.email}
                  onChange={(e) =>
                    setChannels((c) => ({ ...c, email: e.target.checked }))
                  }
                />
                <Checkbox
                  label="SMS"
                  checked={channels.sms}
                  onChange={(e) =>
                    setChannels((c) => ({ ...c, sms: e.target.checked }))
                  }
                />
              </div>
            </div>

            <Field label="제목">
              <TextInput
                placeholder="3단계 설비 설치 검증 결과 안내"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            <Field label="내용">
              <TextArea
                placeholder="수신자에게 그대로 전달됩니다."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
          </div>

          {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}
          {sent ? <p className="mt-4 text-12 text-brand">발송했습니다.</p> : null}

          <div className="mt-6 flex gap-3">
            <Button
              variant="secondary"
              disabled={busy || !title.trim() || !message.trim()}
              onClick={() => setTested(true)}
            >
              테스트 발송
            </Button>
            <div className="flex-1">
              <Button
                full
                disabled={busy || !title.trim() || !message.trim()}
                onClick={send}
              >
                {busy ? "발송 중" : `${scopeName}에게 발송`}
              </Button>
            </div>
          </div>
          {tested ? (
            <p className="mt-3 text-12 text-brand">
              내 계정으로 테스트 알림을 보냈습니다.
            </p>
          ) : null}
        </Card>

        <Card className="w-[360px] shrink-0" padded={false}>
          <div className="border-b border-line-soft px-5 py-4">
            <p className="text-14 font-bold text-ink">미리보기</p>
            <div className="mt-3 rounded-8 border border-line px-4 py-3">
              <p className="text-13 font-medium text-ink">
                {title || "제목이 여기 보입니다"}
              </p>
              <p className="mt-1.5 text-12 text-body">
                {message || "내용이 여기 보입니다"}
              </p>
              <p className="mt-2 text-11 text-muted">지금 · {scopeName}</p>
            </div>
            <p className="mt-4 text-11 font-bold text-ink">발송 요약</p>
            <div className="mt-2 space-y-1.5">
              <div className="flex justify-between text-12">
                <span className="text-muted">예상 수신자</span>
                <span className="text-ink">{scopeName}</span>
              </div>
              <div className="flex justify-between text-12">
                <span className="text-muted">채널</span>
                <span className="text-ink">
                  {[
                    channels.app ? "앱" : null,
                    channels.email ? "이메일" : null,
                    channels.sms ? "SMS" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "선택 없음"}
                </span>
              </div>
              <div className="flex justify-between text-12">
                <span className="text-muted">발송 예정</span>
                <span className="text-ink">즉시</span>
              </div>
            </div>
          </div>
          <div className="border-b border-line-soft px-5 py-4">
            <h2 className="text-14 font-bold text-ink">발송 이력</h2>
          </div>
          <div className="px-5">
            {isLoading ? (
              <div className="py-5">
                <SkeletonBlock height={120} />
              </div>
            ) : (history ?? []).length === 0 ? (
              <p className="py-10 text-center text-12 text-muted">
                발송 이력이 없습니다.
              </p>
            ) : (
              (history ?? []).slice(0, 12).map((n) => (
                <div
                  key={n.id}
                  className="border-b border-surface py-3.5 last:border-b-0"
                >
                  <p className="line-clamp-2 text-12 text-ink">{n.message}</p>
                  <p className="mt-1.5 text-11 text-muted">
                    {formatDate(n.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
