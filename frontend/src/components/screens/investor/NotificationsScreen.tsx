"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Badge,
  Card,
  EmptyState,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useNotifications } from "../api";

const TYPE_LABEL: Record<string, string> = {
  verification_failed: "검증",
  anomaly_detected: "이상",
  manual_review: "검증",
  milestone_released: "집행",
  payout_scheduled: "회수금",
};

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "verify", label: "집행 · 검증" },
  { key: "payout", label: "회수금" },
] as const;

export function NotificationsScreen() {
  const { data, isLoading } = useNotifications();
  const [filter, setFilter] = useState<string>("all");

  const rows = useMemo(() => {
    const list = data ?? [];
    if (filter === "verify") {
      return list.filter((n) => n.milestoneId || n.type.includes("verif"));
    }
    if (filter === "payout") {
      return list.filter((n) => n.type.includes("payout") || n.type.includes("dividend"));
    }
    return list;
  }, [data, filter]);

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={360} />
      </Shell>
    );
  }

  const unread = (data ?? []).filter((n) => !n.isRead).length;

  return (
    <Shell>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-22 font-bold text-ink">투자자 알림함</h1>
          <p className="mt-3 text-13 text-muted">안읽음 {unread}건</p>
        </div>
        <Link
          href="/investor/notifications/settings"
          className="text-13 font-medium text-brand"
        >
          알림 설정
        </Link>
      </div>

      <div className="mt-6 flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`h-[34px] rounded-6 border px-3.5 text-12 ${
              filter === f.key
                ? "border-brand font-medium text-brand"
                : "border-line text-body hover:bg-surface"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 max-w-panel">
          <EmptyState title="새 소식이 없습니다" desc="투자 진행 상황이 바뀌면 여기에 쌓입니다." />
        </div>
      ) : (
        <Card className="mt-6 max-w-panel" padded={false}>
          <div className="px-6">
            {rows.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-4 border-b border-surface py-4 last:border-b-0"
              >
                <Badge tone={n.isRead ? "plain" : "pass"}>
                  {TYPE_LABEL[n.type] ?? "알림"}
                </Badge>
                <div className="flex-1">
                  <p className="text-13 font-medium text-ink">{n.message}</p>
                  <p className="mt-1.5 text-12 text-muted">
                    {formatDate(n.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Shell>
  );
}
