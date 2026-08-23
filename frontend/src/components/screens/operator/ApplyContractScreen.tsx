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
  SkeletonBlock,
} from "@/components/ui";
import { shortDate } from "../api";
import {
  requestContractSignature,
  useOperatorApplication,
  useOperatorContract,
} from "../api";
import { ApplyStepLine } from "./ApplyStepLine";

const CHECKS = ["공간 배정 확인서", "운영 기준서", "개인정보 · 전자서명 동의"];

export function ApplyContractScreen() {
  const router = useRouter();
  const { data: application } = useOperatorApplication();
  const { data, isLoading, refetch } = useOperatorContract();
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

  if (isLoading) {
    return (
      <PanelShell>
        <SkeletonBlock height={420} />
      </PanelShell>
    );
  }

  const contract = data?.contract ?? null;

  if (!contract) {
    return (
      <PanelShell>
        <ApplyStepLine application={application} current="contract" />
        <EmptyState
          title="아직 계약서가 없어요"
          desc="공간을 먼저 확정하면 확정된 조건으로 계약서가 만들어집니다."
          action={<Button href="/operator/apply/confirm">공간 확정하러 가기</Button>}
        />
      </PanelShell>
    );
  }

  const signed = contract.status === "SIGNED";
  const requested = contract.status === "SIGNATURE_REQUESTED";

  async function sign() {
    if (!contract) return;
    setBusy(true);
    setError(null);
    try {
      // 무엇에 서명하는지 확인한 시점을 먼저 남기고, 그다음에 서명한다.
      if (!requested) await requestContractSignature(contract.id);
      await requestContractSignature(contract.id, "전자서명 동의");
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
          <InfoRow label="운영 지역" value={application.region} />
          <InfoRow
            label="운영 기간"
            value={
              contract.termStart && contract.termEnd
                ? `${shortDate(new Date(contract.termStart))} – ${shortDate(new Date(contract.termEnd))}`
                : "확정 후 표시"
            }
          />
          <InfoRow label="계약서 판" value={`${contract.contentHash.slice(0, 12)}…`} />
        </div>
        <p className="mt-5 max-h-[320px] overflow-y-auto whitespace-pre-wrap border-t border-line-soft pt-5 text-13 leading-6 text-body">
          {contract.body}
        </p>
      </Card>

      {signed ? (
        <Card className="mt-4 rounded-14 border-brand bg-brand-soft">
          <p className="text-15 font-bold text-ink">서명을 마쳤어요</p>
          <p className="mt-2 text-13 text-body">
            {contract.signedAt ? shortDate(new Date(contract.signedAt)) : ""} 서명 ·
            보증서 발급 화면에서 이어서 확인할 수 있어요.
          </p>
          <div className="mt-4">
            <Button full href="/operator/certificate">
              보증서 확인
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {CHECKS.map((d, i) => (
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
            <p className="text-15 font-bold text-ink">
              이해되지 않는 조항이 있나요?
            </p>
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
            <Button
              full
              disabled={busy || !agreed.every(Boolean)}
              onClick={sign}
            >
              {busy ? "서명 중" : "계약 서명하기"}
            </Button>
          </div>
        </>
      )}
    </PanelShell>
  );
}
