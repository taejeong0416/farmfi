"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  InfoRow,
  PageHeading,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import { formatKRW, formatDate } from "@/lib/format";
import { useAuth, type AuthUserRole } from "@/lib/useAuth";
import { num, usePortfolio, won } from "../api";

const ROLE_LABEL: Record<AuthUserRole, string> = {
  investor: "투자자",
  landlord: "공간 제공자",
  operator: "운영자",
  admin: "관리자",
};

export function MyPageScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const { data: portfolio } = usePortfolio();

  // 서버(app/mypage/page.tsx)가 1차로 막지만, 하이드레이션 사이 만료를 대비한 2차 방어선.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !user) {
    return (
      <Shell className="max-w-panel">
        <SkeletonBlock height={280} />
      </Shell>
    );
  }

  return (
    <Shell className="max-w-panel">
      <PageHeading
        eyebrow="내 정보"
        title={`${user.name}님`}
        desc="계정과 본인확인 상태를 확인할 수 있습니다."
        action={
          <Button
            variant="ghost"
            onClick={async () => {
              await logout();
              router.push("/");
            }}
          >
            로그아웃
          </Button>
        }
      />

      <Card padded={false}>
        <div className="px-6">
          <InfoRow label="이용 목적" value={ROLE_LABEL[user.role] ?? user.role} />
          {user.email ? <InfoRow label="이메일" value={user.email} /> : null}
          <InfoRow
            label="본인확인"
            value={
              user.identityVerified ? (
                <Badge tone="pass">확인 완료</Badge>
              ) : (
                <Badge tone="plain">확인 전</Badge>
              )
            }
          />
          {user.identityVerified && user.verifiedAt ? (
            <InfoRow label="확인 시각" value={formatDate(user.verifiedAt)} />
          ) : null}
          {user.investorAnnualLimit != null ? (
            <InfoRow
              label="연간 투자한도"
              value={formatKRW(user.investorAnnualLimit)}
            />
          ) : null}
        </div>
      </Card>

      {portfolio && portfolio.holdings.length > 0 ? (
        <>
          <h2 className="mt-8 text-15 font-bold text-ink">내 투자 요약</h2>
          <Card className="mt-4" padded={false}>
            <div className="grid grid-cols-3">
              <Stat
                label="투자한 금액"
                value={`${num(portfolio.summary.totalInvested)}원`}
              />
              <Stat
                label="프로젝트"
                value={`${portfolio.holdings.length}개`}
                bordered
              />
              <Stat
                label="지급 완료액"
                value={won(portfolio.summary.totalDividendReceived)}
                bordered
                accent
              />
            </div>
          </Card>
          <div className="mt-4">
            <Button variant="ghost" href="/investor/holdings">
              보유 투자 자세히 보기
            </Button>
          </div>
        </>
      ) : null}

      {!user.identityVerified ? (
        <Card className="mt-8">
          <p className="text-14 font-bold text-ink">
            투자하려면 본인확인이 필요해요
          </p>
          <p className="mt-2 text-12 text-muted">
            모바일 신분증으로 확인하면 투자 한도가 함께 계산됩니다.
          </p>
          <div className="mt-5">
            <Button href="/verify">본인확인 시작</Button>
          </div>
        </Card>
      ) : null}
    </Shell>
  );
}

function Stat({
  label,
  value,
  bordered,
  accent,
}: {
  label: string;
  value: string;
  bordered?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`px-6 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-12 text-muted">{label}</p>
      <p
        className={`mt-1.5 font-num text-20 font-medium ${accent ? "text-brand" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}
