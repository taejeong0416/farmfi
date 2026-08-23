"use client";

import Link from "next/link";
import { AuthShell, Button } from "@/components/ui";

export function StartScreen() {
  return (
    <AuthShell wide header>
      <h1 className="text-28 font-bold text-ink">어떤 서비스를 이용할까요?</h1>
      <p className="mt-3 text-14 text-muted">
        로그인한 계정으로 투자, 정기구독, 운영 서비스를 이용할 수 있어요.
      </p>

      <div className="mt-10 grid grid-cols-2 gap-6">
        <PurposeCard
          title="투자자로 이용"
          lines={[
            "검증된 단계에만 집행되는",
            "공실 전환 프로젝트에 투자해요.",
          ]}
          note="프로젝트 보기 · 내 투자 확인"
          href="/projects"
          cta="투자자 화면으로"
        />
        <PurposeCard
          title="구매자로 이용"
          lines={[
            "가까운 미니팜에서 수확한",
            "선택한 작물을 믹스팩으로 정기 픽업해요.",
          ]}
          note="플랜 보기 · 내 픽업 관리"
          href="/subscribe"
          cta="구매자 화면으로"
          tinted
        />
      </div>

      <div className="mt-6 rounded-10 border border-line px-[17px] py-[17px]">
        <p className="text-18 font-semibold text-ink">운영자로 이용</p>
        <p className="mt-4 text-12 text-body">
          지도에서 운영할 공간을 찾고, 개점 준비와 보증서를 관리해요.
        </p>
        <p className="mt-3.5 text-11 font-medium text-brand">
          운영 자격 확인이 필요해요
        </p>
        <div className="mt-3.5">
          <Button href="/operator/spaces" full>
            운영자 화면으로
          </Button>
        </div>
      </div>

      <p className="mt-8 text-center text-12 text-muted">
        나중에 상단 메뉴에서 언제든 바꿀 수 있습니다.
      </p>
    </AuthShell>
  );
}

function PurposeCard({
  title,
  lines,
  note,
  href,
  cta,
  tinted,
}: {
  title: string;
  lines: string[];
  note: string;
  href: string;
  cta: string;
  tinted?: boolean;
}) {
  return (
    <div
      className={`flex h-[244px] flex-col rounded-10 border px-6 py-7 ${
        tinted ? "border-line bg-surface" : "border-line bg-white"
      }`}
    >
      <h2 className="text-20 font-bold text-ink">{title}</h2>
      <div className="mt-4 space-y-1">
        {lines.map((l) => (
          <p key={l} className="text-13 text-muted">
            {l}
          </p>
        ))}
      </div>
      <Link href={href} className="mt-auto text-13 font-medium text-brand">
        {note}
      </Link>
      <div className="mt-4">
        <Button href={href} full>
          {cta}
        </Button>
      </div>
    </div>
  );
}
