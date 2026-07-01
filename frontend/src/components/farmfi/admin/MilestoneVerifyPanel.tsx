"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatKRW, shortenHash } from "@/lib/format";

export interface AdminMilestone {
  id: string;
  seq: number;
  name: string;
  description: string | null;
  releasePct: number;
  releaseAmount: number;
  status: string;
  conditionText: string | null;
  requiredSignals: string[];
  iotMinDays: number;
  retryCount: number;
  crossCheck: string | null;
  evidenceUrl: string | null;
}

type ImageSignal = "contract" | "receipt" | "photo";

const IMAGE_SIGNALS: ImageSignal[] = ["contract", "receipt", "photo"];

const AI_ENDPOINT_BY_SIGNAL: Record<ImageSignal, string> = {
  contract: "/api/ai/verify-contract",
  receipt: "/api/ai/verify-receipt",
  photo: "/api/ai/verify-photo",
};

const SIGNAL_LABEL: Record<string, string> = {
  contract: "임대차 계약서",
  receipt: "구매/판매 영수증",
  photo: "현장 사진",
  iot: "IoT 센서 데이터",
};

const MILESTONE_TYPE_BY_SEQ: Record<number, string> = {
  1: "construction",
  2: "trial_run",
  3: "harvest",
  4: "operation",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  in_progress: "진행중 · 검증 가능",
  verified: "AI 검증 완료 · 해제 대기",
  completed: "트랜치 해제 완료",
  failed: "실패",
  manual_review: "수동 검토 필요",
};

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB — 이보다 크면 업로드 자체를 막는다
const MAX_IMAGE_DIM = 1280; // 리사이즈 후 최대 가로/세로. base64 payload 크기 완화용

/** File → (리사이즈된) base64. 이미지가 아니면 원본을 그대로 base64로 반환한다. */
async function fileToCompressedBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });

  if (!file.type.startsWith("image/")) {
    return dataUrl.split(",")[1] ?? "";
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("이미지를 디코딩하지 못했습니다."));
    el.src = dataUrl;
  });

  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl.split(",")[1] ?? "";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const compressed = canvas.toDataURL("image/jpeg", 0.82);
  return compressed.split(",")[1] ?? "";
}

interface AiVerdict {
  passed: boolean;
  confidence?: number;
  reason?: string;
  detectedObjects?: string[];
  extractedData?: Record<string, unknown>;
}

interface VerifyApiResult {
  passed: boolean;
  signals: Record<string, boolean>;
  retryCount: number;
  txHash: string | null;
}

interface CompleteApiResult {
  success: boolean;
  milestone: { status: string; releaseAmount: number };
  txHash: string | null;
}

export function MilestoneVerifyPanel({
  milestone,
  onChanged,
}: {
  milestone: AdminMilestone;
  onChanged: () => void;
}) {
  const milestoneType = MILESTONE_TYPE_BY_SEQ[milestone.seq] ?? "construction";
  const imageSignals = IMAGE_SIGNALS.filter((s) => milestone.requiredSignals.includes(s));
  const hasIotSignal = milestone.requiredSignals.includes("iot");

  const [base64BySignal, setBase64BySignal] = useState<Partial<Record<ImageSignal, string>>>({});
  const [previewUrlBySignal, setPreviewUrlBySignal] = useState<Partial<Record<ImageSignal, string>>>({});
  const [aiVerdictBySignal, setAiVerdictBySignal] = useState<Partial<Record<ImageSignal, AiVerdict>>>({});
  const [previewLoading, setPreviewLoading] = useState<Partial<Record<ImageSignal, boolean>>>({});
  const [fileError, setFileError] = useState<Partial<Record<ImageSignal, string>>>({});
  const [finalResult, setFinalResult] = useState<VerifyApiResult | null>(null);
  const [completeResult, setCompleteResult] = useState<CompleteApiResult | null>(null);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { milestoneType };
      if (base64BySignal.contract) body.contractImage = base64BySignal.contract;
      if (base64BySignal.receipt) body.receiptImage = base64BySignal.receipt;
      if (base64BySignal.photo) body.photoImage = base64BySignal.photo;

      const res = await fetch(`/api/milestones/${milestone.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "검증 요청 실패");
      return data as VerifyApiResult;
    },
    onSuccess: (data) => {
      setFinalResult(data);
      onChanged();
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/milestones/${milestone.id}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "트랜치 해제 실패");
      return data as CompleteApiResult;
    },
    onSuccess: (data) => {
      setCompleteResult(data);
      onChanged();
    },
  });

  async function handleFileChange(signal: ImageSignal, file: File | null) {
    if (!file) return;
    setFileError((prev) => ({ ...prev, [signal]: undefined }));

    if (file.size > MAX_FILE_BYTES) {
      setFileError((prev) => ({ ...prev, [signal]: "파일이 너무 큽니다 (최대 8MB)" }));
      return;
    }

    setPreviewUrlBySignal((prev) => ({ ...prev, [signal]: URL.createObjectURL(file) }));
    setPreviewLoading((prev) => ({ ...prev, [signal]: true }));
    setAiVerdictBySignal((prev) => ({ ...prev, [signal]: undefined }));

    try {
      const imageBase64 = await fileToCompressedBase64(file);
      setBase64BySignal((prev) => ({ ...prev, [signal]: imageBase64 }));

      const res = await fetch(AI_ENDPOINT_BY_SIGNAL[signal], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestoneId: milestone.id, imageBase64, milestoneType }),
      });
      const data = await res.json();
      setAiVerdictBySignal((prev) => ({ ...prev, [signal]: data as AiVerdict }));
    } catch (e) {
      setFileError((prev) => ({
        ...prev,
        [signal]: e instanceof Error ? e.message : "AI 미리보기 검증 실패",
      }));
    } finally {
      setPreviewLoading((prev) => ({ ...prev, [signal]: false }));
    }
  }

  const canVerify = milestone.status === "in_progress" || milestone.status === "manual_review";
  const canComplete = milestone.status === "verified";
  const requiredImagesUploaded = imageSignals.every((s) => base64BySignal[s]);

  return (
    <article className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span className="badge">SEQ {milestone.seq}</span>
          <h3 style={{ marginTop: 10 }}>{milestone.name}</h3>
          <p className="muted" style={{ marginTop: 4 }}>
            {milestone.description ?? milestone.conditionText}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontWeight: 900 }}>{STATUS_LABEL[milestone.status] ?? milestone.status}</p>
          <p className="muted" style={{ marginTop: 4 }}>
            {milestone.releasePct / 100}% · {formatKRW(milestone.releaseAmount)}
          </p>
          {milestone.retryCount > 0 ? (
            <p className="muted" style={{ marginTop: 4 }}>
              재시도 {milestone.retryCount}회
            </p>
          ) : null}
        </div>
      </div>

      <div className="seg" style={{ marginTop: 14 }}>
        {milestone.requiredSignals.map((s) => (
          <span key={s}>{SIGNAL_LABEL[s] ?? s}</span>
        ))}
      </div>

      {!canVerify && !canComplete ? (
        <p className="muted" style={{ marginTop: 16 }}>
          {milestone.status === "pending"
            ? "이전 마일스톤이 먼저 완료되어야 진행할 수 있습니다."
            : "이 마일스톤은 이미 처리되었습니다."}
        </p>
      ) : null}

      {canVerify ? (
        <div style={{ marginTop: 18, display: "grid", gap: 16 }}>
          {hasIotSignal ? (
            <p className="muted">
              IoT 신호는 자동 검증됩니다 (최소 {milestone.iotMinDays}일 가동률 90% 이상).
            </p>
          ) : null}

          {imageSignals.length > 0 ? (
            <div className="grid-2" style={{ gap: 14 }}>
              {imageSignals.map((signal) => (
                <div key={signal} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 14 }}>
                  <label style={{ fontWeight: 800, fontSize: 14, display: "block" }}>
                    {SIGNAL_LABEL[signal]}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ marginTop: 10, fontSize: 13 }}
                    onChange={(e) => handleFileChange(signal, e.target.files?.[0] ?? null)}
                  />
                  {previewUrlBySignal[signal] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrlBySignal[signal]}
                      alt={`${SIGNAL_LABEL[signal]} 미리보기`}
                      style={{ marginTop: 10, maxHeight: 140, borderRadius: 6, objectFit: "cover" }}
                    />
                  ) : null}
                  {previewLoading[signal] ? (
                    <p className="muted" style={{ marginTop: 8 }}>
                      AI 미리보기 검증 중…
                    </p>
                  ) : null}
                  {fileError[signal] ? (
                    <p style={{ marginTop: 8, color: "#c0392b", fontSize: 13 }}>{fileError[signal]}</p>
                  ) : null}
                  {aiVerdictBySignal[signal] ? (
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      <p style={{ fontWeight: 800, color: aiVerdictBySignal[signal]?.passed ? "var(--green-800)" : "#c0392b" }}>
                        AI 판정: {aiVerdictBySignal[signal]?.passed ? "통과" : "미통과"}
                        {typeof aiVerdictBySignal[signal]?.confidence === "number"
                          ? ` (신뢰도 ${Math.round((aiVerdictBySignal[signal]!.confidence ?? 0) * 100)}%)`
                          : ""}
                      </p>
                      {aiVerdictBySignal[signal]?.reason ? (
                        <p className="muted" style={{ marginTop: 4 }}>
                          {aiVerdictBySignal[signal]?.reason}
                        </p>
                      ) : null}
                      {aiVerdictBySignal[signal]?.detectedObjects?.length ? (
                        <p className="muted" style={{ marginTop: 4 }}>
                          감지: {aiVerdictBySignal[signal]?.detectedObjects?.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <div>
            <button
              className="btn"
              disabled={verifyMutation.isPending || (imageSignals.length > 0 && !requiredImagesUploaded)}
              onClick={() => verifyMutation.mutate()}
            >
              {verifyMutation.isPending ? "최종 검증 제출 중…" : "최종 검증 제출"}
            </button>
            {imageSignals.length > 0 && !requiredImagesUploaded ? (
              <p className="muted" style={{ marginTop: 8 }}>
                필요한 증빙 이미지를 모두 업로드해야 제출할 수 있습니다.
              </p>
            ) : null}
            {verifyMutation.isError ? (
              <p style={{ marginTop: 8, color: "#c0392b", fontSize: 13 }}>
                {(verifyMutation.error as Error).message}
              </p>
            ) : null}
          </div>

          {finalResult ? (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <p style={{ fontWeight: 900, color: finalResult.passed ? "var(--green-800)" : "#c0392b" }}>
                최종 판정: {finalResult.passed ? "검증 통과" : `미통과 (재시도 ${finalResult.retryCount}회)`}
              </p>
              <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                신호별 결과: {Object.entries(finalResult.signals).map(([k, v]) => `${SIGNAL_LABEL[k] ?? k}=${v ? "✓" : "✕"}`).join(" · ")}
              </p>
              {finalResult.txHash ? (
                <a
                  href={`https://amoy.polygonscan.com/tx/${finalResult.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link"
                >
                  {shortenHash(finalResult.txHash)} · Polygonscan ↗
                </a>
              ) : (
                <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  txHash: 온체인 연동 대기 (모의 처리됨)
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {canComplete ? (
        <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <button className="btn" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
            {completeMutation.isPending ? "트랜치 해제 중…" : `트랜치 해제 (${formatKRW(milestone.releaseAmount)})`}
          </button>
          {completeMutation.isError ? (
            <p style={{ marginTop: 8, color: "#c0392b", fontSize: 13 }}>
              {(completeMutation.error as Error).message}
            </p>
          ) : null}
          {completeResult ? (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontWeight: 900, color: "var(--green-800)" }}>트랜치 해제 완료</p>
              {completeResult.txHash ? (
                <a
                  href={`https://amoy.polygonscan.com/tx/${completeResult.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link"
                >
                  {shortenHash(completeResult.txHash)} · Polygonscan ↗
                </a>
              ) : (
                <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  txHash: 온체인 연동 대기 (모의 처리됨)
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
