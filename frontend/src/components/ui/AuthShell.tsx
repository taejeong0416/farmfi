import type { ReactNode } from "react";

/**
 * 로그인·회원가입·본인확인 화면의 바탕 (C-02 · C-03 · C-04 · C-I01~C-I05).
 *
 * `.fig`에서 이 일곱 화면은 1440x900 프레임에 사진을 깔고 검정 50%를 덮은 뒤,
 * 흰 워드마크를 위에서 118px, 흰 패널을 181px 지점에 놓는다. 숫자는 덤프
 * (`C-02-2.txt` 첫 다섯 줄)의 좌표를 그대로 옮긴 것이다.
 *
 * 패널 폭은 465가 기본이고 이용 목적 선택(C-04)만 730이다. 로그인·회원가입·
 * 이용 목적 선택에는 패널 위에 64px 머리띠가 있고, 본인확인 3단계에는 없다.
 */
export function AuthShell({
  children,
  wide = false,
  header = false,
}: {
  children: ReactNode;
  /** C-04처럼 730 폭 패널을 쓰는 화면. */
  wide?: boolean;
  /** 패널 상단 64px 머리띠 (C-02 · C-03 · C-04). */
  header?: boolean;
}) {
  return (
    <div className="relative min-h-screen">
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: "url(/assets/figma/auth-bg.jpg)" }}
        aria-hidden
      />
      <div className="fixed inset-0 -z-10 bg-black/50" aria-hidden />

      {/* 좁은 화면에서 패널이 가장자리에 붙지 않게 하는 여백은 폭 제한 **밖**에
          둔다. 안에 두면 border-box라 465(또는 730) 안에서 48을 떼어가, 흰 패널이
          그만큼 좁아지고 가운데 정렬이 오른쪽으로 24px 밀린다. */}
      <div className="px-6">
        <main
          className={`mx-auto w-full pb-20 pt-[118px] ${
            wide ? "max-w-panel" : "max-w-modal"
          }`}
        >
          <p className="text-center text-22 font-bold leading-[27px] text-white">
            FarmFi
          </p>

          <div className="mt-9 overflow-hidden rounded-10 bg-white">
            {header ? (
              <div className="flex h-16 items-center border-b border-line px-[25px]">
                <p className="text-13 font-bold text-brand">FarmFi</p>
              </div>
            ) : null}
            <div className={`px-[33px] pb-8 ${header ? "pt-7" : "pt-[30px]"}`}>
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
