import Link from "next/link";

export function GreenBand({ text = "모두가 함께 만드는 지속가능한 도시농업 생태계, FarmFi" }) {
  return (
    <section className="section">
      <div className="shell band">
        <div>
          <h2>{text}</h2>
          <p>투자부터 운영, 소비까지 한 플랫폼에서 모든 가치를 연결합니다.</p>
        </div>
        <Link className="ghost" href="/projects">
          프로젝트 둘러보기 →
        </Link>
      </div>
    </section>
  );
}
