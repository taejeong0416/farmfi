"use client";

import { useState } from "react";
import { PageHeading, Shell } from "@/components/ui";

/** 유닛 하나가 한 달에 내는 팩 수와, 그중 실제로 팔리는 비율. */
const YIELD = 110;
const SELL = 0.9;
/** 유닛당 월 소모품·재배비(부가세 포함) + 유지보수비. */
const UNIT_COST = 50000 * 1.07 + 6000;
/** 결제 수수료 — 매출의 1.5%. */
const FEE_RATE = 0.015;
/** 목표 하루 판매량의 85%까지가 여유, 100%까지가 빠듯, 넘으면 못 판다. */
const EASE = 0.85;

const PREM = [6, 8, 10, 12];
const MON = [12, 15, 18, 24, 30];

const num = (v: number) => Math.round(v).toLocaleString("ko-KR");

type Inputs = {
  units: number;
  price: number;
  cogs: number;
  op: number;
  opex: number;
  ff: number;
  total: number;
  gov: number;
  thr: number;
};

const DEFAULTS: Inputs = {
  units: 15,
  price: 5500,
  cogs: 1800,
  op: 100,
  opex: 90,
  ff: 30,
  total: 5000,
  gov: 3000,
  thr: 49,
};

/** 투자금을 T개월에 걸쳐 연 r% 프리미엄과 함께 돌려줄 때의 월 상환액. */
function invMonthly(capex: number, r: number, T: number) {
  return (capex * (1 + (r / 100) * (T / 12))) / T;
}

type Tone = "go" | "warn" | "over";

const NUM_TONE: Record<Tone, string> = {
  go: "text-brand",
  warn: "text-accent-operator",
  over: "text-danger",
};

const DOT_TONE: Record<Tone, string> = {
  go: "bg-brand",
  warn: "bg-accent-operator",
  over: "bg-danger",
};

/** 가정값 한 칸. 이름 / 단위 / 값 세 줄을 고정 자리에 두어 칸마다 값의 baseline이 맞는다. */
function Cell({
  name,
  unit,
  children,
}: {
  name: string;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <div className="-ml-px -mt-px grid min-w-0 content-start border-l border-t border-line bg-white px-4 py-3.5">
      <span className="text-12 font-bold leading-4 text-body">{name}</span>
      <span className="min-h-[17px] text-11 font-medium leading-4 text-muted">
        {unit}
      </span>
      {children}
    </div>
  );
}

const FIELD =
  "mt-2 w-full border-none bg-transparent p-0 font-num text-20 font-bold tracking-[-0.015em] text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** 계산이 내놓는 값. 손으로 고치는 칸과 같은 자리, 같은 크기로 두되 색으로 가른다. */
function Out({ children, over }: { children: React.ReactNode; over?: boolean }) {
  return (
    <span
      className={`mt-2 block w-full font-num text-20 font-bold tracking-[-0.015em] ${
        over ? "text-danger" : "text-brand"
      }`}
    >
      {children}
    </span>
  );
}

export function BreakevenScreen() {
  const [v, setV] = useState<Inputs>(DEFAULTS);
  const [sel, setSel] = useState({ prem: 10, mon: 18 });

  // 유닛 개수를 건드리면 목표가 유닛이 내는 양으로 다시 채워진다. 내림으로 채워야
  // 재채움 직후에 능력 초과로 잡히지 않는다.
  const set = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value) || 0;
    setV((p) =>
      k === "units"
        ? { ...p, units: n, thr: Math.floor((Math.max(0, n) * YIELD * SELL) / 30) }
        : { ...p, [k]: n },
    );
  };

  const units = Math.max(0, v.units);
  const fee = Math.round(v.price * FEE_RATE);
  const margin = v.price - v.cogs - fee;
  const capacity = units * YIELD * SELL;
  const capDay = Math.floor(capacity / 30);
  const unitCost = units * UNIT_COST;
  const capex = Math.max(0, v.total - v.gov) * 1e4;
  // 매장이 배당 전에 매달 짊어지는 돈.
  const monthly = (v.op + v.opex + v.ff) * 1e4 + unitCost;

  const broken =
    units < 1
      ? "유닛을 1개 이상 두어야 계산이 선다."
      : margin <= 0
        ? "판매가가 팩당 변동비와 결제 수수료를 넘어야 계산이 선다."
        : v.thr < 1
          ? "목표 일판매를 1팩 이상으로 잡아야 한다."
          : "";

  const dayReq = (r: number, T: number) => {
    const inv = invMonthly(capex, r, T);
    return { day: (monthly + inv) / margin / 30, inv };
  };

  // 칸에 적히는 반올림값으로 갈라 색과 범례가 어긋나지 않게 한다.
  const ease = Math.floor(v.thr * EASE);
  const toneOf = (d: number): Tone => {
    const n = Math.round(d);
    return n <= ease ? "go" : n <= v.thr ? "warn" : "over";
  };

  const res = dayReq(sel.prem, sel.mon);
  const verdict: Record<Tone, string> = {
    go: `목표 ${v.thr}팩 안에서 매장과 투자자가 함께 돌아간다`,
    warn: `목표 ${v.thr}팩을 거의 다 팔아야 닿는다. 비수기 판매를 따로 잡아야 한다`,
    over: `목표 ${v.thr}팩을 넘는다. 유닛을 늘리거나 조달 조건을 다시 잡아야 한다`,
  };
  const tone = toneOf(res.day);

  // 하루 몇 팩이 어디로 가는가. 매장이 먹는 몫은 무채 4단, 투자자 회수만 브랜드 그린.
  const per = (x: number) => x / margin / 30;
  const stack = [
    { key: "op", label: "운영자 생계", bar: "bg-ink text-white", dot: "bg-ink", day: per(v.op * 1e4) },
    { key: "fx", label: "고정 운영비", bar: "bg-body text-white", dot: "bg-body", day: per(v.opex * 1e4) },
    { key: "un", label: "유닛 연동비", bar: "bg-muted text-white", dot: "bg-muted", day: per(unitCost) },
    { key: "ff", label: "팜피 구독료", bar: "bg-line text-ink", dot: "bg-line", day: per(v.ff * 1e4) },
    { key: "inv", label: "투자자 회수", bar: "bg-brand text-white", dot: "bg-brand", day: per(res.inv) },
  ];
  const stackTotal = stack.reduce((s, p) => s + p.day, 0);

  return (
    <Shell>
      <div className="mx-auto max-w-[1020px]">
        <PageHeading
          eyebrow="단위경제 타당성"
          title="하루 몇 팩을 팔아야 하는가"
          desc="매장 하나가 운영비와 투자자 회수를 함께 감당하려면 하루 몇 팩이 필요한지 계산합니다."
        />

        {/* ── 가정값 ─────────────────────────────
            단가 6 · 월 비용 4 · 조달 3. 줄당 칸 수를 묶음 크기의 약수로만 두어
            어느 폭에서도 줄이 꽉 차고 칸 폭이 벌어지지 않는다. */}
        <div className="mb-9 overflow-hidden rounded-8 border border-line bg-white">
          <div className="grid grid-cols-2 min-[560px]:grid-cols-3 min-[1000px]:grid-cols-6">
            <Cell name="유닛 개수" unit="개">
              <input
                type="number"
                inputMode="numeric"
                aria-label="유닛 개수"
                className={FIELD}
                value={v.units}
                onChange={set("units")}
              />
            </Cell>
            <Cell name="월 판매량" unit={`팩/월 · 하루 ${capDay}팩`}>
              <Out>{num(capacity)}</Out>
            </Cell>
            <Cell name="판매가" unit="원/팩">
              <input
                type="number"
                inputMode="numeric"
                aria-label="판매가"
                className={FIELD}
                value={v.price}
                onChange={set("price")}
              />
            </Cell>
            <Cell name="팩당 변동비" unit="원/팩">
              <input
                type="number"
                inputMode="numeric"
                aria-label="팩당 변동비"
                className={FIELD}
                value={v.cogs}
                onChange={set("cogs")}
              />
            </Cell>
            {/* 수수료는 매출에 비례하니 팩당 마진에서 빼고, 칸에는 이 규모에서 월 얼마인지 적는다. */}
            <Cell name="변동 운영비" unit="만원/월 · 매출의 1.5%">
              <Out>{((fee * capacity) / 1e4).toFixed(1)}</Out>
            </Cell>
            <Cell name="팩당 마진" unit="원/팩">
              <Out>{num(margin)}</Out>
            </Cell>
          </div>

          <div className="grid grid-cols-2 min-[700px]:grid-cols-4">
            <Cell name="운영자 생계" unit="만원/월">
              <input
                type="number"
                inputMode="numeric"
                aria-label="운영자 생계"
                className={FIELD}
                value={v.op}
                onChange={set("op")}
              />
            </Cell>
            <Cell name="고정 운영비" unit="만원/월 · 전기·관리·수도">
              <input
                type="number"
                inputMode="numeric"
                aria-label="고정 운영비"
                className={FIELD}
                value={v.opex}
                onChange={set("opex")}
              />
            </Cell>
            <Cell name="팜피 구독료" unit="만원/월">
              <input
                type="number"
                inputMode="numeric"
                aria-label="팜피 구독료"
                className={FIELD}
                value={v.ff}
                onChange={set("ff")}
              />
            </Cell>
            <Cell name="유닛 연동비" unit="만원/월 · 소모품·유지보수">
              <Out>{(unitCost / 1e4).toFixed(1)}</Out>
            </Cell>
          </div>

          <div className="grid grid-cols-3">
            <Cell name="초기 조성비" unit="만원">
              <input
                type="number"
                inputMode="numeric"
                aria-label="초기 조성비"
                className={FIELD}
                value={v.total}
                onChange={set("total")}
              />
            </Cell>
            <Cell name="공공 지원" unit="만원 · 공간·리모델링">
              <input
                type="number"
                inputMode="numeric"
                aria-label="공공 지원"
                className={FIELD}
                value={v.gov}
                onChange={set("gov")}
              />
            </Cell>
            <Cell name="투자자 조달" unit="만원 · 설비투자금">
              <Out>{num(capex / 1e4)}</Out>
            </Cell>
          </div>
        </div>

        {/* ── 결과 ──────────────────────────────── */}
        <section className="mb-10 rounded-8 border border-line bg-white px-7 py-7 shadow-[0_10px_28px_rgba(20,50,27,0.055)]">
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-13 font-semibold text-body">
            <span className="inline-flex items-center rounded-8 border border-line px-3 py-1.5 font-bold text-brand">
              연 {sel.prem}% 프리미엄 · {sel.mon}개월 회수
            </span>
            <span className="inline-flex items-baseline gap-1">
              목표
              <input
                type="number"
                inputMode="numeric"
                aria-label="목표 일판매"
                value={v.thr}
                onChange={set("thr")}
                className={`w-[3.5ch] border-none border-b-[1.5px] border-solid bg-transparent p-0 pb-0.5 text-center font-num text-14 font-extrabold outline-none ${
                  v.thr > capDay
                    ? "border-b-danger text-danger"
                    : "border-b-line text-ink focus:border-b-brand"
                }`}
              />
              팩/일
            </span>
          </div>

          {broken ? (
            <p className="py-1.5 text-15 font-bold text-danger">{broken}</p>
          ) : (
            <>
              <p className="mb-1.5 text-12 font-bold text-body">필요</p>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                <span
                  className={`font-num text-[46px] font-extrabold leading-none tracking-[-0.035em] sm:text-[64px] ${NUM_TONE[tone]}`}
                >
                  {res.day.toFixed(0)}
                </span>
                <span className="text-16 font-bold text-body">팩 / 일</span>
              </div>
              <p
                className={`mt-3.5 inline-flex items-center gap-2.5 text-13 font-bold ${NUM_TONE[tone]}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_TONE[tone]}`} />
                {verdict[tone]}
              </p>

              <div className="mt-7 border-t border-line-soft pt-5">
                <p className="mb-2.5 text-12 font-bold text-body">
                  이 판매량을 누가 가져가는가
                </p>
                <div className="flex h-[34px] overflow-hidden rounded-8 bg-surface">
                  {stack.map((s) => (
                    <div
                      key={s.key}
                      className={`flex min-w-0 items-center justify-center whitespace-nowrap text-11 font-bold ${s.bar}`}
                      style={{ width: `${((s.day / stackTotal) * 100).toFixed(1)}%` }}
                    >
                      {s.day >= stackTotal * 0.1 ? s.day.toFixed(0) : ""}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-[18px] gap-y-2 text-12 font-semibold text-muted">
                  {stack.map((s) => (
                    <span
                      key={s.key}
                      className={s.key === "inv" ? "text-brand" : undefined}
                    >
                      <i
                        className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] align-middle ${s.dot}`}
                      />
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          <p className="mt-5 border-t border-line-soft pt-5 text-13 leading-[1.75] text-body">
            소비자 설문 <b className="font-bold text-ink">107명</b> 가운데{" "}
            <b className="font-bold text-ink">97명</b>이 야간에 신선식품을 살 곳이
            없다고 답했다. 한두 끼 분량의 소량 구매를 선호한 응답이 98명, 매장을 보면 그
            자리에서 사겠다는 응답이 93명이다.
          </p>
        </section>

        {/* ── 매트릭스 ───────────────────────────
            칸 하나하나가 기준안 선택 버튼이다. */}
        {broken ? null : (
          <>
            <div className="mb-3.5 flex flex-col items-start justify-between gap-1.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-4">
              <h2 className="text-18 font-bold tracking-[-0.015em] text-ink">
                투자 조건별 필요 판매량
              </h2>
              <span className="text-13 font-semibold text-muted">
                칸을 누르면 위 조건이 바뀐다
              </span>
            </div>

            <div className="overflow-x-auto rounded-8 border border-line bg-white px-5 py-4 shadow-[0_10px_28px_rgba(20,50,27,0.055)]">
              <table className="w-full min-w-[540px] border-collapse">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap px-1 pb-2.5 text-left text-12 font-extrabold text-brand">
                      연 프리미엄
                    </th>
                    {MON.map((m) => (
                      <th
                        key={m}
                        className="px-1 pb-2.5 text-12 font-bold text-muted"
                      >
                        {m}개월 회수
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PREM.map((r) => (
                    <tr key={r}>
                      <th className="whitespace-nowrap pr-3.5 text-right text-13 font-bold text-ink">
                        {r}%
                      </th>
                      {MON.map((m) => {
                        const d = dayReq(r, m).day;
                        const on = r === sel.prem && m === sel.mon;
                        return (
                          <td key={m} className="p-0 text-center">
                            {/* 테두리는 격자 역할만 한다. 구간은 숫자 색 하나로만 가른다. */}
                            <button
                              type="button"
                              aria-pressed={on}
                              onClick={() => setSel({ prem: r, mon: m })}
                              className={`m-[3px] block w-[calc(100%-6px)] rounded-8 bg-white px-1 py-2.5 text-center font-num text-18 font-extrabold tracking-[-0.02em] transition-[transform,box-shadow] duration-150 ${
                                NUM_TONE[toneOf(d)]
                              } ${
                                on
                                  ? "shadow-[inset_0_0_0_2px_#14542E,0_6px_16px_rgba(20,50,27,0.14)]"
                                  : "shadow-[inset_0_0_0_1px_#E5E5E3] hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_#8A8A8A,0_6px_16px_rgba(20,50,27,0.1)]"
                              }`}
                            >
                              {d.toFixed(0)}
                              <span className="mt-0.5 block text-11 font-semibold tracking-normal text-muted">
                                팩/일
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <th className="pr-3.5 text-right text-12 font-semibold text-muted">
                      배당 전 운영선
                    </th>
                    {MON.map((m) => (
                      <td key={m} className="p-0 text-center">
                        <div className="m-[3px] block w-[calc(100%-6px)] rounded-8 border border-dashed border-line px-1 py-2.5 font-num text-15 font-bold text-muted">
                          {(monthly / margin / 30).toFixed(0)}
                          <span className="mt-0.5 block text-11 font-semibold text-muted">
                            팩/일
                          </span>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 범례도 칸과 같은 방식으로 읽힌다 — 색은 숫자에만 있다. */}
            <div className="mt-4 grid gap-2 text-12 text-body">
              <span className="flex flex-wrap items-baseline gap-2.5">
                <b className="min-w-[88px] shrink-0 font-extrabold text-brand">
                  {ease}팩 이하
                </b>
                <em className="font-medium not-italic text-muted">
                  유닛이 내는 양 안에서 여유가 있다
                </em>
              </span>
              <span className="flex flex-wrap items-baseline gap-2.5">
                <b className="min-w-[88px] shrink-0 font-extrabold text-accent-operator">
                  {v.thr > ease ? `${ease + 1}–${v.thr}팩` : "해당 없음"}
                </b>
                <em className="font-medium not-italic text-muted">
                  낼 수 있는 양을 거의 다 팔아야 닿는다
                </em>
              </span>
              <span className="flex flex-wrap items-baseline gap-2.5">
                <b className="min-w-[88px] shrink-0 font-extrabold text-danger">
                  {v.thr + 1}팩 이상
                </b>
                <em className="font-medium not-italic text-muted">
                  유닛을 늘리거나 조달 조건을 다시 잡아야 한다
                </em>
              </span>
              <span className="flex flex-wrap items-baseline gap-2.5">
                <b className="min-w-[88px] shrink-0 font-extrabold text-muted">
                  점선 칸
                </b>
                <em className="font-medium not-italic text-muted">
                  투자자 배당을 뺀 매장 운영선
                </em>
              </span>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
