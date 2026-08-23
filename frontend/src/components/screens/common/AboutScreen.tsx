"use client";

import Link from "next/link";
import { Button, Card, Shell, StatRow } from "@/components/ui";
import { num, useProjects } from "../api";

const STEPS = [
  {
    seq: 1,
    title: "공간 확보",
    desc: "지자체·소유자와 사용 협약을 맺고 유휴 상가를 확보합니다.",
  },
  {
    seq: 2,
    title: "자금 모집",
    desc: "설비 전환에 필요한 금액을 투자자에게 모읍니다.",
  },
  {
    seq: 3,
    title: "단계 집행",
    desc: "증빙이 승인된 단계에만 신탁 계좌에서 자금이 나갑니다.",
  },
  {
    seq: 4,
    title: "운영 · 회수",
    desc: "매장 운영 결과에 따라 회수금이 정산됩니다.",
  },
];

const PILLARS = [
  {
    title: "단계별 집행",
    body: "계약 체결 · 설비 발주 · 설비 설치 · 시운전 · 영업 개시. 각 단계의 증빙이 승인돼야 다음 자금이 나갑니다.",
  },
  {
    title: "AI 교차 검증",
    body: "계약서·영수증 판독, 현장 사진 확인, 센서 이상 탐지를 함께 봅니다. 하나라도 어긋나면 사람이 다시 확인합니다.",
  },
  {
    title: "공개되는 기록",
    body: "제출한 증빙과 판정, 집행 내역이 프로젝트 화면에 남습니다. 감사 기록은 지우거나 고칠 수 없습니다.",
  },
];

export function AboutScreen() {
  const { data: projects } = useProjects();
  const list = projects ?? [];
  const raised = list.reduce((s, p) => s + p.currentAmount, 0);

  return (
    <Shell className="pt-0">
      <section
        className="-mx-[54px] flex h-[407px] flex-col justify-center bg-brand bg-cover bg-center px-[54px]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(20,84,46,0.78), rgba(20,84,46,0.78)), url('/assets/farm-operator-photo.png')",
        }}
      >
        <div className="mx-auto w-full max-w-[1332px]">
          <p className="text-14 font-medium text-white">FarmFi 소개</p>
          <h1 className="mt-4 text-[36px] font-bold leading-tight text-white">
            확인되지 않으면
            <br />
            집행되지 않습니다
          </h1>
          <p className="mt-11 text-14 leading-6 text-white">
            비어 있던 도심 상가를 스마트팜 매장으로 바꾸는 자금을 모읍니다.
            <br />
            모인 자금은 한 번에 나가지 않고, 확인된 단계마다 나눠 집행됩니다.
          </p>
          <div className="mt-5 flex gap-3">
            <Link
              href="/projects"
              className="flex h-[46px] items-center rounded-6 border border-white px-6 text-14 font-medium text-white"
            >
              프로젝트 보기
            </Link>
            <Link
              href="/operator/spaces"
              className="flex h-[46px] items-center rounded-6 border border-brand bg-white px-6 text-14 font-medium text-brand"
            >
              운영자로 시작하기
            </Link>
          </div>
        </div>
      </section>

      <StatRow
        items={[
          { label: "전체 프로젝트", value: list.length, unit: "개" },
          {
            label: "모집 중",
            value: list.filter((p) => p.status === "funding").length,
            unit: "개",
          },
          {
            label: "운영 중",
            value: list.filter((p) => p.status === "operating").length,
            unit: "개",
          },
          { label: "누적 모금액", value: num(raised), unit: "원" },
        ]}
      />

      <section className="pt-12">
        <h2 className="text-18 font-bold text-ink">돈이 나가는 방식</h2>
        <div className="mt-6 grid grid-cols-4 gap-4">
          {STEPS.map((s) => (
            <div
              key={s.seq}
              className="rounded-10 border border-line bg-white px-5 py-6"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-11 font-bold text-brand">
                {s.seq}
              </span>
              <p className="mt-4 text-15 font-bold text-ink">{s.title}</p>
              <p className="mt-2 text-12 leading-5 text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-12">
        <h2 className="text-18 font-bold text-ink">세 가지 장치</h2>
        <div className="mt-6 grid grid-cols-3 gap-5">
          {PILLARS.map((p) => (
            <Card key={p.title}>
              <h3 className="text-15 font-bold text-ink">{p.title}</h3>
              <p className="mt-3 text-13 leading-6 text-body">{p.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="pt-12">
        <Card className="flex items-center justify-between bg-brand">
          <div>
            <p className="text-17 font-bold text-white">
              도심의 빈 공간을 함께 바꿔보세요
            </p>
            <p className="mt-2 text-12 text-white">
              투자자 · 구매자 · 운영자 어느 쪽으로도 시작할 수 있어요.
            </p>
          </div>
          <Button variant="secondary" href="/start">
            시작하기
          </Button>
        </Card>
      </section>

      <p className="mt-8 text-11 text-muted">
        투자 원금은 보장되지 않습니다. 회수 금액과 기간은 각 매장의 매출과 운영비에 따라 달라집니다.
      </p>
    </Shell>
  );
}
