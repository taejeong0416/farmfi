"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Milestone = {
  id: string;
  seq: number;
  name: string;
  releasePct: number;
  releaseAmount: number;
  status: string;
  conditionText: string | null;
};
type Escrow = {
  totalLocked: number;
  totalReleased: number;
  remaining: number;
  status: string;
} | null;
type Project = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  tokenSymbol: string | null;
  tokenPrice: number | null;
  soldTokens: number;
  totalTokens: number | null;
  targetAmount: number | null;
  currentAmount: number;
  status: string;
  escrow: Escrow;
  milestones: Milestone[];
};

const STATUS_LABEL: Record<string, string> = {
  upcoming: "모집 예정",
  funding: "모집 중",
  funded: "모집 완료",
  operating: "운영 중",
  paused: "중단",
  completed: "청산",
};

const MS_STATUS: Record<string, { label: string; color: string }> = {
  completed: { label: "완료", color: "var(--green-700)" },
  verified: { label: "검증됨", color: "var(--green-600)" },
  in_progress: { label: "진행 중", color: "#c68a12" },
  pending: { label: "대기", color: "#c7cdc9" },
  failed: { label: "실패", color: "#c0392b" },
  manual_review: { label: "수동 검토", color: "#c0392b" },
};

function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

export function ProjectDetail({ id }: { id: string }) {
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setP)
      .catch(() => setError("프로젝트를 불러오지 못했습니다."));
  }, [id]);

  if (error)
    return (
      <div className="shell">
        <p className="muted">{error}</p>
      </div>
    );
  if (!p)
    return (
      <div className="shell">
        <p className="muted">불러오는 중…</p>
      </div>
    );

  const target = p.targetAmount ?? 0;
  const pct =
    target > 0 ? Math.min(100, Math.round((p.currentAmount / target) * 100)) : 0;
  const isFundable = !!p.tokenSymbol;

  return (
    <div className="shell">
      <Link className="link" href="/projects">
        ← 프로젝트 목록
      </Link>

      <div className="section-head" style={{ marginTop: 16, alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>{p.name}</h1>
          {p.location ? <p className="muted">{p.location}</p> : null}
        </div>
        <span className="badge">{STATUS_LABEL[p.status] ?? p.status}</span>
      </div>

      {p.description ? (
        <p className="lead" style={{ marginTop: 12 }}>
          {p.description}
        </p>
      ) : null}

      {isFundable ? (
        <div className="grid-2" style={{ marginTop: 24 }}>
          {/* 펀딩 현황 */}
          <article className="card" style={{ padding: 22 }}>
            <h3 style={{ marginTop: 0 }}>펀딩 현황</h3>
            <div className="progress" style={{ marginTop: 14 }}>
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
                / 1구좌 ({p.tokenSymbol})
              </span>
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              발행 {(p.totalTokens ?? 0).toLocaleString("ko-KR")}구좌 · 판매{" "}
              {p.soldTokens.toLocaleString("ko-KR")}구좌
            </p>
            <Link
              className="btn"
              href="/login"
              style={{ marginTop: 16, width: "100%" }}
            >
              청약하기 →
            </Link>
          </article>

          {/* 에스크로 */}
          <article className="card" style={{ padding: 22 }}>
            <h3 style={{ marginTop: 0 }}>에스크로 (스마트컨트랙트)</h3>
            <ul className="kv" style={{ marginTop: 10 }}>
              <li>
                <span className="muted">잠긴 금액</span>
                <strong>{won(p.escrow?.totalLocked ?? 0)}</strong>
              </li>
              <li>
                <span className="muted">집행 완료</span>
                <strong>{won(p.escrow?.totalReleased ?? 0)}</strong>
              </li>
              <li>
                <span className="muted">잔여</span>
                <strong>{won(p.escrow?.remaining ?? 0)}</strong>
              </li>
            </ul>
            <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              마일스톤 검증을 통과할 때마다 코드가 트랜치를 단계 집행합니다.
            </p>
          </article>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 24 }}>
          운영 전용 지점입니다 (투자 모집 없음).
        </p>
      )}

      {/* 마일스톤 타임라인 */}
      {p.milestones.length > 0 ? (
        <article className="card" style={{ padding: 22, marginTop: 22 }}>
          <h3 style={{ marginTop: 0 }}>마일스톤 집행 단계</h3>
          <ul className="timeline" style={{ marginTop: 16 }}>
            {p.milestones.map((m) => {
              const s = MS_STATUS[m.status] ?? {
                label: m.status,
                color: "#c7cdc9",
              };
              return (
                <li key={m.id}>
                  <i style={{ background: s.color }} />
                  <span>
                    {m.seq}. {m.name}
                    <span className="muted" style={{ marginLeft: 8 }}>
                      {(m.releasePct / 100).toFixed(0)}% · {won(m.releaseAmount)}
                    </span>
                  </span>
                  <span style={{ color: s.color, fontWeight: 800, fontSize: 13 }}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </article>
      ) : null}
    </div>
  );
}
