"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell, GreenBand, Hero, Metric, Panel, Section } from "@/components/FarmFi";

type OperatorMilestone = { status: string };

type OperatorProject = {
  id: string;
  name: string;
  location: string | null;
  status: string;
  fundingPercent: number;
  milestones: OperatorMilestone[];
};

async function fetchProjects(): Promise<{ projects: OperatorProject[] }> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

const STATUS_LABEL: Record<string, string> = {
  upcoming: "오픈 예정",
  funding: "모집 중",
  funded: "모집 완료",
  operating: "운영 중",
  completed: "운영 종료",
};

export default function OperatorPage() {
  // No operator-scoped endpoint exists yet (ProjectPartner only tracks
  // landlord/equipment_partner roles, not operator — see prisma/schema.prisma).
  // Until an operator↔project link ships, show real platform-wide project
  // data from GET /api/projects instead of a fabricated "my projects" view.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["projects", "operator"],
    queryFn: fetchProjects,
  });

  const projects = data?.projects ?? [];

  return (
    <main className="page">
      <Hero
        art="operator"
        title="스마트팜 운영의 새로운 기회,"
        green="FarmFi 운영 파트너"
        lead="FarmFi는 공간, 기술, 자본을 연결하고 운영 파트너와 함께 스마트한 지속가능 농업 생태계를 만들어갑니다."
        actions={
          <>
            <Link className="btn" href="#apply">
              운영자 지원하기 →
            </Link>
            <Link className="ghost" href="/dashboard">
              대시보드 보기
            </Link>
          </>
        }
        chips={["검증된 플랫폼", "지속가능한 수익", "든든한 파트너십"]}
      />
      <Section title="운영 파트너 혜택">
        <div className="grid-4">
          <Metric label="공간 매칭 지원" value="입지 분석" />
          <Metric label="전문 교육 제공" value="운영 매뉴얼" />
          <Metric label="수익 참여" value="성과 기반" />
          <Metric label="커뮤니티 지원" value="네트워크" />
        </div>
      </Section>
      <Section
        title="현재 운영 가능한 프로젝트"
        desc="운영 파트너를 찾고 있거나 이미 운영 중인 FarmFi 프로젝트 현황입니다."
      >
        {isLoading ? (
          <p className="muted">불러오는 중...</p>
        ) : isError || projects.length === 0 ? (
          <p className="muted">현재 등록된 프로젝트가 없습니다.</p>
        ) : (
          <div className="grid-3">
            {projects.map((p) => {
              const milestoneTotal = p.milestones.length;
              const milestoneDone = p.milestones.filter(
                (m) => m.status === "completed",
              ).length;
              return (
                <Panel key={p.id} title={p.name}>
                  <p className="muted">⌖ {p.location ?? "위치 미정"}</p>
                  <div className="kv" style={{ marginTop: 12 }}>
                    <div>
                      <span>상태</span>
                      <b>{STATUS_LABEL[p.status] ?? p.status}</b>
                    </div>
                    <div>
                      <span>모집률</span>
                      <b>{Math.round(p.fundingPercent)}%</b>
                    </div>
                    <div>
                      <span>마일스톤</span>
                      <b>
                        {milestoneDone}/{milestoneTotal}
                      </b>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </Section>
      <Section title="운영자 지원 신청">
        <div className="grid-2" id="apply">
          <Panel title="지원서 제출">
            {["이름 / 팀명", "희망 지역", "재배 경험", "운영 가능 시간", "전문 분야"].map((item) => (
              <div className="fake-control" style={{ marginTop: 12 }} key={item}>
                {item}
              </div>
            ))}
            <button className="btn" style={{ width: "100%", marginTop: 18 }}>
              지원서 제출하기
            </button>
          </Panel>
          <Panel title="운영 파트너 합류 절차">
            {["지원서 제출", "서류/인터뷰", "운영 교육", "공간 매칭", "운영 시작"].map((item, i) => (
              <p className="muted" key={item}>
                0{i + 1} · {item}
              </p>
            ))}
          </Panel>
        </div>
      </Section>
      <DashboardShell operator />
      <GreenBand text="지금 바로 FarmFi 운영 파트너로 첫 걸음을 시작하세요" />
    </main>
  );
}
