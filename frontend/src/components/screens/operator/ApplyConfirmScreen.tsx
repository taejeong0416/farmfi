"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, EmptyState, InfoRow, Shell } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  patchApplication,
  useAvailableSpaces,
  useOperatorApplication,
} from "../api";
import { ApplyStepLine } from "./ApplyStepLine";

export function ApplyConfirmScreen() {
  const router = useRouter();
  const { data: application, refetch } = useOperatorApplication();
  const { data: spaces } = useAvailableSpaces();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!application) {
    return (
      <Shell>
        <EmptyState
          title="진행 중인 신청이 없습니다"
          desc="자격·서류 신청을 먼저 마쳐 주세요."
          action={<Button href="/operator/apply">신청 시작</Button>}
        />
      </Shell>
    );
  }

  const space = (spaces ?? []).find((s) => s.id === application.spaceId);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await patchApplication(application!.id, {
        step: "confirm",
        spaceId: application!.spaceId,
      });
      await refetch();
      router.push("/operator/apply/contract");
    } catch (e) {
      setError(e instanceof Error ? e.message : "확정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <ApplyStepLine application={application} current="confirm" />

      <h1 className="text-24 font-bold text-ink">확인한 공간을 최종 배정받아요</h1>
      <p className="mt-3 text-14 leading-6 text-body">
        현장 방문 결과와 교육 수료가 확인됐습니다. 계약서에 들어갈 공간과 운영 조건을 마지막으로 확인해 주세요.
      </p>

      <div className="mt-7 rounded-10 bg-brand-soft px-6 py-6">
        <p className="text-22 font-bold text-ink">
          {space?.address ?? application.region} 후보지
        </p>
        <p className="mt-2 text-14 text-ink">
          {space ? `${space.area} · 채광 ${space.lighting}` : "공간 정보 확인 중"}
        </p>
        <p className="mt-3 text-13 font-medium text-brand">
          현장 확인 {application.visitAt ? formatDate(application.visitAt) : "예약 전"}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Card className="rounded-10">
          <h2 className="text-13 text-muted">공간 조건</h2>
          <div className="mt-3">
            <InfoRow label="전력" value={space?.electricity ?? "-"} />
            <InfoRow label="급수" value={space?.water ?? "-"} />
            <InfoRow label="면적" value={space?.area ?? "-"} />
          </div>
        </Card>
        <Card className="rounded-10">
          <h2 className="text-13 text-muted">비용과 책임</h2>
          <div className="mt-3">
            <InfoRow label="운영 조건" value="계약서에서 최종 확인" />
            <InfoRow label="시설 이상" value="FarmFi 관리자에게 접수" />
            <InfoRow label="교육 수료" value={
              application.educationDoneAt ? (
                <span className="text-brand">완료</span>
              ) : (
                "미완료"
              )
            } />
          </div>
        </Card>
      </div>

      <Card className="mt-4 rounded-10">
        <p className="text-18 font-bold text-brand">
          공간을 확정하면 7일 동안 다른 운영자에게 배정되지 않아요.
        </p>
        <p className="mt-2 text-12 text-muted">
          그 안에 계약을 서명하지 않으면 담당자 확인 후 가배정 상태로 돌아갈 수 있습니다.
        </p>
      </Card>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-6 space-y-3">
        <Button full disabled={busy} onClick={submit}>
          {busy ? "확정 중" : "이 공간으로 최종 확정"}
        </Button>
        <Button full variant="ghost" href="/operator/spaces">
          다른 공간 상담하기
        </Button>
      </div>
    </Shell>
  );
}
