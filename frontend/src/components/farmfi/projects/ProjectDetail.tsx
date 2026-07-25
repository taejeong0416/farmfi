"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SubscribeForm } from "./SubscribeForm";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/onchain";

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
  contractAddress: string | null;
} | null;
// GET /api/projects/[id] 가 최근 10건을 내려준다 (createdAt desc).
type Txn = {
  id: string;
  type: string;
  amount: number;
  tokenAmount: number | null;
  txHash: string | null;
  blockNumber: number | null;
  memo: string | null;
  createdAt: string;
};
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
  transactions: Txn[];
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

const TXN_LABEL: Record<string, string> = {
  subscription: "청약",
  tranche_release: "트랜치 집행",
  dividend: "배당",
  revenue: "매출",
};

function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

// 0x1234…abcd 형태로 줄인다 (주소·해시 공통).
function shortHex(v: string): string {
  return v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
}

export function ProjectDetail({ id }: { id: string }) {
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 청약 성공 후에도 다시 부르므로 콜백으로 분리 (잔여·판매 구좌 갱신).
  const load = useCallback(() => {
    fetch(`/api/projects/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setP)
      .catch(() => setError("프로젝트를 불러오지 못했습니다."));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
  const escrowUrl = p.escrow?.contractAddress
    ? explorerAddressUrl(p.escrow.contractAddress)
    : "";
  // txHash가 있는 거래만 온체인 증거로 취급한다. 컨트랙트 미배포/소진 구간에서는
  // 전부 null이므로 아래 카드 자체가 렌더링되지 않는다.
  const onchainTxns = (p.transactions ?? []).filter((t) => t.txHash);

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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        <Link className="link" href={`/monitoring/${id}`}>
          📈 이 지점 실시간 생육 환경 보기 →
        </Link>
        <Link className="link" href={`/optimization/${id}`}>
          🧠 AI 최적화 리포트 보기 →
        </Link>
      </div>

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
            <SubscribeForm project={p} onSubscribed={load} />
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
            {p.escrow?.contractAddress ? (
              <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
                컨트랙트{" "}
                {escrowUrl ? (
                  <a
                    className="link"
                    href={escrowUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginTop: 0, fontSize: 13 }}
                  >
                    {shortHex(p.escrow.contractAddress)} ↗
                  </a>
                ) : (
                  // 공개 탐색기가 없는 체인(OmniOne 등)에서는 주소 텍스트만 보여준다.
                  <code style={{ fontSize: 12 }}>{p.escrow.contractAddress}</code>
                )}
              </p>
            ) : null}
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

      {/* 온체인 증거 — 해시가 실제로 기록된 거래만 */}
      {onchainTxns.length > 0 ? (
        <article className="card" style={{ padding: 22, marginTop: 22 }}>
          <h3 style={{ marginTop: 0 }}>온체인 기록</h3>
          <ul style={{ display: "grid", gap: 12, marginTop: 14, listStyle: "none" }}>
            {onchainTxns.map((t) => {
              const url = explorerTxUrl(t.txHash!);
              return (
                <li
                  key={t.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    fontSize: 14,
                  }}
                >
                  <span>
                    <strong>{TXN_LABEL[t.type] ?? t.type}</strong>
                    <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                      {won(t.amount)}
                      {t.memo ? ` · ${t.memo}` : ""}
                    </span>
                  </span>
                  {url ? (
                    <a
                      className="link"
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginTop: 0, fontSize: 13 }}
                    >
                      {shortHex(t.txHash!)} ↗
                    </a>
                  ) : (
                    <code style={{ fontSize: 12 }}>{shortHex(t.txHash!)}</code>
                  )}
                </li>
              );
            })}
          </ul>
        </article>
      ) : null}
    </div>
  );
}
