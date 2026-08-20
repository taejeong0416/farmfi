"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  InfoRow,
  PanelShell,
} from "@/components/ui";
import { shortDate } from "../api";
import { patchApplication, useOperatorApplication } from "../api";
import { ApplyStepLine } from "./ApplyStepLine";

const DOCUMENTS = [
  "공간 배정 확인서",
  "운영 기준서",
  "개인정보 · 전자서명 동의",
];

export function ApplyContractScreen() {
  const router = useRouter();
  const { data: application, refetch } = useOperatorApplication();
  const [agreed, setAgreed] = useState([false, false, false]);
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

  const start = application.confirmedAt
    ? new Date(application.confirmedAt)
    : new Date();
  const end = new Date(start);
  end.setFullYear(start.getFullYear() + 1);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await patchApplication(application!.id, {
        step: "contract",
        signature: "전자서명 동의",
      });
      await refetch();
      router.push("/operator/certificate");
    } catch (e) {
      setError(e instanceof Error ? e.message : "서명에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelShell>
      <ApplyStepLine application={application} current="contract" />

      <h1 className="text-24 font-bold text-ink">
        확정된 공간과 조건을 계약서로 확인해요
      </h1>
      <p className="mt-3 text-14 leading-6 text-body">
        공간·운영기간·정산 기준이 실제 협의 내용과 같은지 확인한 뒤 전자서명합니다.
      </p>

      <Card className="mt-7 rounded-14">
        <h2 className="text-20 font-bold text-ink">FarmFi 운영 계약서</h2>
        <div className="mt-4">
          <InfoRow label="운영 공간" value={application.region} />
          <InfoRow
            label="운영 기간"
            value={`${shortDate(start)} – ${shortDate(end)}`}
          />
          <InfoRow
            label="정산 기준"
            value="월별 운영 실적에 따라 계약서 기준 적용"
          />
          <InfoRow label="중도 해지" value="30일 전 통지 및 인수인계" />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {DOCUMENTS.map((d, i) => (
          <div
            key={d}
            className={`rounded-14 border px-5 py-5 ${
              agreed[i] ? "border-brand bg-brand-soft" : "border-line bg-white"
            }`}
          >
            <Checkbox
              label={<span className="text-14 font-medium text-ink">{d}</span>}
              checked={agreed[i]}
              onChange={(e) =>
                setAgreed((v) =>
                  v.map((x, idx) => (idx === i ? e.target.checked : x)),
                )
              }
            />
            <p
              className={`mt-3 text-12 ${agreed[i] ? "text-brand" : "text-muted"}`}
            >
              {agreed[i] ? "확인 완료" : "확인 필요"}
            </p>
          </div>
        ))}
      </div>

      <Card className="mt-4 rounded-14">
        <p className="text-15 font-bold text-ink">이해되지 않는 조항이 있나요?</p>
        <p className="mt-2 text-13 text-muted">
          서명 전에 담당자에게 질문하거나 계약 수정을 요청할 수 있어요.
        </p>
        <div className="mt-4">
          <Button full variant="ghost">
            담당자에게 문의
          </Button>
        </div>
      </Card>

      {error ? <p className="mt-4 text-12 text-danger">{error}</p> : null}

      <div className="mt-6">
        <Button full disabled={busy || !agreed.every(Boolean)} onClick={submit}>
          {busy ? "서명 중" : "계약 서명하기"}
        </Button>
      </div>
    </PanelShell>
  );
}
