"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, InfoRow, PanelShell, StepList } from "@/components/ui";
import {
  confirmIdentity,
  createIdentityOffer,
  fetchIdentityStatus,
  identityStatusQueryKey,
} from "@/components/farmfi/identity/api";
import type {
  IdentityOffer,
  IdentityStatusResponse,
} from "@/components/farmfi/identity/types";
import { useAuth } from "@/lib/useAuth";
import { won } from "../api";

const POLL_INTERVAL_MS = 2500;
const OFFER_TTL_SEC = 300;

export function VerifyMobileIdScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [offer, setOffer] = useState<IdentityOffer | null>(null);
  const [left, setLeft] = useState(OFFER_TTL_SEC);

  const offerMutation = useMutation({
    mutationFn: createIdentityOffer,
    onSuccess: (data) => {
      setOffer(data);
      setLeft(OFFER_TTL_SEC);
    },
  });

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
      const s = query.state.data?.status;
      return s === "verified" || s === "failed" ? false : POLL_INTERVAL_MS;
    },
  });

  // 최초 진입 시 요청을 한 번 발급한다.
  useEffect(() => {
    if (!offer && !offerMutation.isPending) offerMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!offer) return;
    const t = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [offer]);

  const status = statusQuery.data?.status;
  const claims = statusQuery.data?.claims ?? null;
  const eligibility = statusQuery.data?.eligibility;
  const expired = left === 0;
  const failed = status === "failed" || expired;

  useEffect(() => {
    if (status === "verified") {
      const t = setTimeout(() => router.push("/verify/account"), 700);
      return () => clearTimeout(t);
    }
  }, [status, router]);

  if (failed) return <FailureView onRetry={() => offerMutation.mutate()} expired={expired} />;

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <PanelShell className="max-w-modal">
      <p className="text-15 font-medium text-brand">
        투자 준비 2 / 3 · 모바일 신분증 확인
      </p>
      <p className="mt-3 text-13 text-body">
        휴대폰에서 모바일 신분증을 열고 요청된 정보를 확인해 주세요.
      </p>

      <div className="mt-6 rounded-10 border border-line px-6 py-7">
        <div className="mx-auto flex h-[174px] w-[166px] items-center justify-center rounded-10 border border-line bg-surface p-3">
          {offer ? (
            <span className="break-all text-center font-mono text-[9px] leading-[1.5] text-body">
              {offer.qrData}
            </span>
          ) : (
            <span className="text-11 text-muted">요청 발급 중</span>
          )}
        </div>
        <p className="mt-3 text-center text-11 text-muted">일회성 QR</p>

        <div className="mt-5 flex items-center justify-center gap-2">
          <span className="text-12 text-muted">유효시간</span>
          <span className="font-num text-12 font-medium text-ink">
            {mm}:{ss}
          </span>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => offerMutation.mutate()}
            disabled={offerMutation.isPending}
          >
            QR 새로 발급
          </Button>
          {offer ? (
            <Button size="sm" variant="secondary" href={offer.deeplink}>
              모바일 신분증 앱 열기
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-7">
        <StepList
          items={[
            {
              title: "본인확인 요청 시작",
              state: offer ? "done" : "current",
            },
            {
              title: "모바일 신분증 앱에서 확인",
              state:
                status === "verified"
                  ? "done"
                  : status === "submitted"
                    ? "current"
                    : offer
                      ? "current"
                      : "todo",
            },
            {
              title: "본인확인 결과 수신",
              state: status === "verified" ? "done" : "todo",
            },
          ]}
        />
      </div>

      <div className="mt-6 rounded-10 border border-line px-5 py-2">
        <InfoRow
          label="실명 확인"
          value={claims?.realName ? String(claims.realName) : "확인 전"}
        />
        <InfoRow
          label="성인 여부"
          value={claims?.adult === true ? "확인됨" : "확인 전"}
        />
        <InfoRow
          label="투자 한도"
          value={
            eligibility?.annualLimit ? won(eligibility.annualLimit) : "확인 전"
          }
        />
      </div>

      {user?.role === "admin" ? (
        <div className="mt-4">
          <Button
            full
            variant="ghost"
            onClick={() => confirmMutation.mutate()}
            disabled={!offer || confirmMutation.isPending}
          >
            데모: 확인 완료 처리 (admin)
          </Button>
        </div>
      ) : null}

      <p className="mt-6 text-12 leading-5 text-muted">
        FarmFi는 실명·성인 여부 등 필요한 확인값만 저장하고 신분증 원문은 보관하지 않아요.
      </p>
    </PanelShell>
  );
}

/** C-I02E · 모바일 신분증 확인 실패 */
function FailureView({
  onRetry,
  expired,
}: {
  onRetry: () => void;
  expired: boolean;
}) {
  return (
    <PanelShell className="max-w-modal">
      <h1 className="text-22 font-bold text-ink">
        모바일 신분증 확인을 완료하지 못했어요
      </h1>
      <p className="mt-4 text-14 leading-6 text-body">
        인증 요청 시간이 지났거나 모바일 신분증 앱에서 요청을 취소했습니다.
      </p>

      <div className="mt-7 rounded-12 border border-line px-6 py-6">
        <p className="text-12 text-muted">확인 방법</p>
        <p className="mt-1.5 text-15 font-bold text-ink">
          모바일 신분증 앱에서 확인
        </p>
        <p className="mt-5 text-12 text-muted">처리 결과</p>
        <p className="mt-1.5 text-13 font-bold text-danger">
          {expired ? "시간 만료" : "요청 취소"} · 본인정보 저장 안 됨
        </p>
      </div>

      <div className="mt-7 space-y-3">
        <Button full onClick={onRetry}>
          모바일 신분증으로 다시 확인
        </Button>
        <Button full variant="ghost" href="/projects">
          간편인증으로 로그인만 하기
        </Button>
      </div>

      <p className="mt-6 text-12 text-muted">
        투자 신청 전에는 모바일 신분증 확인을 다시 요청합니다.
      </p>
    </PanelShell>
  );
}
