import type { Metadata } from "next";
import "./globals.css";
import { AppFooter, SiteHeader } from "@/components/ui";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "FarmFi | 도심 유휴공간 스마트팜 투자·구독 플랫폼",
  description:
    "도심 유휴 상가를 스마트팜 매장으로 전환하는 자금을 모으고, 검증을 통과한 단계에만 집행하는 플랫폼입니다.",
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
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="bg-white text-ink">
        <Providers>
          <SiteHeader />
          {children}
          <AppFooter />
        </Providers>
      </body>
    </html>
  );
}
