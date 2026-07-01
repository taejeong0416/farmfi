"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/useAuth";
import { formatKRW } from "@/lib/format";
import { projectQueryKey, projectsQueryKey, subscribeToProject } from "./api";
import type { ProjectDetail } from "./types";

const SUBSCRIBE_ERROR_MESSAGES: Record<string, string> = {
  "Insufficient balance": "잔액이 부족합니다.",
  "Not enough tokens available": "남은 토큰 수량이 부족합니다.",
  "Invalid request body": "입력값을 다시 확인해주세요.",
  "User not found": "사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.",
  "Project not found": "프로젝트를 찾을 수 없습니다.",
  "Project escrow not found": "에스크로 정보를 찾을 수 없습니다.",
};

function translateError(message: string): string {
  return SUBSCRIBE_ERROR_MESSAGES[message] ?? "청약 처리 중 오류가 발생했습니다.";
}

const AMOY_TX_BASE = "https://amoy.polygonscan.com/tx/";

export function SubscribeForm({ project }: { project: ProjectDetail }) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const remaining = project.totalTokens - project.soldTokens;
  const canSubscribe = project.status === "funding" && remaining > 0;

  const [tokenAmount, setTokenAmount] = useState(1);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
    txHash?: string | null;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: (amount: number) => {
      if (!user) {
        throw new Error("로그인이 필요합니다.");
      }
      return subscribeToProject({
        userId: user.id,
        projectId: project.id,
        tokenAmount: amount,
      });
    },
    onSuccess: (data) => {
      setFeedback({
        type: "success",
        message: `${tokenAmount.toLocaleString()}개 청약이 완료되었습니다.`,
        txHash: data.transaction.txHash,
      });
      queryClient.invalidateQueries({ queryKey: projectQueryKey(project.id) });
      queryClient.invalidateQueries({ queryKey: projectsQueryKey() });
    },
    onError: (err) => {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? translateError(err.message) : "청약 처리 중 오류가 발생했습니다.",
      });
    },
  });

  const totalCost = Math.max(0, tokenAmount) * project.tokenPrice;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!isAuthenticated || !user) {
      setFeedback({ type: "error", message: "지갑 연결 후 로그인이 필요합니다." });
      return;
    }
    if (!Number.isInteger(tokenAmount) || tokenAmount < 1) {
      setFeedback({ type: "error", message: "청약 수량을 확인해주세요." });
      return;
    }
    if (tokenAmount > remaining) {
      setFeedback({ type: "error", message: "남은 토큰 수량을 초과했습니다." });
      return;
    }

    mutation.mutate(tokenAmount);
  };

  return (
    <article className="card report-card">
      <p className="muted">토큰 단가</p>
      <p className="big-number">{formatKRW(project.tokenPrice)}</p>
      <p className="muted" style={{ marginTop: 4 }}>
        잔여 {remaining.toLocaleString()} / {project.totalTokens.toLocaleString()}개
      </p>

      {canSubscribe ? (
        <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="subscribe-token-amount">수량 (개)</label>
            <input
              id="subscribe-token-amount"
              className="fake-control"
              type="number"
              min={1}
              max={remaining}
              value={tokenAmount}
              onChange={(e) => setTokenAmount(Number(e.target.value))}
              disabled={mutation.isPending}
            />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>총 금액</label>
            <div className="fake-control">{formatKRW(totalCost)}</div>
          </div>
          <button
            className="btn"
            type="submit"
            style={{ width: "100%", marginTop: 18 }}
            disabled={mutation.isPending || !isAuthenticated}
          >
            {mutation.isPending ? "청약 처리 중..." : "지금 참여하기"}
          </button>
        </form>
      ) : (
        <p className="muted" style={{ marginTop: 18 }}>
          {remaining <= 0
            ? "모든 토큰이 소진되었습니다."
            : "현재 청약을 받고 있지 않은 프로젝트입니다."}
        </p>
      )}

      {!isAuthenticated ? (
        <p className="muted" style={{ marginTop: 12 }}>
          상단의 지갑 연결 후 로그인하면 청약할 수 있습니다.
        </p>
      ) : null}

      {feedback ? (
        <p
          role="status"
          style={{
            marginTop: 14,
            fontSize: 13,
            fontWeight: 700,
            color: feedback.type === "success" ? "var(--green-800)" : "#c0392b",
          }}
        >
          {feedback.message}
          {feedback.type === "success" ? (
            feedback.txHash ? (
              <>
                {" "}
                <a
                  className="link"
                  href={`${AMOY_TX_BASE}${feedback.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  트랜잭션 보기 ↗
                </a>
              </>
            ) : (
              " (온체인 기록은 컨트랙트 연동 후 반영됩니다)"
            )
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
