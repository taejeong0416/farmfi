"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

// GET /api/notifications 응답 스펙 (route.ts 기준). 미확인만 거르지 않고 전량 받아
// 클라이언트에서 미확인 수를 센다 (읽음 처리 API는 아직 없음).
type Notification = {
  id: string;
  projectId: string | null;
  milestoneId: string | null;
  type: string;
  message: string;
  evidenceUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

const TYPE_LABEL: Record<string, string> = {
  anomaly_detected: "생육 이상",
  verification_failed: "검증 실패",
  manual_review: "수동 검토",
  milestone_timeout: "기한 초과",
};

async function fetchNotifications(): Promise<Notification[]> {
  const res = await fetch("/api/notifications", { credentials: "include" });
  if (!res.ok) throw new Error("알림을 불러오지 못했습니다.");
  const data = (await res.json()) as { notifications?: Notification[] };
  return data.notifications ?? [];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const { data, isError } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
    retry: false,
  });

  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="ghost"
        aria-label={`알림 ${unread}건`}
        aria-expanded={open}
        style={{ minHeight: 40, padding: "0 12px", position: "relative" }}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.6L4.5 16h15L18 12.6V9a6 6 0 0 0-6-6Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M10 19a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        {unread > 0 ? (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: "#b02a2a",
              color: "#fff",
              fontSize: 11,
              fontWeight: 900,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 5px",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="알림 목록"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "0 18px 40px rgba(11, 67, 31, 0.14)",
            padding: 14,
            zIndex: 60,
          }}
        >
          <p style={{ margin: "0 0 10px", fontWeight: 900 }}>
            알림 {unread > 0 ? `· 미확인 ${unread}건` : ""}
          </p>
          {isError ? (
            <p className="muted" style={{ margin: 0 }}>
              알림을 불러오지 못했습니다.
            </p>
          ) : notifications.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              새 알림이 없습니다.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {notifications.slice(0, 12).map((n) => {
                const body = (
                  <>
                    <span
                      className={`badge ${n.isRead ? "is-muted" : "is-fail"}`}
                      style={{ fontSize: 11, padding: "3px 7px" }}
                    >
                      {TYPE_LABEL[n.type] ?? n.type}
                    </span>
                    <span style={{ display: "block", marginTop: 6, fontWeight: 700 }}>
                      {n.message}
                    </span>
                    <span className="muted" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
                      {timeAgo(n.createdAt)}
                    </span>
                  </>
                );
                return (
                  <li
                    key={n.id}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: n.isRead ? "transparent" : "var(--soft)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {n.projectId ? (
                      <Link
                        href={`/monitoring/${n.projectId}`}
                        onClick={() => {
                          setOpen(false);
                          onNavigate?.();
                        }}
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
