"use client";

import { useCallback, useEffect, useState } from "react";

// 투자자 보호 3종(마일스톤 데드라인 · 타임아웃 실패 · 비례 환불)을 무대에서 클릭으로
// 시연하는 admin 콘솔. 세 API를 그대로 호출한다:
//   PATCH /api/milestones/[id]/deadline  (⚠️ 데모 전용 — 기한 당기기)
//   POST  /api/milestones/[id]/timeout   (기한 초과 → 실패 전환)
//   POST  /api/projects/[id]/refund      (남은 신탁 자금 비례 환불)

type Milestone = {
  id: string;
  seq: number;
  name: string;
  status: string;
  releaseAmount: number;
  deadlineAt: string | null;
};

type Escrow = {
  totalLocked: number;
  totalReleased: number;
  remaining: number;
  status: string;
} | null;

// /api/projects (목록) — 선택기 표시용
type ProjectSummary = { id: string; name: string; tokenSymbol: string | null };

// /api/projects/[id] (상세) — 보유내역까지 포함해 환불 미리보기를 계산한다.
type ProjectDetailData = {
  id: string;
  name: string;
  status: string;
  failedAt: string | null;
  tokenPrice: number | null;
  soldTokens: number;
  escrow: Escrow;
  milestones: Milestone[];
  tokenHoldings: { userId: string; amount: number }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function ddayLabel(deadlineAt: string | null): string {
  if (!deadlineAt) return "기한 미정";
  const diff = new Date(deadlineAt).getTime() - Date.now();
  return diff <= 0 ? "기한 초과" : `D-${Math.ceil(diff / DAY_MS)}`;
}

export function InvestorProtectionPanel() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetailData | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/projects", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("목록 로드 실패"))))
      .then((data: { projects?: (ProjectSummary & { tokenSymbol: string | null })[] }) => {
        if (!alive) return;
        // 모집 라운드만 대상 — 운영 전용 지점은 환불 개념이 없다.
        const list = (data.projects ?? []).filter((p) => p.tokenSymbol);
        setProjects(list);
        // 기본 선택은 데모 라운드(MF03) — /api/demo/step이 같은 심볼로 프로젝트를 찾는다.
        setSelectedId(
          (prev) =>
            prev ?? list.find((p) => p.tokenSymbol === "MF03")?.id ?? list[0]?.id ?? null
        );
      })
      .catch((err: Error) => alive && setMsg({ ok: false, text: err.message }));
    return () => {
      alive = false;
    };
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/projects/${selectedId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("프로젝트 상세를 불러오지 못했습니다.");
      setDetail((await res.json()) as ProjectDetailData);
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof Error ? err.message : "요청에 실패했습니다.",
      });
    }
  }, [selectedId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const milestones = [...(detail?.milestones ?? [])].sort((a, b) => a.seq - b.seq);
  // 실패 전환 대상 = 아직 집행되지 않은 단계 중 가장 앞선 것.
  const target =
    milestones.find((m) => m.status === "in_progress") ??
    milestones.find((m) => m.status === "verified") ??
    milestones.find((m) => m.status === "pending") ??
    null;

  // 환불 미리보기 — 서버 라우트와 같은 비례식으로 계산한다.
  //   refund_i = floor(구좌_i × 구좌단가 × remaining / totalLocked)
  const locked = detail?.escrow?.totalLocked ?? 0;
  const remaining = detail?.escrow?.remaining ?? 0;
  const tokenPrice = detail?.tokenPrice ?? 0;
  const heldTokens = (detail?.tokenHoldings ?? []).reduce((s, h) => s + h.amount, 0);
  const previewTotal =
    locked > 0
      ? (detail?.tokenHoldings ?? []).reduce(
          (sum, h) => sum + Math.floor((h.amount * tokenPrice * remaining) / locked),
          0
        )
      : 0;

  async function call(
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    successText: string
  ) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) {
        const detailText =
          typeof data?.remainingDays === "number"
            ? `${data.error} (남은 기간 ${data.remainingDays}일)`
            : String(data?.error ?? `HTTP ${res.status}`);
        setMsg({ ok: false, text: detailText });
        return;
      }
      const onchainNote =
        typeof data?.onchainError === "string"
          ? ` · 온체인 호출 revert(예상된 동작): ${data.onchainError}`
          : data?.txHash
            ? ` · txHash ${String(data.txHash).slice(0, 12)}…`
            : "";
      setMsg({ ok: true, text: `${successText}${onchainNote}` });
      await loadDetail();
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof Error ? err.message : "요청에 실패했습니다.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card" style={{ padding: 22 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
            투자자 보호 — 기한 초과 · 실패 전환 · 환불
          </p>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            기한 당기기(데모 전용) → 타임아웃 실패 전환 → 남은 신탁 자금 비례 환불 순서로
            실행합니다.
          </p>
        </div>
        <select
          value={selectedId ?? ""}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setDetail(null);
            setMsg(null);
          }}
          style={{ minHeight: 44, padding: "0 12px", borderRadius: 10 }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.tokenSymbol})
            </option>
          ))}
        </select>
      </div>

      {detail ? (
        <>
          <ul className="kv" style={{ marginTop: 16 }}>
            <li>
              <span className="muted">프로젝트 상태</span>
              <strong>
                {detail.status}
                {detail.failedAt
                  ? ` · 실패 ${new Date(detail.failedAt).toLocaleDateString("ko-KR")}`
                  : ""}
              </strong>
            </li>
            <li>
              <span className="muted">신탁 (상태 · 잔여 / 예치)</span>
              <strong>
                {detail.escrow?.status ?? "—"} · {won(remaining)} / {won(locked)}
              </strong>
            </li>
            <li>
              <span className="muted">실패 전환 대상 단계</span>
              <strong>
                {target
                  ? `${target.seq}. ${target.name} (${target.status} · ${ddayLabel(
                      target.deadlineAt
                    )})`
                  : "없음 (전 단계 집행 완료)"}
              </strong>
            </li>
            <li>
              <span className="muted">
                환불 대상 보유구좌 {heldTokens.toLocaleString("ko-KR")} / 판매{" "}
                {detail.soldTokens.toLocaleString("ko-KR")}구좌 · 예상 환불 총액
              </span>
              <strong>{won(previewTotal)}</strong>
            </li>
          </ul>

          <ul className="kv" style={{ marginTop: 12 }}>
            {milestones.map((m) => (
              <li key={m.id}>
                <span className="muted">
                  {m.seq}. {m.name} · {m.status}
                </span>
                <strong>
                  {ddayLabel(m.deadlineAt)}
                  {m.deadlineAt
                    ? ` (${new Date(m.deadlineAt).toLocaleDateString("ko-KR")})`
                    : ""}
                </strong>
              </li>
            ))}
          </ul>

          <div
            className="pill-row"
            style={{ gap: 10, marginTop: 18, flexWrap: "wrap" }}
          >
            <button
              type="button"
              className="ghost"
              style={{ minHeight: 52, padding: "0 20px" }}
              disabled={busy || !target}
              onClick={() =>
                target &&
                call(
                  `/api/milestones/${target.id}/deadline`,
                  "PATCH",
                  { daysFromNow: -1 },
                  `데모 전용: ${target.seq}단계 기한을 어제로 당겼습니다`
                )
              }
            >
              ① 기한 당기기 (데모 전용)
            </button>
            <button
              type="button"
              className="btn"
              style={{ minHeight: 52, padding: "0 20px" }}
              disabled={busy || !target}
              onClick={() =>
                target &&
                call(
                  `/api/milestones/${target.id}/timeout`,
                  "POST",
                  {},
                  `${target.seq}단계 기한 초과 → 프로젝트 실패 전환`
                )
              }
            >
              ② 타임아웃 실패 전환
            </button>
            <button
              type="button"
              className="btn"
              style={{ minHeight: 52, padding: "0 20px" }}
              disabled={busy || detail.status !== "failed"}
              onClick={() =>
                call(
                  `/api/projects/${detail.id}/refund`,
                  "POST",
                  {},
                  "남은 신탁 자금 비례 환불 완료"
                )
              }
            >
              ③ 비례 환불 실행
            </button>
          </div>

          {msg ? (
            <p
              style={{
                marginTop: 14,
                fontWeight: 800,
                color: msg.ok ? "var(--green-700)" : "#b02a2a",
              }}
            >
              {msg.text}
            </p>
          ) : null}

          <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
            ① 은 발표용 조작입니다. 실제 기한은 트랜치 집행 시각 + 180일로만 정해집니다.
            ② 의 온체인 <code>triggerTimeoutFailure()</code> 는 컨트랙트 가드
            (<code>block.timestamp &gt; milestoneDeadline</code>) 때문에 배포 후 180일 전에는
            revert합니다. 실패 사유를 그대로 표시하고 DB 상태로 시연을 진행합니다.
            ③ 은 DB 청약 기록(구좌 보유내역) 기준 비례 환불입니다. 컨트랙트{" "}
            <code>refund()</code> 는 원장에 직접 기록된 투자자 전용 경로라 앱
            청약분에는 쓸 수 없습니다.
          </p>
        </>
      ) : (
        <p className="muted" style={{ marginTop: 16 }}>
          {projects.length === 0 ? "펀딩 라운드가 없습니다." : "불러오는 중…"}
        </p>
      )}
    </article>
  );
}
