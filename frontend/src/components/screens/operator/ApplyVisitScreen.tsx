"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, EmptyState, PanelShell } from "@/components/ui";
import { patchApplication, useOperatorApplication } from "../api";
import { ApplyStepLine } from "./ApplyStepLine";

const SLOTS = [
  { time: "10:00", label: "10:00–10:40" },
  { time: "14:00", label: "14:00–14:40", recommended: true },
  { time: "16:00", label: "16:00–16:40" },
];

/** 오늘부터 14일치 후보 날짜 */
function nextDays(count: number): Date[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i + 1);
    return d;
  });
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export function ApplyVisitScreen() {
  const router = useRouter();
  const { data: application, refetch } = useOperatorApplication();
  const days = nextDays(14);

  const [day, setDay] = useState<Date>(days[0]);
  const [slot, setSlot] = useState(SLOTS[1].time);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!application) {
    return (
      <PanelShell>
        <EmptyState
          title="진행 중인 신청이 없습니다"
          desc="자격·서류 신청을 먼저 마쳐 주세요."
          action={<Button href="/operator/apply">신청 시작</Button>}
        />
      </PanelShell>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const [h, m] = slot.split(":").map(Number);
      const at = new Date(day);
      at.setHours(h, m, 0, 0);
      await patchApplication(application!.id, {
        step: "visit",
        visitAt: at.toISOString(),
      });
      await refetch();
      router.push("/operator/apply/education");
    } catch (e) {
      setError(e instanceof Error ? e.message : "예약에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelShell>
      <ApplyStepLine application={application} current="visit" />

      <h1 className="text-24 font-bold text-ink">직접 보고 결정할 수 있어요</h1>
      <p className="mt-3 text-14 leading-6 text-body">
        채광, 전력, 급배수와 픽업 동선을 담당 매니저와 함께 확인합니다. 방문 뒤에도 신청을 취소할 수 있어요.
      </p>

      <Card className="mt-7 rounded-14">
        <h2 className="text-17 font-bold text-ink">예약 날짜</h2>
        <div className="mt-5 grid grid-cols-7 gap-2">
          {days.map((d) => {
            const selected = d.toDateString() === day.toDateString();
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => setDay(d)}
                className={`flex flex-col items-center rounded-8 border py-3 ${
                  selected
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-white hover:bg-surface"
                }`}
              >
                <span className="text-11 text-muted">
                  {WEEKDAY[d.getDay()]}
                </span>
                <span
                  className={`mt-1 font-num text-15 font-medium ${
                    selected ? "text-brand" : "text-ink"
                  }`}
                >
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-5 text-14 font-medium text-brand">
          선택한 날짜 · {day.getMonth() + 1}월 {day.getDate()}일(
          {WEEKDAY[day.getDay()]})
        </p>
      </Card>

      <Card className="mt-4 rounded-14">
        <h2 className="text-15 font-bold text-ink">방문 시간</h2>
        <div className="mt-4 space-y-3">
          {SLOTS.map((s) => (
            <button
              key={s.time}
              type="button"
              onClick={() => setSlot(s.time)}
              className={`flex h-[60px] w-full items-center rounded-14 border px-5 text-left ${
                slot === s.time
                  ? "border-brand bg-brand-soft"
                  : "border-line bg-white hover:bg-surface"
              }`}
            >
              <span
                className={`text-14 font-medium ${slot === s.time ? "text-brand" : "text-ink"}`}
              >
                {s.label}
                {s.recommended ? " · 추천" : ""}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-4 rounded-14">
        <p className="text-15 font-bold text-ink">{application.region} 후보지</p>
        <p className="mt-2 text-13 text-muted">
          담당 매니저가 방문 전날 문자와 알림으로 안내해 드려요.
        </p>
      </Card>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-6 space-y-3">
        <Button full disabled={busy} onClick={submit}>
          {busy ? "예약 중" : "이 일정으로 방문 예약"}
        </Button>
        <Button full variant="ghost" href="/operator">
          저장하고 나가기
        </Button>
      </div>
    </PanelShell>
  );
}
