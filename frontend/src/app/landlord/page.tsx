"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { GreenBand, Hero, Section } from "@/components/FarmFi";
import { useAuth } from "@/lib/useAuth";
import { fetchAllSpaces, spacesQueryKey } from "@/components/farmfi/landlord/api";
import { LandlordSummary } from "@/components/farmfi/landlord/LandlordSummary";
import { MySpaceGrid } from "@/components/farmfi/landlord/MySpaceGrid";

export default function LandlordPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // GET /api/spaces is platform-wide and has no session filter (owned by another
  // agent's route — not edited here). Filter to this user's own spaces client-side.
  const { data, isLoading: spacesLoading, isError } = useQuery({
    queryKey: spacesQueryKey(),
    queryFn: fetchAllSpaces,
    enabled: isAuthenticated,
  });

  const mySpaces = (data ?? []).filter((space) => space.ownerId === user?.id);
  const isLoading = authLoading || (isAuthenticated && spacesLoading);

  return (
    <main className="page">
      <Hero
        art="landlord"
        eyebrow="건물주 · 공간 제공자 전용"
        title="내가 등록한 공간,"
        green="한눈에 관리하세요"
        lead="등록한 유휴공간의 스마트팜 적합도, 예상 임대 수익, 계약 진행 상황을 대시보드에서 확인하세요."
        actions={
          <>
            <Link className="btn" href="/space">
              공간 등록하기 →
            </Link>
            <Link className="ghost" href="#spaces">
              내 공간 보기
            </Link>
          </>
        }
        chips={["공간 가치 극대화", "안정적 임대 수익", "ESG 가치 실현"]}
      />

      <section className="section" id="spaces">
        <div className="shell">
          {!isAuthenticated && !authLoading ? (
            <p className="muted">
              상단의 지갑 연결 후 로그인하면 내가 등록한 공간을 확인할 수 있어요.
            </p>
          ) : isLoading ? (
            <p className="muted">불러오는 중...</p>
          ) : isError ? (
            <p className="muted">공간 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
          ) : (
            <>
              <LandlordSummary spaces={mySpaces} />
              <div style={{ marginTop: 30 }}>
                <MySpaceGrid spaces={mySpaces} />
              </div>
              {mySpaces.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  <Link className="link" href="/space">
                    첫 공간을 등록
                  </Link>
                  하고 스마트팜 적합도와 예상 임대 수익을 확인해보세요.
                </p>
              ) : null}
            </>
          )}
        </div>
      </section>

      <Section title="공간 등록부터 계약까지">
        <ul className="timeline">
          {["공간 등록", "적합도 진단", "심사", "계약 체결", "운영 시작"].map((step, i) => (
            <li key={step}>
              <i />
              <div>
                <strong style={{ display: "block" }}>
                  {i + 1}. {step}
                </strong>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <GreenBand text="더 많은 공간을 등록하고 스마트팜 생태계를 함께 넓혀가세요" />
    </main>
  );
}
