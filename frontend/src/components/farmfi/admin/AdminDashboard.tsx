"use client";

import Link from "next/link";
import { Section, Panel } from "@/components/FarmFi";

// 관리자 · 기관 성과 뷰. 집계는 GET /api/reports/institution 로 제공하며,
// 상세 리포트 화면은 프론트엔드 담당이 구축한다.
export function AdminDashboard() {
  return (
    <main className="page">
      <Section
        title="관리자 · 기관 성과 리포트"
        desc="지점 운영 현황과 공간활용·생산·판매 성과를 기관 단위로 집계합니다."
      >
        <Panel title="성과 집계">
          <p className="muted">
            기관별 성과 데이터는 <code>GET /api/reports/institution?institutionId=</code> 로
            제공됩니다. 상세 리포트 화면은 준비 중입니다.
          </p>
        </Panel>
        <div style={{ marginTop: 20 }}>
          <Link className="btn" href="/admin/verify">
            마일스톤 검증 콘솔 →
          </Link>
        </div>
      </Section>
    </main>
  );
}
