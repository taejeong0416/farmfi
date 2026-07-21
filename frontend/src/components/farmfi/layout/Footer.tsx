import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="footer" id="contact">
      <div className="shell footer-grid">
        <div>
          <Link className="logo" href="/">
            <Image
              src="/assets/farmfi-logo.png"
              alt="FarmFi"
              width={154}
              height={41}
              className="logo-img"
            />
          </Link>
          <p>
            도심 유휴공간을 24시간 신선매장으로 전환하고 운영을 지원하는
            공실전환 창업 지원 인프라입니다.
          </p>
          <p>© 2026 FarmFi. All rights reserved.</p>
        </div>
        <FooterCol title="서비스" items={["서비스 소개", "투자하기", "운영자 모집", "공간 제공"]} />
        <FooterCol title="지원" items={["운영자 지원", "기관 문의", "이용 가이드", "FAQ"]} />
        <FooterCol title="회사" items={["회사 소개", "파트너십", "블로그", "채용"]} />
        <FooterCol
          title="문의"
          items={["contact@farmfi.io", "02-1234-5678", "서울특별시 강남구 테헤란로 123"]}
        />
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4>{title}</h4>
      {items.map((item) => (
        <a href="#contact" key={item}>
          {item}
        </a>
      ))}
    </div>
  );
}
