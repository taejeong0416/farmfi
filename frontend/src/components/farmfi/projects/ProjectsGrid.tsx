"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Project = {
  id: string;
  name: string;
  location: string | null;
  tokenSymbol: string | null;
  tokenPrice: number | null;
  soldTokens: number;
  totalTokens: number | null;
  targetAmount: number | null;
  currentAmount: number;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  upcoming: "모집 예정",
  funding: "모집 중",
  funded: "모집 완료",
  operating: "운영 중",
  paused: "중단",
  completed: "청산",
};

function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function ProjectCard({ p }: { p: Project }) {
  const target = p.targetAmount ?? 0;
  const pct =
    target > 0 ? Math.min(100, Math.round((p.currentAmount / target) * 100)) : 0;

  return (
    <article className="card project-card">
      <div className="project-body">
        <div
          className="section-head"
          style={{ marginBottom: 8, alignItems: "center" }}
        >
          <h3 style={{ margin: 0 }}>{p.name}</h3>
          <span className="badge">{STATUS_LABEL[p.status] ?? p.status}</span>
        </div>
        {p.location ? <p className="muted">{p.location}</p> : null}

        {p.tokenSymbol ? (
          <>
            <div className="progress" style={{ marginTop: 16 }}>
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${pct}%`,
                  background: "var(--green-700)",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 8,
              }}
            >
              <span className="muted">
                {won(p.currentAmount)} / {won(target)}
              </span>
              <strong style={{ color: "var(--green-700)" }}>{pct}%</strong>
            </div>
            <div className="price">
              {won(p.tokenPrice ?? 0)}{" "}
              <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
                / 1구좌
              </span>
            </div>
            <Link
              className="btn"
              href={`/projects/${p.id}`}
              style={{ marginTop: 18, width: "100%" }}
            >
              자세히 보기 →
            </Link>
          </>
        ) : (
          <p className="muted" style={{ marginTop: 16 }}>
            운영 전용 지점 (모집 없음)
          </p>
        )}
      </div>
    </article>
  );
}

export function ProjectsGrid() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d: { projects: Project[] }) => setProjects(d.projects))
      .catch(() => setError("프로젝트를 불러오지 못했습니다."));
  }, []);

  if (error) return <p className="muted">{error}</p>;
  if (!projects)
    return (
      <div className="grid-3" aria-busy="true" aria-label="프로젝트 불러오는 중">
        {[0, 1, 2].map((i) => (
          <div className="card skeleton-card" key={i}>
            <div className="skeleton-line" style={{ width: "55%" }} />
            <div className="skeleton-line" style={{ width: "35%" }} />
            <div className="skeleton-line" style={{ marginTop: 28 }} />
            <div className="skeleton-line" style={{ width: "70%" }} />
          </div>
        ))}
      </div>
    );
  if (projects.length === 0)
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <p style={{ fontWeight: 700 }}>지금은 모집 중인 라운드가 없습니다.</p>
        <p className="muted">
          새 지점 라운드가 열리면 이곳에 표시됩니다. 운영 중인 지점 현황은
          대시보드에서 볼 수 있어요.
        </p>
        <Link className="outline" href="/dashboard" style={{ marginTop: 18 }}>
          운영 현황 보기 →
        </Link>
      </div>
    );

  return (
    <div className="grid-3">
      {projects.map((p) => (
        <ProjectCard key={p.id} p={p} />
      ))}
    </div>
  );
}
