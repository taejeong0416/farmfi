"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, OptionCard, PanelShell } from "@/components/ui";

export function VerifyMethodScreen() {
  const router = useRouter();
  const [method, setMethod] = useState<"mobile-id" | "simple">("mobile-id");

  return (
    <PanelShell className="max-w-modal">
      <p className="text-12 font-medium text-brand">투자 준비 1 / 3</p>
      <h1 className="mt-3 text-24 font-bold text-ink">
        먼저 본인확인 방법을 선택해 주세요
      </h1>
      <p className="mt-3 text-13 leading-6 text-body">
        로그인은 간편인증도 가능하지만, 첫 투자 전에는 모바일 신분증 확인이 필요해요.
      </p>

      <div className="mt-7 flex items-center gap-5 rounded-14 bg-brand px-6 py-7">
        <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[18px] bg-white text-28 font-bold text-brand">
          F
        </span>
        <div>
          <p className="text-15 font-bold text-white">첫 투자 전에 필요한 확인</p>
          <p className="mt-1.5 text-11 text-brand-soft">
            모바일 신분증이 있으면 바로 진행할 수 있어요
          </p>
          <p className="mt-3 text-12 text-white">필요한 것 · 본인 명의 휴대폰</p>
        </div>
      </div>

      <h2 className="mt-8 text-15 font-bold text-ink">본인확인 방법</h2>
      <div className="mt-4 space-y-3">
        <OptionCard
          selected={method === "mobile-id"}
          title="모바일 신분증으로 확인"
          desc="첫 투자까지 한 번에 준비 · 권장"
          onClick={() => setMethod("mobile-id")}
        />
        <OptionCard
          selected={method === "simple"}
          title="간편인증으로 로그인"
          desc="둘러보기 가능 · 투자 전 모바일 신분증 확인"
          onClick={() => setMethod("simple")}
        />
      </div>

      <div className="mt-8">
        <Button
          full
          onClick={() =>
            router.push(method === "mobile-id" ? "/verify/mobile-id" : "/projects")
          }
        >
          {method === "mobile-id"
            ? "모바일 신분증으로 계속"
            : "간편인증으로 계속"}
        </Button>
      </div>

      <p className="mt-6 text-center">
        <Link href="/projects" className="text-13 font-medium text-brand">
          나중에 확인하고 프로젝트 둘러보기
        </Link>
      </p>
      <p className="mt-3 text-center text-11 text-muted">
        선택한 방법은 다음 화면에서 변경할 수 있어요.
      </p>
    </PanelShell>
  );
}
