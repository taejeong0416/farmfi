import type { Metadata } from "next";
import "./globals.css";
import { Footer, Header } from "@/components/FarmFi";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "FarmFi | 도심 유휴공간 스마트팜 플랫폼",
  description:
    "도심 유휴공간, 운영 파트너, 투자자, 소비자를 연결하는 스마트팜 플랫폼 FarmFi.",
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
