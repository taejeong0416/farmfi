"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { confirmIdentity, createIdentityOffer, fetchIdentityStatus, identityStatusQueryKey } from "@/components/farmfi/identity/api";
import { IdentityStepper, type IdentityFlowStage } from "@/components/farmfi/identity/IdentityStepper";
import { QrCard } from "@/components/farmfi/identity/QrCard";
import { VerificationResult } from "@/components/farmfi/identity/VerificationResult";
import type { IdentityOffer, IdentityStatusResponse } from "@/components/farmfi/identity/types";

const POLL_INTERVAL_MS = 2500;

export default function VerifyIdentityPage() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [offer, setOffer] = useState<IdentityOffer | null>(null);

  const offerMutation = useMutation({
    mutationFn: createIdentityOffer,
    onSuccess: (data) => setOffer(data),
  });

  // 데모 전용 — 홀더 지갑앱이 없어 실 QR은 verified로 안 넘어간다. admin이 이 버튼으로
  // 세션을 확정하면 폴링이 자격·한도까지 이어서 채운다.
  const confirmMutation = useMutation({
    mutationFn: () => confirmIdentity(offer!.txId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: identityStatusQueryKey(offer?.txId ?? null),
      }),
  });

  const statusQuery = useQuery<IdentityStatusResponse>({
    queryKey: identityStatusQueryKey(offer?.txId ?? null),
    queryFn: () => fetchIdentityStatus(offer!.txId),
    enabled: Boolean(offer?.txId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "verified" || status === "failed" ? false : POLL_INTERVAL_MS;
    },
  });

  const startVerification = () => {
    setOffer(null);
    offerMutation.mutate();
  };

  const remoteStatus = statusQuery.data?.status;
  const stage: IdentityFlowStage = !offer ? "idle" : remoteStatus ?? "pending";
  const isBusinessFailure = stage === "failed";
  const isNetworkFailure = statusQuery.isError && !isBusinessFailure;

  return (
    <main className="page">
      <div className="shell" style={{ padding: "44px 0 80px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <span className="eyebrow">본인인증 (모바일 신분증)</span>
          <h1 style={{ marginTop: 10 }}>실명 인증하고 투자 한도를 확인하세요</h1>
          <p className="lead">
            모바일 신분증으로 본인 확인을 마치면 자본시장법 기준 투자자 자격과 연간 투자
            한도가 자동으로 계산돼요.
          </p>

          {!isAuthenticated ? (
            <p className="muted" style={{ marginTop: 4 }}>
              지갑 연결 후 로그인하면 인증 결과가 계정에 저장돼요. 로그인 없이도 인증 결과는
              바로 확인할 수 있어요.
            </p>
          ) : null}

          <div style={{ marginTop: 28 }}>
            <IdentityStepper stage={stage} />
          </div>

          <div style={{ marginTop: 24 }}>
            {stage === "idle" ? (
              <button
                className="btn"
                type="button"
                style={{ width: "100%" }}
                disabled={offerMutation.isPending}
                onClick={startVerification}
              >
                {offerMutation.isPending ? "인증 요청 생성 중..." : "모바일 신분증으로 인증 →"}
              </button>
            ) : null}

            {offerMutation.isError ? (
              <p role="status" style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: "#c0392b" }}>
                {offerMutation.error instanceof Error
                  ? offerMutation.error.message
                  : "인증 요청 생성에 실패했습니다."}
              </p>
            ) : null}

            {offer && (stage === "pending" || stage === "submitted") ? (
              <>
                <div style={{ marginTop: 20 }}>
                  <QrCard offer={offer} />
                </div>
                <p className="muted" role="status" style={{ marginTop: 14, textAlign: "center" }}>
                  지갑 앱에서 인증을 완료하면 자동으로 다음 단계로 넘어가요. (약 3초 소요)
                </p>
                {user?.role === "admin" ? (
                  <button
                    className="ghost"
                    type="button"
                    style={{ width: "100%", marginTop: 10 }}
                    disabled={confirmMutation.isPending}
                    onClick={() => confirmMutation.mutate()}
                  >
                    {confirmMutation.isPending ? "확정 중..." : "데모: 인증 완료 처리 (admin)"}
                  </button>
                ) : null}
              </>
            ) : null}

            {isNetworkFailure ? (
              <div className="card report-card" style={{ marginTop: 20 }}>
                <p style={{ fontWeight: 800 }}>인증 상태를 확인하지 못했어요.</p>
                <p className="muted" style={{ marginTop: 6 }}>
                  네트워크 상태를 확인한 뒤 다시 시도해주세요.
                </p>
                <button
                  className="btn"
                  type="button"
                  style={{ width: "100%", marginTop: 16 }}
                  onClick={startVerification}
                >
                  다시 시도 →
                </button>
              </div>
            ) : null}

            {isBusinessFailure ? (
              <div className="card report-card" style={{ marginTop: 20 }}>
                <p style={{ fontWeight: 800 }}>인증을 완료하지 못했어요.</p>
                <p className="muted" style={{ marginTop: 6 }}>
                  인증 요청이 만료되었거나 지갑 응답을 받지 못했어요. 다시 시도하면 새 인증
                  요청을 발급해드려요.
                </p>
                <button
                  className="btn"
                  type="button"
                  style={{ width: "100%", marginTop: 16 }}
                  disabled={offerMutation.isPending}
                  onClick={startVerification}
                >
                  다시 인증하기 →
                </button>
              </div>
            ) : null}

            {stage === "verified" && statusQuery.data?.eligibility ? (
              <>
                <div style={{ marginTop: 20 }}>
                  <VerificationResult claims={statusQuery.data.claims} eligibility={statusQuery.data.eligibility} />
                </div>
                <button
                  className="ghost"
                  type="button"
                  style={{ width: "100%", marginTop: 14 }}
                  onClick={startVerification}
                >
                  다시 인증하기
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
