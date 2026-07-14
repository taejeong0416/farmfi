import Link from "next/link";

export function GreenBand({ text = "모두가 함께 만드는 지속가능한 도시농업 생태계, FarmFi" }) {
  return (
    <section className="section">
      <div className="shell band">
        <div>
          <h2>{text}</h2>
          <p>공간 진단부터 운영자 배정, 생육-판매 연동까지 한 플랫폼에서 연결합니다.</p>
        </div>
        <Link className="ghost" href="/space">
          공간 등록하기 →
        </Link>
      </div>
    </section>
  );
}
