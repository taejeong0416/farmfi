"use client";

import { Button, Card, EmptyState, Shell } from "@/components/ui";
import { useAuth } from "@/lib/useAuth";
import { shortDate, useOperatorApplication } from "../api";

const HOW_TO = [
  "운영자 앱에서 ‘보증서 인증’ 선택",
  "보증서 번호 입력 또는 QR 스캔",
  "인증되면 배정 매장 화면이 열립니다",
];

export function CertificateScreen() {
  const { user } = useAuth();
  const { data: application } = useOperatorApplication();

  if (!application?.certificateNo) {
    return (
      <Shell>
        <EmptyState
          title="아직 보증서가 발급되지 않았습니다"
          desc="계약 서명을 마치면 보증서가 발급됩니다."
          action={<Button href="/operator/apply/contract">계약 확인</Button>}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-28 font-bold text-ink">운영 준비가 모두 확인됐어요</h1>
      <p className="mt-3 text-14 text-body">
        이 보증서는 운영자 자격과 배정 공간을 증명하며, 운영자 앱에서 인증할 때 사용합니다.
      </p>

      <div className="mt-8 flex items-start gap-8">
        <div className="flex-1 rounded-14 bg-brand px-8 py-8">
          <p className="text-13 font-medium text-brand-soft">
            FarmFi OPERATOR GUARANTEE
          </p>
          <p className="mt-3 text-28 font-bold text-white">운영자 보증서</p>

          <div className="mt-8 grid grid-cols-2 gap-y-6">
            <Item label="운영자" value={user?.realName ?? user?.name ?? "-"} big />
            <Item label="배정 공간" value={application.region} big />
            <Item label="보증서 번호" value={application.certificateNo} />
            <Item
              label="발급일"
              value={shortDate(application.certificateIssuedAt)}
            />
          </div>

          <p className="mt-8 text-12 text-brand-soft">
            공간 배정과 운영 자격이 유효한 동안 사용할 수 있습니다.
          </p>
          <p className="mt-2 font-num text-11 text-brand-soft">
            검증 번호 {application.id.slice(-12).toUpperCase()}
          </p>
        </div>

        <Card className="w-[400px] shrink-0">
          <h2 className="text-17 font-bold text-ink">보증서 사용 방법</h2>
          <ol className="mt-5 space-y-5">
            {HOW_TO.map((t, i) => (
              <li key={t} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-11 font-bold text-brand">
                  {i + 1}
                </span>
                <span className="text-12 font-medium text-ink">{t}</span>
              </li>
            ))}
          </ol>

          <div className="mt-7">
            <Button full href="/operator">
              개점 준비 현황 보기
            </Button>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function Item({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div>
      <p className="text-11 font-medium text-brand-soft">{label}</p>
      <p
        className={`mt-1.5 font-medium text-white ${big ? "text-20" : "font-num text-15"}`}
      >
        {value}
      </p>
    </div>
  );
}
