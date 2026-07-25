"use client";

import { useState } from "react";

// POST /api/demo/step 이 실제로 실행하는 시나리오 (route.ts: buildStepExecutors).
// 3호점(MF03) 시드 3,480구좌 + 잔여 920구좌 청약 = 4,400구좌 완납 → escrow 4,400만 →
// 마일스톤 seq1~4 순차 집행(트랜치 합계 4,400만, 잔여 0) + 스텝7 수수료 풀 배당.
const STEPS: { step: number; title: string; detail: string }[] = [
  { step: 1, title: "청약 · 김투자", detail: "300구좌 매수 (잔여 920 → 620)" },
  { step: 2, title: "청약 · 이서연", detail: "200구좌 매수 (잔여 620 → 420)" },
  { step: 3, title: "청약 · 박준혁", detail: "420구좌 매수 · 4,400구좌 완납(funded)" },
  { step: 4, title: "마일스톤 1 · 공간 준비", detail: "계약서·영수증·사진 AI 검증 → 트랜치 15,400,000원 집행" },
  { step: 5, title: "마일스톤 2 · 시운전", detail: "IoT 14일 가동률 검증 → 트랜치 13,200,000원 집행" },
  { step: 6, title: "마일스톤 3 · 수확", detail: "판매 영수증·수확 사진 검증 → 트랜치 8,800,000원 집행" },
  { step: 7, title: "배당 분배", detail: "월 매출 1,400,000원 → 수수료 풀 380,000원 · 투자자 배당 228,000원(1좌 51원)" },
  { step: 8, title: "마일스톤 4 · 지속운영", detail: "IoT 60일 + 판매 실적 검증 → 트랜치 6,600,000원 집행 (잔여 0)" },
];

type DemoMode = "live" | "cached";

type StepResult = {
  phase: "running" | "done" | "error";
  ok?: boolean;
  fromCache?: boolean;
  headline?: string;
  txHash?: string | null;
  signals?: [string, boolean][];
  raw?: unknown;
  elapsedMs?: number;
};

type Json = Record<string, unknown>;

function asObject(v: unknown): Json | null {
  return v && typeof v === "object" ? (v as Json) : null;
}

// 서버 isStepSuccess()와 동일 판정: error 필드가 있으면 실패,
// 마일스톤 스텝(verify 존재)은 verify.passed === true 여야 성공.
function stepSucceeded(result: unknown): boolean {
  const r = asObject(result);
  if (!r) return false;
  if (r.error) return false;
  if ("verify" in r) return asObject(r.verify)?.passed === true;
  return true;
}

// 서버 extractTxHash()와 동일 우선순위: complete → verify → 최상위.
function extractTxHash(result: unknown): string | null {
  const r = asObject(result);
  if (!r) return null;
  const complete = asObject(r.complete);
  const verify = asObject(r.verify);
  const hash =
    complete?.txHash ?? verify?.txHash ?? r.txHash ?? null;
  return typeof hash === "string" ? hash : null;
}

function extractSignals(result: unknown): [string, boolean][] | undefined {
  const verify = asObject(asObject(result)?.verify);
  const signals = asObject(verify?.signals);
  if (!signals) return undefined;
  return Object.entries(signals).map(([k, v]) => [k, v === true]);
}

function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

// 스텝 유형별 한 줄 요약 — 무대에서 JSON을 읽지 않아도 되도록.
function headline(result: unknown): string {
  const r = asObject(result);
  if (!r) return "응답 형식을 해석할 수 없습니다.";
  if (r.error) return String(r.error);

  const tx = asObject(r.transaction);
  if (tx) {
    return `${Number(tx.tokenAmount).toLocaleString("ko-KR")}구좌 · ${won(
      Number(tx.amount)
    )} 청약 체결`;
  }

  if ("verify" in r) {
    const verify = asObject(r.verify);
    if (verify?.passed !== true) {
      return `AI 검증 미통과 (재시도 ${Number(verify?.retryCount ?? 0)}회) — 트랜치 미집행`;
    }
    const complete = asObject(r.complete);
    return complete
      ? "AI 검증 통과 → 에스크로 트랜치 집행 완료"
      : "AI 검증 통과 (집행 응답 없음)";
  }

  // /api/dividends/distribute 응답의 Dividend 행 — totalDividend(투자자 배당 총액)·perToken(1좌당).
  const dividend = asObject(r.dividend);
  if (dividend) {
    const total = dividend.totalDividend;
    if (total == null) return "배당 분배 완료";
    const perToken = dividend.perToken;
    return perToken != null
      ? `배당 분배 완료 · 총 ${won(Number(total))} · 1좌당 ${won(Number(perToken))}`
      : `배당 분배 완료 · 총 ${won(Number(total))}`;
  }

  return "완료";
}

export function DemoConsole() {
  const [mode, setMode] = useState<DemoMode>("live");
  const [results, setResults] = useState<Record<number, StepResult>>({});
  const [busy, setBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  async function runStep(step: number) {
    setBusy(true);
    setResetMsg(null);
    setResults((prev) => ({ ...prev, [step]: { phase: "running" } }));
    const startedAt = Date.now();

    try {
      const res = await fetch("/api/demo/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ step, mode }),
      });
      const data = await res.json();
      const elapsedMs = Date.now() - startedAt;

      if (!res.ok) {
        setResults((prev) => ({
          ...prev,
          [step]: {
            phase: "error",
            ok: false,
            headline: String(data?.detail ?? data?.error ?? `HTTP ${res.status}`),
            raw: data,
            elapsedMs,
          },
        }));
        return;
      }

      const result = data?.result;
      setResults((prev) => ({
        ...prev,
        [step]: {
          phase: "done",
          ok: stepSucceeded(result),
          fromCache: data?.fromCache === true,
          headline: headline(result),
          txHash: extractTxHash(result),
          signals: extractSignals(result),
          raw: result,
          elapsedMs,
        },
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [step]: {
          phase: "error",
          ok: false,
          headline: err instanceof Error ? err.message : "요청에 실패했습니다.",
          elapsedMs: Date.now() - startedAt,
        },
      }));
    } finally {
      setBusy(false);
    }
  }

  async function runReset() {
    if (!window.confirm("데모 데이터를 초기 상태로 되돌립니다. 진행할까요?")) return;
    setBusy(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/demo/reset", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setResetMsg(`리셋 실패 · ${String(data?.detail ?? data?.error ?? res.status)}`);
        return;
      }
      setResults({});
      setResetMsg(
        `리셋 완료 · 프로젝트 ${data.projects}건 · 품목 ${data.products}종 · 운영자 ${data.operator}`
      );
    } catch (err) {
      setResetMsg(err instanceof Error ? err.message : "리셋 요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* 실행 모드 · 리셋 */}
      <article className="card" style={{ padding: 22 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            justifyContent: "space-between",
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 800 }}>실행 모드</p>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              live = 컨트랙트·AI 실호출 / cached = 저장된 결과 재생 (캐시 미스 시 실호출로 폴백)
            </p>
          </div>
          <div className="pill-row" style={{ gap: 8 }}>
            {(["live", "cached"] as DemoMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={mode === m ? "btn" : "ghost"}
                style={{ minHeight: 44, padding: "0 22px" }}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
            <button
              type="button"
              className="ghost"
              style={{ minHeight: 44, padding: "0 22px" }}
              disabled={busy}
              onClick={runReset}
            >
              데모 리셋
            </button>
          </div>
        </div>
        {resetMsg ? (
          <p style={{ marginTop: 14, fontWeight: 800, color: "var(--green-700)" }}>
            {resetMsg}
          </p>
        ) : null}
      </article>

      {/* 스텝 1~8 */}
      {STEPS.map(({ step, title, detail }) => {
        const r = results[step];
        const running = r?.phase === "running";
        return (
          <article key={step} className="card" style={{ padding: 22 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ minWidth: 260 }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
                  {step}. {title}
                </p>
                <p className="muted" style={{ margin: "6px 0 0" }}>
                  {detail}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {r && r.phase !== "running" ? (
                  <span className={`badge ${r.ok ? "is-ok" : "is-fail"}`}>
                    {r.ok ? "성공" : "실패"}
                  </span>
                ) : null}
                {r?.fromCache ? <span className="badge is-muted">cached</span> : null}
                <button
                  type="button"
                  className="btn"
                  style={{ minHeight: 64, minWidth: 180, fontSize: 18 }}
                  disabled={busy}
                  onClick={() => runStep(step)}
                >
                  {running ? "실행 중…" : `STEP ${step} 실행`}
                </button>
              </div>
            </div>

            {r && r.phase !== "running" ? (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  borderRadius: 12,
                  background: "var(--soft)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontWeight: 800,
                    fontSize: 17,
                    color: r.ok ? "var(--green-700)" : "#b02a2a",
                  }}
                >
                  {r.headline}
                </p>

                {r.signals?.length ? (
                  <ul className="kv" style={{ marginTop: 12 }}>
                    {r.signals.map(([name, ok]) => (
                      <li key={name}>
                        <span className="muted">{name}</span>
                        <strong style={{ color: ok ? "var(--green-700)" : "#b02a2a" }}>
                          {ok ? "통과 ✓" : "미통과 ✗"}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
                  txHash: {r.txHash ?? "—"}
                  {r.elapsedMs != null ? ` · ${(r.elapsedMs / 1000).toFixed(1)}s` : ""}
                </p>

                {r.raw != null ? (
                  <details style={{ marginTop: 10 }}>
                    <summary className="muted" style={{ cursor: "pointer" }}>
                      원본 응답 JSON
                    </summary>
                    <pre
                      style={{
                        marginTop: 8,
                        maxHeight: 260,
                        overflow: "auto",
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}
                    >
                      {JSON.stringify(r.raw, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
