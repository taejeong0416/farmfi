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
            도심 유휴공간을 가치로, 투자로, 미래로. 지속가능한 농업
            생태계를 만드는 스마트팜 플랫폼입니다.
          </p>
          <p>© 2024 FarmFi. All rights reserved.</p>
        </div>
        <FooterCol title="서비스" items={["서비스 소개", "프로젝트", "공간 등록", "마켓"]} />
        <FooterCol title="지원" items={["운영자 지원", "투자자 지원", "지갑 연결 가이드", "FAQ"]} />
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
