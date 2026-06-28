import Link from "next/link";
import { GreenBand, Hero, MarketProducts, Panel, Section } from "@/components/FarmFi";

export default function MarketPage() {
  return (
    <main className="page">
      <Hero
        art="market"
        title="가장 가까운 신선함,"
        green="우리 동네에서 바로 만나요"
        lead="FarmFi 미니팜에서 정성껏 키운 신선한 농산물을 가까운 곳에서 더 빠르고 투명하게 만나보세요."
        chips={["우리 동네 미니팜", "당일 수확 원칙", "안심하고 먹는 농산물"]}
      />
      <Section title="오늘 수확한 농산물" aside={<Link className="link" href="/projects">농장 보기 →</Link>}>
        <MarketProducts />
      </Section>
      <Section title="내 주변 미니팜">
        <div className="grid-2">
          <Panel title="강남역 반경 5km 미니팜 지도">
            <div className="card" style={{ minHeight: 270, background: "linear-gradient(135deg,#eef6ef,#fff)" }} />
          </Panel>
          <Panel title="근처 농장 리스트">
            {["그로우팜 역삼센터", "허브온 성수팜", "부산 샌텀 미니팜", "청정채 서면점"].map((item) => (
              <p className="muted" key={item}>
                {item} · 직선거리 2.1km · 오늘 수확
              </p>
            ))}
          </Panel>
        </div>
      </Section>
      <GreenBand text="도심을 푸르게, 일상을 건강하게" />
    </main>
  );
}
