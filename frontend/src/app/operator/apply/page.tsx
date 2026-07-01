"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Hero, Panel, Section } from "@/components/FarmFi";
import { useAuth } from "@/lib/useAuth";
import { formatDate } from "@/lib/format";
import { ApplicationForm } from "@/components/farmfi/operator/ApplicationForm";
import { ApplicationStepper } from "@/components/farmfi/operator/ApplicationStepper";
import {
  fetchMyOperatorApplications,
  operatorApplicationsQueryKey,
} from "@/components/farmfi/operator/api";

export default function OperatorApplyPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: applications, isLoading: applicationsLoading } = useQuery({
    queryKey: operatorApplicationsQueryKey(),
    queryFn: fetchMyOperatorApplications,
    enabled: isAuthenticated,
  });

  const myApplication = applications?.[0] ?? null;
  const isLoading = authLoading || (isAuthenticated && applicationsLoading);

  return (
    <main className="page">
      <Hero
        art="operator"
        eyebrow="운영자 지원 · 합류"
        title="FarmFi 운영 파트너로"
        green="합류하기"
        lead="지원서 제출부터 서류 검토, 운영 교육, 공간 매칭까지 — 운영 파트너가 되는 절차를 한눈에 확인하고 진행 상황을 추적하세요."
        actions={
          <>
            <Link className="btn" href="#status">
              지원 현황 보기 →
            </Link>
            <Link className="ghost" href="/operator">
              운영자 소개 보기
            </Link>
          </>
        }
        chips={["검증된 플랫폼", "지속가능한 수익", "든든한 파트너십"]}
      />

      <Section
        title="운영 파트너 합류 절차"
        desc="지원서 제출 → 서류/인터뷰 → 운영 교육 → 공간 매칭 → 운영 시작, 5단계로 진행됩니다."
      >
        <Panel title="합류까지 5단계">
          <ApplicationStepper status={myApplication?.status ?? "applied"} />
        </Panel>
      </Section>

      <section className="section" id="status">
        <div className="shell">
          {isLoading ? (
            <p className="muted">불러오는 중...</p>
          ) : !isAuthenticated ? (
            <ApplicationForm isAuthenticated={false} />
          ) : myApplication ? (
            <CurrentApplicationStatus
              application={myApplication}
            />
          ) : (
            <ApplicationForm isAuthenticated={isAuthenticated} />
          )}
        </div>
      </section>
    </main>
  );
}

const STATUS_LABEL: Record<string, string> = {
  applied: "지원서 제출 완료",
  docs: "서류/인터뷰 진행 중",
  education: "운영 교육 진행 중",
  matched: "공간 매칭 진행 중",
  operating: "운영 중",
};

function CurrentApplicationStatus({
  application,
}: {
  application: {
    region: string;
    cropExperience: string;
    availableHours: string;
    status: string;
    createdAt: string;
  };
}) {
  return (
    <article className="card form-panel">
      <h2>내 지원 현황</h2>
      <p className="muted" style={{ marginTop: 8 }}>
        {application.createdAt ? `${formatDate(application.createdAt)} 접수` : ""} · 현재 단계:{" "}
        {STATUS_LABEL[application.status] ?? application.status}
      </p>
      <div className="kv">
        <div>
          <span>희망 지역</span>
          <b>{application.region}</b>
        </div>
        <div>
          <span>재배 경험</span>
          <b>{application.cropExperience}</b>
        </div>
        <div>
          <span>운영 가능 시간</span>
          <b>{application.availableHours}</b>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 18 }}>
        이미 지원서를 제출하셨습니다. 다음 단계는 담당자가 확인 후 개별 안내드려요.
      </p>
    </article>
  );
}
