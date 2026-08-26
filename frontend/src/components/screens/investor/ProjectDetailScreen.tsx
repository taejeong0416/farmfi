"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  InfoRow,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import { PROJECT_DOCUMENTS } from "@/lib/project-document-list";
import { useAuth } from "@/lib/useAuth";
import {
  MILESTONE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  milestoneTone,
  num,
  shortDate,
  usePortfolio,
  useProject,
  useProjectNav,
  won,
  type MilestoneSummary,
} from "../api";

const RISKS: { label: string; text: string }[] = [
  {
    label: "원금 손실",
    text: "예상 회수액은 지점의 판매량과 운영비를 바탕으로 계산하며 실제 결과는 달라질 수 있습니다.",
  },
  {
    label: "집행 지연",
    text: "마일스톤 검증이 보류되면 해당 단계의 집행이 멈추고 영업 개시가 늦어질 수 있습니다.",
  },
  {
    label: "환금성 제한",
    text: "프로젝트 운영 중에는 투자금의 중도 회수가 제한될 수 있습니다.",
  },
  {
    label: "신청 취소",
    text: "모집 마감 전까지만 취소할 수 있으며, 마감 이후에는 취소나 환불을 요청할 수 없습니다.",
  },
];

const DOCUMENTS = PROJECT_DOCUMENTS.map((d) => ({
  slug: d.slug,
  name: `${d.name}.pdf`,
  date: d.issuedAt,
}));

export function ProjectDetailScreen({ id }: { id: string }) {
  const { data: p, isLoading, isError } = useProject(id);
  const { data: navInfo } = useProjectNav(id);
  const { data: portfolio } = usePortfolio();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // 이 지점에서 내가 가진 구좌. 로그인 전이거나 아직 없으면 null이고, 화면은 "—"를 쓴다.
  const myUnits = useMemo(
    () => portfolio?.holdings.find((h) => h.projectId === id)?.tokenAmount ?? null,
    [portfolio, id],
  );

  const unit = p?.tokenPrice ?? 0;
  const [amount, setAmount] = useState(0);

  /*
   * 신청 버튼이 가는 곳. 적합성 판정은 본인확인이 끝난 뒤에야 의미가 있으므로,
   * 확인 전인 사용자는 판정 화면이 아니라 본인확인부터 거친다. 확인을 마치면
   * `next`를 타고 지금 입력한 금액 그대로 이 신청으로 돌아온다.
   */
  const eligibilityHref = `/projects/${id}/invest/eligibility?amount=${amount}`;
  const applyHref = !user
    ? `/login?next=${encodeURIComponent(eligibilityHref)}`
    : user.identityVerified
      ? eligibilityHref
      : `/verify?next=${encodeURIComponent(eligibilityHref)}`;

  const milestones = useMemo(
    () => [...(p?.milestones ?? [])].sort((a, b) => a.seq - b.seq),
    [p],
  );

  if (isLoading) {
    return (
      <Shell>
        <SkeletonBlock height={520} />
      </Shell>
    );
  }
  if (isError || !p) {
    return (
      <Shell>
        <p className="text-13 text-muted">프로젝트를 불러오지 못했습니다.</p>
      </Shell>
    );
  }

  const pct = Math.round(p.fundingPercent * 10) / 10;
  const canApply = p.status === "funding";

  return (
    <Shell>
      <p className="text-12 text-muted">
        <Link href="/projects">프로젝트</Link>
        <span className="mx-2 text-line">/</span>
        <span className="text-body">{p.name}</span>
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <h1 className="text-24 font-bold text-ink">{p.name}</h1>
        <Badge tone={p.status === "funding" ? "pass" : "plain"}>
          {PROJECT_STATUS_LABEL[p.status] ?? p.status}
        </Badge>
        <span className="rounded-full border border-danger px-3 py-1 text-11 font-medium text-danger">
          원금 비보장
        </span>
        <span className="rounded-full border border-brand bg-brand-soft px-3 py-1 text-11 font-medium text-brand">
          회수기간 변동 가능
        </span>
        <span className="rounded-full border border-line px-3 py-1 text-11 font-medium text-body">
          단계별 집행 공개
        </span>
      </div>
      <p className="mt-3 text-13 text-muted">
        {p.location ?? "위치 미정"}
        {p.fundingEnd ? ` · 모집 마감 ${shortDate(p.fundingEnd)}` : ""}
      </p>

      <div className="mt-7 flex items-start gap-8">
        <div className="flex-1">
          <Card padded={false}>
            <div className="grid grid-cols-3">
              <Metric label="목표 금액" value={num(p.targetAmount)} unit="원" />
              <Metric
                label="현재 모금액"
                value={num(p.currentAmount)}
                unit="원"
                bordered
              />
              <Metric label="달성률" value={pct.toFixed(1)} unit="%" bordered accent />
            </div>
            <div className="grid grid-cols-3 border-t border-line-soft">
              <Metric label="참여자 수" value={`${p.investorCount}명`} small />
              <Metric
                label="최소 투자 금액"
                value={won(p.tokenPrice)}
                small
                bordered
              />
              <Metric
                label="모집 마감일"
                value={shortDate(p.fundingEnd)}
                small
                bordered
              />
            </div>
          </Card>

          {navInfo?.available ? (
            <>
              <h2 className="mt-10 text-15 font-bold text-ink">투자 배분 현황</h2>
              <p className="mt-1.5 text-12 text-muted">
                이 지점에 배정된 전체 구좌 가운데 내 몫이 얼마인지 보여줍니다.
                아래 세 값은 배정의 근거가 되는 신탁 잔액 · 집행으로 생긴 자산 · 누적 회수금입니다.
              </p>
              <Card className="mt-4" padded={false}>
                <div className="grid grid-cols-3">
                  <Metric
                    label="내 배분 비율"
                    value={
                      myUnits != null && navInfo.basis.holdings > 0
                        ? `${((myUnits / navInfo.basis.holdings) * 100).toFixed(1)}%`
                        : "—"
                    }
                    accent
                  />
                  <Metric
                    label="총 배정 토큰"
                    value={`${num(navInfo.basis.holdings)}구좌`}
                    bordered
                  />
                  <Metric
                    label="내 보유 토큰"
                    value={myUnits != null ? `${num(myUnits)}구좌` : "—"}
                    bordered
                  />
                </div>
                <div className="grid grid-cols-3 border-t border-line-soft">
                  <Metric label="신탁 잔액" value={won(navInfo.breakdown.escrow)} small />
                  <Metric
                    label="집행 자산"
                    value={won(navInfo.breakdown.asset)}
                    small
                    bordered
                  />
                  <Metric
                    label="누적 회수금"
                    value={won(navInfo.breakdown.cashFlow)}
                    small
                    bordered
                  />
                </div>
              </Card>
            </>
          ) : null}

          <h2 className="mt-10 text-15 font-bold text-ink">투자금 사용 과정</h2>
          <div className="mt-4">
            {milestones.length === 0 ? (
              <p className="text-13 text-muted">등록된 단계가 없습니다.</p>
            ) : (
              milestones.map((m) => <MilestoneRow key={m.id} m={m} />)
            )}
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4">
            <SectionLink label="프로젝트 개요" />
            <SectionLink label="공간 · 운영자 정보" />
            <SectionLink label="수익 구조와 회수 기준" />
          </div>

          <h2 className="mt-10 text-15 font-bold text-ink">
            투자 전 꼭 확인해 주세요
          </h2>
          <Card className="mt-4" padded={false}>
            <div className="grid grid-cols-3 border-b border-line-soft">
              <Metric label="목표 금액" value={won(p.targetAmount)} small />
              <Metric
                label="모집 기간"
                value={`${shortDate(p.fundingStart)} ~ ${shortDate(p.fundingEnd)}`}
                small
                bordered
              />
              <Metric
                label="회수 구조"
                value="기준 시나리오 · 지점별 예상 회수 범위"
                small
                bordered
              />
            </div>
            <div className="px-6">
              {RISKS.map((r) => (
                <div
                  key={r.label}
                  className="flex gap-8 border-b border-surface py-4 last:border-b-0"
                >
                  <span className="w-[130px] shrink-0 text-13 text-muted">
                    {r.label}
                  </span>
                  <span className="text-13 leading-6 text-body">{r.text}</span>
                </div>
              ))}
            </div>
            <p className="border-t border-line-soft bg-surface px-6 py-4 text-12 text-muted">
              이 화면의 정보는 투자 판단을 돕기 위한 것이며 투자 권유가 아닙니다. 투자 결과에 대한 책임은 투자자 본인에게 있습니다.
            </p>
          </Card>

          <h2 className="mt-10 text-15 font-bold text-ink">공개 문서</h2>
          <Card className="mt-4" padded={false}>
            <div className="px-6">
              {DOCUMENTS.map((d) => (
                <a
                  key={d.slug}
                  href={`/api/projects/${id}/documents/${d.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group -mx-3 flex items-center gap-3 rounded-8 border-b border-surface px-3 py-4 transition-colors last:border-b-0 hover:bg-surface"
                >
                  <span className="flex-1 text-13 text-ink transition-colors group-hover:text-brand">
                    {d.name}
                  </span>
                  <span className="text-12 text-muted">{d.date}</span>
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <path
                      d="M8 1.5v8m0 0L5 6.5m3 3 3-3M2.5 11v2A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5v-2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              ))}
            </div>
          </Card>
        </div>

        {/* 투자 신청 패널 */}
        <Card className="w-[406px] shrink-0">
          <h2 className="text-15 font-bold text-ink">투자 신청</h2>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-13 text-muted">최소 투자 금액</span>
            <span className="font-num text-14 font-medium text-ink">
              {won(unit)}
            </span>
          </div>

          <p className="mt-6 text-13 text-muted">입력 금액</p>
          <div className="mt-2 flex h-14 items-center rounded-8 border border-muted px-4">
            <input
              className="w-full bg-transparent text-right font-num text-24 font-semibold text-ink outline-none"
              inputMode="numeric"
              value={amount ? num(amount) : ""}
              placeholder="0"
              onChange={(e) => {
                const v = Number(e.target.value.replace(/\D/g, ""));
                setAmount(Number.isNaN(v) ? 0 : v);
              }}
            />
            <span className="ml-2 shrink-0 text-15 text-body">원</span>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <QuickAdd label={`+${Math.round(unit / 10000)}만`} onClick={() => setAmount((a) => a + unit)} />
            <QuickAdd label="+50만" onClick={() => setAmount((a) => a + 500_000)} />
            <QuickAdd label="+100만" onClick={() => setAmount((a) => a + 1_000_000)} />
            <QuickAdd label="초기화" onClick={() => setAmount(0)} />
          </div>
          <p className="mt-2 font-num text-12 text-muted">
            {won(unit)} 단위
          </p>

          <div className="mt-6 border-t border-line-soft pt-2">
            <InfoRow
              label="신원 확인"
              value={
                user?.identityVerified ? (
                  <span className="text-brand">확인 완료</span>
                ) : (
                  "확인 전"
                )
              }
            />
            <InfoRow
              label="예상 배정 상태"
              value={
                canApply ? (
                  <span className="text-brand">배정 가능</span>
                ) : (
                  "모집 종료"
                )
              }
            />
            <InfoRow label="신청 상태" value="신청 전" />
          </div>

          <div className="mt-6">
            {/*
              세션을 확인하는 동안에는 문구를 바꾸지 않는다. 로그인한 사람에게
              "로그인하고 신청하기"가 잠깐 스쳤다가 바뀌면 눌러도 되는 버튼인지
              알 수 없다.
            */}
            <Button
              full
              disabled={authLoading || !canApply || amount < unit}
              onClick={() => router.push(applyHref)}
            >
              {authLoading
                ? "투자 신청하기"
                : !user
                  ? "로그인하고 신청하기"
                  : user.identityVerified
                    ? "투자 신청하기"
                    : "본인확인하고 신청하기"}
            </Button>
            {!authLoading && user && !user.identityVerified ? (
              <p className="mt-2 text-center text-11 text-muted">
                모바일 신분증과 본인 명의 계좌를 확인한 뒤 이 신청으로 돌아옵니다
              </p>
            ) : null}
          </div>
          <p className="mt-4 text-12 leading-5 text-muted">
            투자금 사용 내역은 프로젝트 진행과 함께 공개돼요. 운영 결과에 따라 회수 금액과 기간이 달라질 수 있습니다.
          </p>
        </Card>
      </div>
    </Shell>
  );
}

function Metric({
  label,
  value,
  unit,
  bordered,
  accent,
  small,
}: {
  label: string;
  value: string;
  unit?: string;
  bordered?: boolean;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`px-6 py-5 ${bordered ? "border-l border-line-soft" : ""}`}>
      <p className="text-13 text-muted">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span
          className={`font-num font-medium ${small ? "text-14" : "text-24"} ${
            accent ? "text-brand" : "text-ink"
          }`}
        >
          {value}
        </span>
        {unit ? <span className="text-15 text-body">{unit}</span> : null}
      </p>
    </div>
  );
}

function MilestoneRow({ m }: { m: MilestoneSummary }) {
  const tone = milestoneTone(m.status);
  return (
    <div className="flex items-center gap-4 border-b border-surface py-3.5 last:border-b-0">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          tone === "pass" ? "bg-brand" : "border border-line bg-white"
        }`}
      />
      <span className="flex-1 text-14 text-ink">
        {m.seq}단계 {m.name}
      </span>
      <span
        className={`w-[70px] text-13 ${
          tone === "pass"
            ? "font-medium text-brand"
            : tone === "fail"
              ? "font-medium text-danger"
              : "text-body"
        }`}
      >
        {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
      </span>
      <span className="w-[100px] text-13 text-muted">
        {m.completedAt ? shortDate(m.completedAt) : "—"}
      </span>
      <span className="w-[120px] text-right font-num text-14 font-medium text-ink">
        {won(m.releaseAmount)}
      </span>
    </div>
  );
}

function SectionLink({ label }: { label: string }) {
  return (
    <div className="flex h-[45px] items-center justify-between rounded-8 border border-line px-5 text-13 text-ink">
      {label}
      <span className="text-muted">›</span>
    </div>
  );
}

function QuickAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-6 border border-line text-12 text-body hover:bg-surface"
    >
      {label}
    </button>
  );
}
