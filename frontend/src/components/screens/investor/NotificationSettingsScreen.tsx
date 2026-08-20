"use client";

import { useState } from "react";
import { Button, Card, Shell } from "@/components/ui";
import { useAuth } from "@/lib/useAuth";

type Channel = "app" | "email" | "sms";

const EVENTS = [
  {
    key: "application",
    title: "투자 신청 접수 · 배정 결과",
    desc: "투자 신청, 배정 · 미배정, 환불",
    locked: false,
  },
  {
    key: "release",
    title: "집행 완료",
    desc: "단계별 지급 완료",
    locked: false,
  },
  {
    key: "hold",
    title: "검증 보류 · 반려",
    desc: "집행이 멈추는 상태 변화",
    // 집행이 멈추는 변화는 알림을 끌 수 없다.
    locked: true,
  },
  {
    key: "payout",
    title: "회수금 지급",
    desc: "지급예정 · 지급완료 · 지급실패",
    locked: false,
  },
  {
    key: "notice",
    title: "공지 · 안내",
    desc: "정산 일정, 서비스 공지",
    locked: false,
  },
];

const CHANNELS: { key: Channel; label: string }[] = [
  { key: "app", label: "앱 내 알림" },
  { key: "email", label: "이메일" },
  { key: "sms", label: "SMS" },
];

type Settings = Record<string, Record<Channel, boolean>>;

const DEFAULTS: Settings = Object.fromEntries(
  EVENTS.map((e) => [e.key, { app: true, email: e.key !== "notice", sms: false }]),
) as Settings;

export function NotificationSettingsScreen() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  function toggle(eventKey: string, channel: Channel, locked: boolean) {
    if (locked && channel === "app") return;
    setSaved(false);
    setSettings((prev) => ({
      ...prev,
      [eventKey]: { ...prev[eventKey], [channel]: !prev[eventKey][channel] },
    }));
  }

  return (
    <Shell>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-22 font-bold text-ink">받을 소식 설정</h1>
          <p className="mt-3 text-13 text-muted">
            투자자 · {user?.name ?? "-"} · 역할에 해당하는 이벤트만 표시됩니다
          </p>
        </div>
        <Button onClick={() => setSaved(true)}>저장</Button>
      </div>

      {saved ? (
        <p className="mt-4 text-12 text-brand">저장했습니다.</p>
      ) : null}

      <Card className="mt-6 max-w-panel" padded={false}>
        <div className="grid grid-cols-[1fr_100px_100px_100px] border-b border-line bg-surface px-6 py-3">
          <span className="text-11 text-muted">이벤트 유형</span>
          {CHANNELS.map((c) => (
            <span key={c.key} className="text-center text-11 text-muted">
              {c.label}
            </span>
          ))}
        </div>

        {EVENTS.map((e) => (
          <div
            key={e.key}
            className="grid grid-cols-[1fr_100px_100px_100px] items-center border-b border-surface px-6 py-4 last:border-b-0"
          >
            <div>
              <p className="text-14 font-medium text-ink">{e.title}</p>
              <p className="mt-1 text-12 text-muted">{e.desc}</p>
            </div>
            {CHANNELS.map((c) => {
              const on = settings[e.key][c.key];
              const locked = e.locked && c.key === "app";
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggle(e.key, c.key, e.locked)}
                  className={`mx-auto flex h-6 w-11 items-center rounded-full px-0.5 transition-colors ${
                    on ? "bg-brand" : "bg-line"
                  } ${locked ? "cursor-not-allowed opacity-70" : ""}`}
                  aria-label={`${e.title} ${c.label}`}
                >
                  <span
                    className={`h-5 w-5 rounded-full bg-white transition-transform ${
                      on ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              );
            })}
          </div>
        ))}
      </Card>

      <p className="mt-5 max-w-panel text-12 text-muted">
        집행이 멈추는 상태 변화(보류 · 반려)는 앱 내 알림을 끌 수 없습니다.
      </p>
    </Shell>
  );
}
