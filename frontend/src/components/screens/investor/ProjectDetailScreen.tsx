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
import { useAuth } from "@/lib/useAuth";
import {
  MILESTONE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  milestoneTone,
  num,
  shortDate,
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

const DOCUMENTS = [
  { name: "프로젝트 핵심 안내서.pdf", date: "2026.02.28" },
  { name: "임대차 계약서 요약본.pdf", date: "2026.02.20" },
  { name: "마일스톤 · 집행 계획서.pdf", date: "2026.02.28" },
  { name: "운영사 소개 · 재배 계획.pdf", date: "2026.03.02" },
];

export function ProjectDetailScreen({ id }: { id: string }) {
  const { data: p, isLoading, isError } = useProject(id);
  const { data: navInfo } = useProjectNav(id);
  const router = useRouter();
  const { user } = useAuth();

  const unit = p?.tokenPrice ?? 0;
  const [amount, setAmount] = useState(0);

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
              <h2 className="mt-10 text-15 font-bold text-ink">지점 기준가</h2>
              <p className="mt-1.5 text-12 text-muted">
                신탁 잔액 · 집행으로 생긴 자산 · 누적 회수금을 발행 구좌 수로 나눈 값입니다.
                거래 가격이 아니라 산정 기준입니다.
              </p>
              <Card className="mt-4" padded={false}>
                <div className="grid grid-cols-3">
                  <Metric label="1구좌 기준가" value={won(Math.round(navInfo.nav))} accent />
                  <Metric
                    label="발행가 대비"
                    value={
                      navInfo.issuePrice > 0
                        ? `${(((navInfo.nav - navInfo.issuePrice) / navInfo.issuePrice) * 100).toFixed(1)}%`
                        : "-"
                    }
                    bordered
                  />
                  <Metric
                    label="직전 대비"
                    value={`${navInfo.changeRate.toFixed(1)}%`}
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
                <div
                  key={d.name}
                  className="flex items-center justify-between border-b border-surface py-4 last:border-b-0"
                >
                  <span className="text-13 text-ink">{d.name}</span>
                  <span className="text-12 text-muted">{d.date}</span>
                </div>
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
            <Button
              full
              disabled={!canApply || amount < unit}
              onClick={() =>
                router.push(
                  `/projects/${p.id}/invest/eligibility?amount=${amount}`,
                )
              }
            >
              투자 신청하기
            </Button>
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
