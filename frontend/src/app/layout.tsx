import type { Metadata } from "next";
import "./globals.css";
import { Footer, Header } from "@/components/FarmFi";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "FarmFi | 도심 유휴공간 스마트팜 플랫폼",
  description:
    "도심 유휴공간을 스마트팜 24시간 신선매장으로 전환하고, 운영자 모집·생육 모니터링·성과관리를 제공하는 공실전환 창업 지원 인프라 FarmFi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
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
