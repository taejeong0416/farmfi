"use client";

import { useEffect, useState } from "react";

type Milestone = {
  id: string;
  seq: number;
  name: string;
  releasePct: number;
  releaseAmount: number;
  status: string;
  requiredSignals: string[];
};
type Project = {
  id: string;
  name: string;
  tokenSymbol: string | null;
  milestones: Milestone[];
};

type Signal = "contract" | "receipt" | "photo";
const SIGNAL_LABEL: Record<Signal, string> = {
  contract: "계약서",
  receipt: "영수증",
  photo: "현장 사진",
};
const DEMO_IMAGES: Record<Signal, { label: string; url: string }[]> = {
  contract: [{ label: "계약서(정상)", url: "/demo/mock-contract.jpg" }],
  receipt: [
    { label: "영수증(정상)", url: "/demo/mock-receipt-1.jpg" },
    { label: "영수증(위조)", url: "/demo/mock-receipt-2.jpg" },
  ],
  photo: [
    { label: "현장사진 A", url: "/demo/mock-photo-1.jpg" },
    { label: "현장사진 B", url: "/demo/mock-photo-3.jpg" },
  ],
};

function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      // data:image/...;base64,XXXX → 접두 제거 후 raw base64만 (ai-vision 규격)
      resolve(s.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  return blobToBase64(await res.blob());
}

type VerifyResult = {
  passed: boolean;
  signals: Record<string, boolean>;
  retryCount: number;
  txHash: string | null;
};

export function MilestoneVerifyPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [images, setImages] = useState<Partial<Record<Signal, string>>>({});
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [completeMsg, setCompleteMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d: { projects: Project[] }) => {
        const fundable = d.projects.filter(
          (p) => p.tokenSymbol && p.milestones.length > 0
        );
        setProjects(fundable);
      })
      .catch(() => setError("프로젝트를 불러오지 못했습니다."));
  }, []);

  const project = projects.find((p) => p.id === projectId);
  const milestone = project?.milestones.find((m) => m.id === milestoneId);
  const imageSignals = (milestone?.requiredSignals ?? []).filter(
    (s): s is Signal => s === "contract" || s === "receipt" || s === "photo"
  );

  function selectProject(id: string) {
    setProjectId(id);
    setVerify(null);
    setCompleteMsg(null);
    setImages({});
    const p = projects.find((x) => x.id === id);
    const active =
      p?.milestones.find((m) => m.status === "in_progress") ??
      p?.milestones[0];
    setMilestoneId(active?.id ?? "");
  }

  async function loadImage(signal: Signal, source: Promise<string>) {
    try {
      const b64 = await source;
      setImages((prev) => ({ ...prev, [signal]: b64 }));
    } catch {
      setError("이미지를 불러오지 못했습니다.");
    }
  }

  async function runVerify() {
    if (!milestone) return;
    setBusy(true);
    setError(null);
    setVerify(null);
    setCompleteMsg(null);
    try {
      const res = await fetch(`/api/milestones/${milestone.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractImage: images.contract,
          receiptImage: images.receipt,
          photoImage: images.photo,
          milestoneType: milestone.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "검증 실패");
      setVerify(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "검증에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function runComplete() {
    if (!milestone) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/milestones/${milestone.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "집행 실패");
      setCompleteMsg(
        `트랜치 ${won(milestone.releaseAmount)} 집행 완료` +
          (data.txHash ? ` · tx ${String(data.txHash).slice(0, 12)}…` : "")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "집행에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card chart">
      <h3>마일스톤 검증 · 트랜치 집행</h3>
      <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
        {/* 프로젝트 선택 */}
        <div>
          <p className="muted" style={{ marginBottom: 6 }}>
            프로젝트
          </p>
          <select
            className="input"
            value={projectId}
            onChange={(e) => selectProject(e.target.value)}
          >
            <option value="">선택하세요</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.tokenSymbol})
              </option>
            ))}
          </select>
        </div>

        {/* 마일스톤 선택 */}
        {project ? (
          <div>
            <p className="muted" style={{ marginBottom: 6 }}>
              마일스톤
            </p>
            <select
              className="input"
              value={milestoneId}
              onChange={(e) => {
                setMilestoneId(e.target.value);
                setVerify(null);
                setCompleteMsg(null);
                setImages({});
              }}
            >
              {project.milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.seq}. {m.name} · {(m.releasePct / 100).toFixed(0)}% ·{" "}
                  {m.status}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* 증빙 이미지 */}
        {milestone ? (
          <>
            {imageSignals.length === 0 ? (
              <p className="muted">
                이 마일스톤은 이미지 증빙이 없습니다 (IoT/자동 검증).
              </p>
            ) : (
              imageSignals.map((s) => (
                <div key={s}>
                  <p style={{ fontWeight: 700, marginBottom: 6 }}>
                    {SIGNAL_LABEL[s]}{" "}
                    {images[s] ? (
                      <span
                        className="badge"
                        style={{ background: "var(--green-700)" }}
                      >
                        불러옴
                      </span>
                    ) : null}
                  </p>
                  <div className="pill-row" style={{ gap: 8 }}>
                    {DEMO_IMAGES[s].map((d) => (
                      <button
                        key={d.url}
                        type="button"
                        className="ghost"
                        style={{ minHeight: 36, padding: "0 14px" }}
                        onClick={() => loadImage(s, urlToBase64(d.url))}
                      >
                        {d.label}
                      </button>
                    ))}
                    <label
                      className="ghost"
                      style={{
                        minHeight: 36,
                        padding: "0 14px",
                        cursor: "pointer",
                      }}
                    >
                      파일 업로드
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) loadImage(s, blobToBase64(f));
                        }}
                      />
                    </label>
                  </div>
                </div>
              ))
            )}

            <button
              className="btn"
              type="button"
              disabled={busy || imageSignals.some((s) => !images[s])}
              onClick={runVerify}
            >
              {busy ? "검증 중…" : "AI 검증 실행"}
            </button>
          </>
        ) : null}

        {/* 검증 결과 */}
        {verify ? (
          <div
            className="soft-card"
            style={{ padding: 16, borderRadius: 12, background: "var(--soft)" }}
          >
            <ul className="kv">
              {Object.entries(verify.signals).map(([k, ok]) => (
                <li key={k}>
                  <span className="muted">{k}</span>
                  <strong style={{ color: ok ? "var(--green-700)" : "#c0392b" }}>
                    {ok ? "통과 ✓" : "미통과 ✗"}
                  </strong>
                </li>
              ))}
            </ul>
            <p
              style={{
                marginTop: 12,
                fontWeight: 800,
                color: verify.passed ? "var(--green-700)" : "#c0392b",
              }}
            >
              {verify.passed
                ? "전체 검증 통과 — 트랜치 집행 가능"
                : `검증 미통과 (재시도 ${verify.retryCount}회)`}
            </p>
            {verify.passed ? (
              <button
                className="btn"
                type="button"
                disabled={busy}
                style={{ marginTop: 12 }}
                onClick={runComplete}
              >
                {busy ? "집행 중…" : "트랜치 집행하기 →"}
              </button>
            ) : null}
          </div>
        ) : null}

        {completeMsg ? (
          <p style={{ color: "var(--green-700)", fontWeight: 800 }}>
            {completeMsg}
          </p>
        ) : null}
        {error ? <p style={{ color: "#c0392b" }}>{error}</p> : null}
      </div>
    </article>
  );
}
