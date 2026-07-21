import type { Metadata } from "next";
import "./globals.css";
import { Footer, Header } from "@/components/FarmFi";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "FarmFi | 도심 유휴공간 스마트팜 STO 플랫폼",
  description:
    "도심 유휴 상가를 스마트팜 매장으로 전환하고 확장 자금을 STO로 조달하는 플랫폼. 스마트컨트랙트 에스크로가 마일스톤 검증에 따라 자금을 단계 집행합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <Providers>
          <Header />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
