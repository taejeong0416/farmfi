"use client";

import Link from "next/link";
import { Section } from "@/components/FarmFi";
import { InstitutionReportPanel } from "./InstitutionReportPanel";

// 관리자 · 기관 성과 뷰. 집계는 GET /api/reports/institution 을 화면에서 직접 호출한다.
export function AdminDashboard() {
  return (
    <main className="page">
      <Section
        title="관리자 · 기관 성과 리포트"
        desc="지점 운영 현황과 공간활용·생산·판매 성과를 기관 단위로 집계합니다."
      >
        <InstitutionReportPanel />
        <div className="pill-row" style={{ marginTop: 20, gap: 10 }}>
          <Link className="btn" href="/admin/verify">
            마일스톤 검증 콘솔 →
          </Link>
          <Link className="ghost" href="/admin/demo">
            데모 콘솔 →
          </Link>
        </div>
      </Section>
    </main>
  );
}
