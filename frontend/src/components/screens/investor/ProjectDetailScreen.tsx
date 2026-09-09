"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  InfoRow,
  ProgressBar,
  Shell,
  SkeletonBlock,
} from "@/components/ui";
import { PROJECT_DOCUMENTS } from "@/lib/project-document-list";
import {
  MAX_RECOVERY_MONTHS,
  PLAN_PACK_PRICE,
  breakEvenPacks,
  monthlyBreakdown,
  monthsToTarget,
  myMonthlyShare,
  packsForMonths,
  targetRecoveryAmount,
  type MonthlyBreakdown,
} from "@/lib/recovery-scenario";
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
  type ProjectDetail,
  type SettlementRule,
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
  // 회수 조건에서 지금 보고 있는 시나리오. null이면 아직 사업계획 기준을 따른다.
  const [packs, setPacks] = useState<number | null>(null);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);

  const scenario = useMemo(() => buildScenario(p, packs), [p, packs]);

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
  const remainingUnits =
    p.totalTokens != null ? Math.max(0, p.totalTokens - p.soldTokens) : null;
  const daysLeft = p.fundingEnd
    ? Math.max(
        0,
        Math.ceil(
          (new Date(p.fundingEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        ),
      )
    : null;
  const myUnitsToBuy = unit > 0 ? Math.floor(amount / unit) : 0;
  const overRemaining =
    remainingUnits != null && myUnitsToBuy > remainingUnits;
  // 아직 금액을 안 넣었으면 1구좌를 기준으로 시나리오를 보여준다 — 빈 칸보다 낫다.
  const basisAmount = amount >= unit ? amount : unit;

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
        {/*
          세 배지는 같은 층위의 사실이다. 테두리까지 각자 색을 가지면 셋이 서로 다른
          무게로 읽히고, 면까지 깔리면 그 하나만 떠오른다. 테두리는 선 색으로 묶고
          뜻은 글자 색으로만 구분한다.
        */}
        <span className="rounded-full border border-line px-3 py-1 text-11 font-medium text-danger">
          원금 비보장
        </span>
        <span className="rounded-full border border-line px-3 py-1 text-11 font-medium text-brand">
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
          {/*
            이 화면에서 큰 것은 모집 현황 하나다. 목표·모금액·달성률·참여자 수를
            같은 크기 칸에 늘어놓으면 무엇부터 봐야 하는지 화면이 말해주지 않는다.
            투자자가 먼저 알아야 할 것은 라운드가 아직 열려 있는지와 얼마가 남았는지다.
          */}
          <Card>
            <div className="flex items-end justify-between gap-5">
              <div>
                <p className="text-13 text-muted">지금까지 모인 금액</p>
                <p className="mt-1.5 font-num text-28 font-bold leading-tight text-ink">
                  {num(p.currentAmount)}
                  <span className="ml-1 text-16 font-medium text-body">원</span>
                </p>
              </div>
              <div className="text-right">
                <p className="font-num text-24 font-bold leading-tight text-brand">
                  {pct.toFixed(1)}%
                </p>
                <p className="mt-1 text-13 text-muted">
                  목표 {won(p.targetAmount)}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ProgressBar value={pct} height={8} />
            </div>
            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-num text-12 text-muted">
              {remainingUnits != null ? (
                <span>남은 {num(remainingUnits)}구좌</span>
              ) : null}
              <span>참여자 {p.investorCount}명</span>
              <span>1구좌 {won(p.tokenPrice)}</span>
              {daysLeft != null ? (
                <span className="ml-auto font-medium text-body">
                  마감까지 {daysLeft}일
                </span>
              ) : null}
            </div>
          </Card>

          {/*
            회수 숫자는 조건과 붙어 있어야 한다. 115%만 따로 칸에 앉히면 확정 수익률로
            읽힌다. 문장 → 시나리오 → 직접 조작 → 하방 순서로 두어, 숫자를 보기 전에
            그 숫자가 선 가정을 먼저 읽게 한다.
          */}
          {scenario ? (
            <Card className="mt-6" padded={false}>
              <div className="px-6 pt-5">
                <p className="text-11 font-semibold uppercase tracking-wider text-muted">
                  회수 조건
                </p>
                <p className="mt-2.5 max-w-[60ch] text-14 leading-7 text-body">
                  이 지점이 하루 <b className="font-semibold text-ink">{scenario.planPacks}팩</b>을
                  팔면, 영업 개시 후{" "}
                  <b className="font-semibold text-ink">약 {p.paybackMonths}개월</b>에 걸쳐
                  원금의{" "}
                  <b className="font-semibold text-ink">{p.targetReturnPct}%</b>까지
                  돌려주는 것을 목표로 합니다. 확정 수익률이 아니라{" "}
                  <span className="font-medium text-danger">
                    판매 실적에 따라 달라지는 목표치
                  </span>
                  입니다.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 px-6 pt-4">
                {scenario.presets.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setPacks(s.packs)}
                    className={`rounded-8 border px-3.5 py-2 text-left transition-colors ${
                      s.packs === scenario.packs
                        ? "border-ink bg-surface"
                        : "border-line hover:bg-surface"
                    }`}
                  >
                    <span className="block text-11 text-muted">{s.label}</span>
                    <span className="block font-num text-13 font-semibold text-ink">
                      일 {s.packs}팩
                    </span>
                    <span className="block font-num text-11 text-muted">
                      {s.monthsLabel}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-[246px_1fr] items-center gap-7 px-6 py-5">
                <div>
                  <div className="flex items-baseline justify-between text-12 text-muted">
                    <span>직접 넣어보기 · 일 판매량</span>
                    <strong className="font-num text-18 font-semibold text-ink">
                      {scenario.packs}팩
                    </strong>
                  </div>
                  <input
                    type="range"
                    aria-label="일 판매량"
                    className="mt-2.5 w-full accent-ink"
                    min={scenario.sliderMin}
                    max={scenario.sliderMax}
                    step={2}
                    value={scenario.packs}
                    onChange={(e) => setPacks(Number(e.target.value))}
                  />
                  <div className="mt-0.5 flex justify-between font-num text-11 text-muted">
                    <span>{scenario.sliderMin}</span>
                    <span>손익분기 {scenario.breakEven}</span>
                    <span>{scenario.sliderMax}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-5">
                  <Projection
                    label="월 배분 재원"
                    value={won(scenario.pool)}
                    foot="고정비를 뺀 뒤 남는 돈"
                    danger={scenario.pool <= 0}
                  />
                  <Projection
                    label={`${p.targetReturnPct}% 도달까지`}
                    value={scenario.monthsLabel}
                    foot="보장되지 않는 기간"
                    danger={scenario.months == null || scenario.months > 36}
                  />
                  <Projection
                    label={`${won(basisAmount)} 기준`}
                    value={`월 ${won(
                      myMonthlyShare(scenario.pool, basisAmount, p.targetAmount ?? 0),
                    )}`}
                    foot={
                      scenario.months != null &&
                      scenario.months <= MAX_RECOVERY_MONTHS
                        ? `도달 시 누적 ${won(
                            (basisAmount * (p.targetReturnPct ?? 100)) / 100,
                          )}`
                        : `${MAX_RECOVERY_MONTHS}개월 내 도달 실패`
                    }
                  />
                </div>
              </div>

              {/*
                경고를 붉은 면으로 깔지 않는다. 브랜드 초록과 채도가 맞지 않아 두 색이
                따로 놀고, 면이 넓을수록 읽기도 나빠진다. 붉은색은 원금 비보장 배지와
                같은 무게로 — 숫자 몇 개에만 쓴다.
              */}
              <p className="border-t border-line-soft bg-surface px-6 py-3.5 text-12 leading-6 text-body">
                하루 <b className="font-semibold text-danger">{scenario.breakEven}팩</b>{" "}
                아래로 떨어지면 그 달 배분은{" "}
                <b className="font-semibold text-danger">0원</b>입니다. 부진이 이어지면
                회수 기간이 최대 {MAX_RECOVERY_MONTHS}개월까지 늘어나고, 원금 전액을
                돌려받지 못할 수 있습니다.
              </p>
            </Card>
          ) : null}

          {/* 매출이 곧 수익으로 읽히지 않도록, 비용이 빠지는 순서를 그대로 보여준다. */}
          {scenario ? (
            <>
              <h2 className="mt-10 text-15 font-bold text-ink">
                매출이 배분에 닿기까지
              </h2>
              <Card className="mt-4" padded={false}>
                <FlowRow label="월 매출" amount={scenario.breakdown.revenue} share={1} />
                <FlowRow
                  label="팩당 변동비"
                  amount={-scenario.breakdown.variableCost}
                  share={scenario.breakdown.variableCost / scenario.breakdown.revenue}
                />
                <FlowRow
                  label={`결제 수수료 ${(scenario.rule.paymentFeeRate * 100).toFixed(1)}%`}
                  amount={-scenario.breakdown.paymentFee}
                  share={scenario.breakdown.paymentFee / scenario.breakdown.revenue}
                />
                <FlowRow
                  label="운영자 보수"
                  amount={-scenario.rule.operatorPay}
                  share={scenario.rule.operatorPay / scenario.breakdown.revenue}
                />
                <FlowRow
                  label="전기·관리·수도"
                  amount={-scenario.rule.facilityCost}
                  share={scenario.rule.facilityCost / scenario.breakdown.revenue}
                />
                <FlowRow
                  label="소모품·유지보수"
                  amount={-scenario.rule.unitUpkeepCost}
                  share={scenario.rule.unitUpkeepCost / scenario.breakdown.revenue}
                />
                <FlowRow
                  label="팜피 이용료"
                  amount={-scenario.rule.platformFee}
                  share={scenario.rule.platformFee / scenario.breakdown.revenue}
                />
                <FlowRow
                  label="투자자 배분 재원"
                  amount={scenario.pool}
                  share={scenario.pool / scenario.breakdown.revenue}
                  total
                />
              </Card>
            </>
          ) : null}

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
          {/* 집행과 회수가 같은 시간축 위에 있다는 걸 여기서 한 번 이어준다. */}
          {milestones.length > 0 ? (
            <p className="mt-3 rounded-8 bg-surface px-4 py-3 text-12 leading-5 text-muted">
              마지막 단계인 {milestones[milestones.length - 1].seq}단계{" "}
              {milestones[milestones.length - 1].name}를 통과한 시점부터 월 배분이
              시작됩니다. 이전 단계에서는 배분이 발생하지 않습니다.
            </p>
          ) : null}

          <div className="mt-8 grid grid-cols-3 gap-4">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() =>
                  setOpenSection((cur) => (cur === s.key ? null : s.key))
                }
                className={`flex h-[45px] items-center justify-between rounded-8 border px-5 text-13 transition-colors ${
                  openSection === s.key
                    ? "border-ink bg-surface font-medium text-ink"
                    : "border-line text-ink hover:bg-surface"
                }`}
              >
                {s.label}
                <span className="text-muted">
                  {openSection === s.key ? "⌄" : "›"}
                </span>
              </button>
            ))}
          </div>
          {openSection ? (
            <div className="mt-3 rounded-8 border border-line bg-surface px-6 py-5">
              <dl className="grid grid-cols-[150px_1fr] gap-x-5 gap-y-2.5 text-13">
                {sectionRows(openSection, p, scenario).map(([k, v]) => (
                  <Fragment key={k}>
                    <dt className="text-muted">{k}</dt>
                    <dd className="m-0 font-num text-ink">{v}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          ) : null}

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
                value={
                  scenario
                    ? `월 정산 · 목표 ${p.targetReturnPct}% · 손익분기 일 ${scenario.breakEven}팩`
                    : "월 정산 · 보유 구좌 비례"
                }
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
          <div className="mt-2 flex justify-between gap-3 font-num text-12">
            <span className="text-muted">
              {amount > 0 ? `${num(myUnitsToBuy)}구좌` : `${won(unit)} 단위`}
            </span>
            {remainingUnits != null ? (
              <span className={overRemaining ? "text-danger" : "text-muted"}>
                {overRemaining
                  ? `잔여 ${num(remainingUnits)}구좌를 넘습니다`
                  : `잔여 ${num(remainingUnits)}구좌 안`}
              </span>
            ) : null}
          </div>

          {/*
            금액을 넣는 순간 그 금액의 회수 시나리오가 이 자리에서 계산된다.
            화면을 떠나야 알 수 있으면 판단에 쓰이지 않는다. 단일 확정액으로 읽히지
            않도록 숫자에는 "예상"을, 상자 안에는 원금 미달 가능성을 함께 둔다.
            신청 버튼 바로 위라 강조가 필요한데, 면을 칠하는 대신 테두리를 두껍게 준다.
          */}
          {scenario && amount >= unit ? (
            <div className="mt-3 rounded-8 border-2 border-brand px-4 py-3">
              <p className="text-11 font-semibold text-brand">
                이 금액의 회수 시나리오
              </p>
              <p className="mt-1.5 font-num text-18 font-semibold text-ink">
                월 {won(myMonthlyShare(scenario.pool, amount, p.targetAmount ?? 0))}
                <span className="ml-1.5 rounded-4 border border-line px-1 text-11 font-medium text-muted">
                  예상
                </span>
              </p>
              <p className="mt-1.5 text-11 leading-5 text-body">
                일 {scenario.packs}팩 기준 {scenario.monthsLabel}에 걸쳐 받고, 다 채우면
                누적 {won((amount * (p.targetReturnPct ?? 100)) / 100)}입니다.{" "}
                <b className="font-semibold text-danger">목표는 보장되지 않으며</b>{" "}
                판매가 부진하면 총액이 원금 {won(amount)}에 못 미칠 수 있습니다.
              </p>
            </div>
          ) : null}

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
              disabled={authLoading || !canApply || amount < unit || overRemaining}
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

/**
 * 예측값. 브랜드 초록은 실제로 일어난 일(모집 진행률)에만 쓰고, 여기 숫자는 먹색에
 * "예상" 표를 단다. 회수기간이 짧게 나와도 초록으로 칭찬하지 않는다 — 그 순간
 * 예측이 약속처럼 읽힌다.
 */
function Projection({
  label,
  value,
  foot,
  danger,
}: {
  label: string;
  value: string;
  foot: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-11 text-muted">
        {label}
        <span className="rounded-4 border border-line px-1 text-11 font-medium">
          예상
        </span>
      </p>
      <p
        className={`mt-1 font-num text-18 font-semibold ${
          danger ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-11 text-muted">{foot}</p>
    </div>
  );
}

/** 매출에서 비용이 빠지는 순서 한 줄. 막대 길이는 매출 대비 비중이다. */
function FlowRow({
  label,
  amount,
  share,
  total,
}: {
  label: string;
  amount: number;
  share: number;
  total?: boolean;
}) {
  const width = Math.max(1, Math.min(100, share * 100));
  return (
    <div
      className={`grid grid-cols-[140px_1fr_120px] items-center gap-4 border-b border-line-soft px-6 py-3 last:border-b-0 ${
        total ? "bg-surface" : ""
      }`}
    >
      <span className={`text-13 ${total ? "font-medium text-brand" : "text-body"}`}>
        {label}
      </span>
      {/*
        비용은 사고가 아니라 정상 지출이다. 붉게 칠하면 경고와 같은 무게가 되어
        정작 하방 경고가 묻힌다. 회색으로 두고, 초록은 마지막 배분 재원 한 줄에만 쓴다.
      */}
      <span
        className={`h-2 rounded-4 ${
          total ? "bg-brand" : amount < 0 ? "bg-muted/40" : "bg-line"
        }`}
        style={{ width: `${width}%` }}
      />
      <span
        className={`text-right font-num text-13 ${
          amount < 0
            ? "text-body"
            : total
              ? "font-semibold text-brand"
              : "font-semibold text-ink"
        }`}
      >
        {amount < 0 ? `-${won(-amount)}` : won(amount)}
      </span>
    </div>
  );
}

type SectionKey = "overview" | "space" | "terms";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "overview", label: "프로젝트 개요" },
  { key: "space", label: "공간 · 운영자 정보" },
  { key: "terms", label: "수익 구조와 회수 기준" },
];

const BUILDING_TYPE_LABEL: Record<string, string> = {
  vacant_store: "공실 상가",
  rooftop: "옥상",
  indoor: "실내",
};

const PARTNER_ROLE_LABEL: Record<string, string> = {
  landlord: "건물주",
  equipment_partner: "설비 파트너",
};

/** 펼친 박스가 보여줄 줄들. 값이 없는 줄은 아예 만들지 않는다. */
function sectionRows(
  key: SectionKey,
  p: ProjectDetail,
  scenario: Scenario | null,
): [string, string][] {
  const rows: [string, string][] = [];
  if (key === "overview") {
    if (p.description) rows.push(["설명", p.description]);
    rows.push(["위치", p.location ?? "미정"]);
    if (p.buildingType) {
      rows.push(["건물 유형", BUILDING_TYPE_LABEL[p.buildingType] ?? p.buildingType]);
    }
    if (p.areaSqm) rows.push(["면적", `${p.areaSqm}㎡`]);
    if (p.esgTag) rows.push(["ESG", p.esgTag]);
    rows.push(["총 설비비", won(p.totalCapex)]);
    return rows;
  }
  if (key === "space") {
    rows.push(["운영자", p.operator?.name ?? "배정 전"]);
    rows.push(["주소", p.location ?? "미정"]);
    if (p.areaSqm) rows.push(["공간 규모", `${p.areaSqm}㎡`]);
    for (const partner of p.partners) {
      rows.push([
        PARTNER_ROLE_LABEL[partner.role] ?? partner.role,
        `${partner.name} · 출자 ${won(partner.totalContribution)}`,
      ]);
    }
    return rows;
  }
  rows.push(["배분 방식", "월 정산, 보유 구좌 수에 비례"]);
  if (!scenario) return rows;
  rows.push(["연 프리미엄", `연 ${(scenario.rule.annualPremiumRate * 100).toFixed(0)}%`]);
  rows.push([
    "회수 기간",
    `기준 ${scenario.rule.recoveryMonths}개월, 실적에 따라 최대 ${MAX_RECOVERY_MONTHS}개월까지 연장`,
  ]);
  rows.push([
    "목표 총 회수율",
    `${p.targetReturnPct}% (원금 100% + 프리미엄 ${(p.targetReturnPct ?? 100) - 100}%)`,
  ]);
  rows.push([
    "손익분기 판매량",
    `일 ${scenario.breakEven}팩. 이보다 적게 팔리면 그 달의 배분 재원은 0원`,
  ]);
  rows.push([
    "가정",
    `팩 평균 단가 ${won(PLAN_PACK_PRICE)} · 팩당 변동비 ${won(
      scenario.rule.unitVariableCost,
    )} · 결제 수수료 ${(scenario.rule.paymentFeeRate * 100).toFixed(1)}%`,
  ]);
  return rows;
}

type Scenario = {
  rule: SettlementRule;
  /** 지금 보고 있는 일 판매량. */
  packs: number;
  /** 사업계획이 전제한 일 판매량. paybackMonths에서 역산한다. */
  planPacks: number;
  breakEven: number;
  sliderMin: number;
  sliderMax: number;
  breakdown: MonthlyBreakdown;
  pool: number;
  months: number | null;
  monthsLabel: string;
  presets: { label: string; packs: number; monthsLabel: string }[];
};

function monthsLabel(months: number | null): string {
  if (months == null) return "도달 불가";
  if (months > MAX_RECOVERY_MONTHS) return `${MAX_RECOVERY_MONTHS}개월 초과`;
  return `${months >= 10 ? Math.round(months) : months.toFixed(1)}개월`;
}

/**
 * 회수 조건에 필요한 값을 한 번에 낸다. 정산 규칙이나 목표치가 비어 있으면 null이고,
 * 화면은 그 블록 자체를 그리지 않는다 — 반쪽 숫자를 보여주면 오히려 오해를 만든다.
 */
function buildScenario(
  p: ProjectDetail | undefined,
  picked: number | null,
): Scenario | null {
  const rule = p?.settlementRule;
  if (
    !p ||
    !rule ||
    !p.targetAmount ||
    p.targetReturnPct == null ||
    p.paybackMonths == null
  ) {
    return null;
  }

  const target = targetRecoveryAmount(p.targetAmount, p.targetReturnPct);
  const planPacks = packsForMonths(rule, target, p.paybackMonths);
  if (!Number.isFinite(planPacks)) return null;

  const breakEven = breakEvenPacks(rule);
  const packs = picked ?? planPacks;
  const breakdown = monthlyBreakdown(packs, rule);
  const months = monthsToTarget(breakdown.pool, target);

  const conservative = packsForMonths(rule, target, rule.recoveryMonths);
  const presets = [
    { label: "보수", packs: conservative },
    { label: "사업계획 기준", packs: planPacks },
    { label: "기준 상회", packs: Math.round(planPacks * 1.3) },
  ].map((s) => ({
    ...s,
    monthsLabel: monthsLabel(
      monthsToTarget(monthlyBreakdown(s.packs, rule).pool, target),
    ),
  }));

  return {
    rule,
    packs,
    planPacks,
    breakEven,
    // 손익분기 아래까지 내려볼 수 있어야 배분이 0원이 되는 걸 직접 확인한다.
    sliderMin: Math.max(1, breakEven - 12),
    sliderMax: Math.round(planPacks * 1.6),
    breakdown,
    pool: breakdown.pool,
    months,
    monthsLabel: monthsLabel(months),
    presets,
  };
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
