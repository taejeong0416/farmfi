import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

const nav = [
  ["서비스 소개", "/"],
  ["프로젝트", "/projects"],
  ["공간 등록", "/space"],
  ["운영자 지원", "/operator"],
  ["투명성", "/transparency"],
  ["마켓", "/market"],
  ["문의하기", "#contact"],
];

const projects = [
  {
    name: "부산역 루프탑 미니팜",
    place: "부산 동구 중앙대로 206",
    owner: "부산역사(주)",
    operator: "그로우랩",
    percent: 78,
    yield: "12.5%",
    amount: "₩300,000,000",
    image: "roof",
  },
  {
    name: "영도 도시재생 팜",
    place: "부산 영도구 봉래나루로 160",
    owner: "영도구청",
    operator: "그린플랜트",
    percent: 64,
    yield: "11.2%",
    amount: "₩250,000,000",
    image: "roof",
  },
  {
    name: "부산대 상권 실내팜",
    place: "부산 금정구 금강로 321",
    owner: "부산대학교",
    operator: "스마트팜코리아",
    percent: 41,
    yield: "13.8%",
    amount: "₩180,000,000",
    image: "indoor",
  },
  {
    name: "서면 스마트 그로우팜",
    place: "부산 부산진구 서면로 68",
    owner: "서면이마트몰",
    operator: "베지플러스",
    percent: 55,
    yield: "10.6%",
    amount: "₩180,000,000",
    image: "indoor",
  },
  {
    name: "해운대 커뮤니티팜",
    place: "부산 해운대구 마린시티 2로 38",
    owner: "해운대구청",
    operator: "리프레쉬팜",
    percent: 72,
    yield: "12.1%",
    amount: "₩220,000,000",
    image: "roof",
  },
  {
    name: "사상 유휴공간 팜",
    place: "부산 사상구 사상로 201",
    owner: "사상구청",
    operator: "팜스테이션",
    percent: 38,
    yield: "10.6%",
    amount: "₩160,000,000",
    image: "indoor",
  },
];

const products = [
  ["그로우팜 샐러드 믹스", "150g | 무농약", "₩2,600"],
  ["방울토마토", "500g | 무농약", "₩6,200"],
  ["허브온 성숙한 바질", "50g | 무농약", "₩2,100"],
  ["그린스페이스 청경채", "300g | 유기농", "₩2,100"],
  ["부산 센텀 로메인 상추", "200g | 무농약", "₩1,900"],
];

export function Header() {
  return (
    <header className="nav">
      <div className="shell nav-inner">
        <Link className="logo" href="/" aria-label="FarmFi 홈">
          <Image
            src="/assets/farmfi-logo.png"
            alt="FarmFi"
            width={154}
            height={41}
            className="logo-img"
            priority
          />
        </Link>
        <nav className="nav-links" aria-label="주요 메뉴">
          {nav.map(([label, href]) => (
            <Link href={href} key={label}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <Link className="ghost" href="/dashboard">
            로그인
          </Link>
          <Link className="btn" href="/space">
            지갑 연결
          </Link>
        </div>
      </div>
    </header>
  );
}

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

export function Hero({
  eyebrow,
  title,
  green,
  lead,
  art = "",
  actions,
  chips,
}: {
  eyebrow?: string;
  title: string;
  green?: string;
  lead: string;
  art?: string;
  actions?: ReactNode;
  chips?: string[];
}) {
  return (
    <section className="hero">
      <div className="shell hero-grid">
        <div className="hero-copy">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1>
            {title}
            {green ? (
              <>
                <br />
                <strong>{green}</strong>
              </>
            ) : null}
          </h1>
          <p className="lead">{lead}</p>
          {actions ? <div className="hero-actions">{actions}</div> : null}
          {chips ? <TrustStrip items={chips} /> : null}
        </div>
        <div className={`hero-art ${art}`} aria-hidden="true">
          <div className="farm-visual-card">
            <div className="farm-visual-skyline" />
            <div className="farm-visual-house">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="farm-visual-crops">
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip({ items }: { items: string[] }) {
  const labelMap: Record<string, string> = {
    "투명한 운영과 안전한 기록": "투명한 운영과 안전한 블록체인 기록",
    부산광역시: "부산광역시",
    BIFC: "BIFC 부산국제금융센터",
    Chainlink: "Chainlink",
  };
  return (
    <div className="trust-row">
      {items.map((item) => (
        <span className="trust-chip" key={item}>
          <Icon name={item === "BIFC" ? "shield" : "check"} />
          {labelMap[item] ?? item}
        </span>
      ))}
    </div>
  );
}

export function Icon({ name }: { name: string }) {
  const glyphs: Record<string, string> = {
    building: "▥",
    user: "♙",
    chart: "↗",
    cart: "▣",
    leaf: "◒",
    coin: "◎",
    check: "✓",
    shield: "◇",
    farm: "⌂",
    calendar: "□",
  };
  return <span aria-hidden="true">{glyphs[name] ?? "•"}</span>;
}

export function RoleCards() {
  const roles = [
    ["투자자", "도심 농업 프로젝트에 투자하고 수익을 얻으세요.", "chart", "투자 프로젝트 보기"],
    ["건물주", "유휴공간을 등록하고 안정적인 임대 수익을 받으세요.", "building", "유휴공간 등록"],
    ["운영자", "스마트팜을 운영하고 지속가능한 농업을 실현하세요.", "user", "운영자 지원"],
    ["소비자", "내 주변 미니팜의 신선한 농산물을 만나보세요.", "cart", "근처 미니팜 보기"],
  ];

  return (
    <div className="grid-4">
      {roles.map(([title, desc, icon, link]) => (
        <article className="card role-card soft-card" key={title}>
          <span className="icon">
            <Icon name={icon} />
          </span>
          <h3>{title}</h3>
          <p>{desc}</p>
          <a className="link" href="#next">
            {link} →
          </a>
        </article>
      ))}
    </div>
  );
}

export function Flow() {
  const steps = [
    ["유휴공간 발굴", "도심 유휴공간을 발굴하고 등록합니다.", "building"],
    ["운영자 매칭", "전문 운영자와 매칭해 계획을 수립합니다.", "user"],
    ["프로젝트 개설", "투자자를 모집하고 계약을 공개합니다.", "chart"],
    ["재배 / 운영", "IoT 데이터로 안전하게 운영합니다.", "leaf"],
    ["수확 / 분배", "수익을 투명하게 분배합니다.", "coin"],
  ];
  return (
    <div className="card flow">
      {steps.map(([title, desc, icon]) => (
        <div className="flow-step" key={title}>
          <span className="icon">
            <Icon name={icon} />
          </span>
          <h3>{title}</h3>
          <p className="muted">{desc}</p>
        </div>
      ))}
    </div>
  );
}

export function ProjectGrid({ limit }: { limit?: number }) {
  return (
    <div className="grid-3">
      {projects.slice(0, limit ?? projects.length).map((project) => (
        <article className="card project-card soft-card" key={project.name}>
          <div className={`thumb ${project.image}`}>
            <span className="badge" style={{ margin: 14 }}>
              모집중
            </span>
          </div>
          <div className="project-body">
            <h3>{project.name}</h3>
            <p className="muted">⌖ {project.place}</p>
            <div className="kv">
              <div>
                <span>예상 수익률</span>
                <b>{project.yield}</b>
              </div>
              <div>
                <span>목표 금액</span>
                <b>{project.amount}</b>
              </div>
              <div>
                <span>모집률</span>
                <b>{project.percent}%</b>
              </div>
            </div>
            <div style={{ marginTop: 18 }} className="progress">
              <span className="bar" style={{ width: `${project.percent}%` }} />
            </div>
            <Link className="link" href="/projects/haeundae">
              상세 보기 →
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export function Stats() {
  const stats = [
    ["총 프로젝트 수", "128 개", "진행 중 36 · 완료 92"],
    ["누적 투자금", "₩128,560,000,000", "+12.4%"],
    ["임점 공간 수", "356 개", "전국 18개 도시"],
    ["운영자 수", "86 명", "전문 운영자 네트워크"],
    ["ESG 임팩트", "128 tCO₂", "연간 탄소 절감 효과"],
  ];
  return (
    <div className="stats-grid">
      {stats.map(([label, value, desc]) => (
        <article className="card metric" key={label}>
          <span className="muted">{label}</span>
          <strong>{value}</strong>
          <p className="muted">{desc}</p>
        </article>
      ))}
    </div>
  );
}

export function MarketProducts() {
  return (
    <div className="market-grid">
      {products.map(([name, desc, price]) => (
        <article className="card product-card" key={name}>
          <div className="thumb market" />
          <div className="product-body">
            <span className="badge">오늘 수확</span>
            <h3>{name}</h3>
            <p className="muted">{desc}</p>
            <p className="price">{price}</p>
            <button className="outline" style={{ width: "100%", marginTop: 14 }}>
              장바구니 담기
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

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

export function Section({
  title,
  desc,
  children,
  aside,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="section" id="next">
      <div className="shell">
        <div className="section-head">
          <div>
            <h2>{title}</h2>
            {desc ? <p className="section-desc">{desc}</p> : null}
          </div>
          {aside}
        </div>
        {children}
      </div>
    </section>
  );
}

export function FilterBar() {
  return (
    <div className="card filterbar">
      <div className="input">프로젝트명, 위치, 운영자 검색</div>
      {["지역", "모집 상태", "예상 수익률", "프로젝트 단계", "운영 상태", "역할"].map((item) => (
        <div className="input" key={item}>
          {item} ˅
        </div>
      ))}
    </div>
  );
}

export function DashboardShell({ operator = false }: { operator?: boolean }) {
  const menu = [
    "대시보드",
    "재배 관리",
    "환경 모니터링",
    "작물 건강 관리",
    "설비 관리",
    "작업 관리",
    "수확·출하 관리",
    "판매·출하 분석",
    "수익 분석",
    "리포트",
  ];
  return (
    <main className="page">
      <div className="shell dashboard">
        <aside className="side">
          {menu.map((item) => (
            <a href="#dash" key={item}>
              <Icon name="check" /> {item}
            </a>
          ))}
        </aside>
        <section className="dash-content" id="dash">
          <h1>{operator ? "운영자 운영 대시보드" : "통합 대시보드"}</h1>
          <p className="lead">
            투자자, 건물주, 운영자, 소비자가 한 플랫폼에서 각자의 활동을
            관리하고 실시간 데이터를 확인합니다.
          </p>
          <div className="stats-grid" style={{ marginTop: 30 }}>
            <Metric label="총 재배 면적" value="128,560㎡" />
            <Metric label="재배 중 작물 수" value="18종" />
            <Metric label="금일 예상 수확량" value="2,560kg" />
            <Metric label="금월 출하 예정" value="1,280kg" />
            <Metric label="예상 수익" value="₩128,560,000" />
          </div>
          <div className="grid-3" style={{ marginTop: 24 }}>
            <Panel title="오늘의 운영 업무">
              {["온실 3동 급액 펌프 보충", "토마토 2동 유인 작업", "상추 1동 병해충 방제", "딸기 출하 준비"].map(
                (item, i) => (
                  <p className="muted" key={item}>
                    0{i + 1} · {item} <b style={{ color: "#08703f" }}>진행중</b>
                  </p>
                ),
              )}
            </Panel>
            <Panel title="작물 캘린더">
              <div className="grid-4">
                {Array.from({ length: 28 }, (_, i) => (
                  <span className="input" style={{ minHeight: 34, justifyContent: "center", padding: 0 }} key={i}>
                    {i + 1}
                  </span>
                ))}
              </div>
            </Panel>
            <Panel title="알림 및 이상 현황">
              {["온도 이상 감지 · 온실 3동", "습도 경고 · 온실 2동", "CO₂ 농도 주의 · 온실 1동", "출하 알림"].map(
                (item) => (
                  <p className="muted" key={item}>
                    ⚠ {item}
                  </p>
                ),
              )}
            </Panel>
          </div>
          <div className="grid-3" style={{ marginTop: 24 }}>
            <Chart title="실시간 IoT 환경 모니터링" />
            <Chart title="판매·출하 현황" />
            <Donut title="수익 분포" />
          </div>
        </section>
      </div>
    </main>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="card metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p className="muted">▲ 12.4% 전월 대비</p>
    </article>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="card chart">
      <h3>{title}</h3>
      <div style={{ marginTop: 18 }}>{children}</div>
    </article>
  );
}

export function Chart({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <div className="bars">
        {[44, 58, 47, 70, 64, 52, 76, 88, 66, 91].map((h) => (
          <span key={h} style={{ height: `${h}%` }} />
        ))}
      </div>
    </Panel>
  );
}

export function Donut({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <div className="donut" />
    </Panel>
  );
}

export function SpaceForm() {
  return (
    <div className="form-grid">
      <article className="card form-panel">
        <h2>유휴공간 정보 입력</h2>
        <div className="field-grid" style={{ marginTop: 26 }}>
          <Field label="공간 유형" control={<div className="seg"><span>옥상</span><span>빈 점포</span><span>실내 유휴공간</span></div>} />
          <Field label="주소" control={<div className="fake-control">도로명 주소를 입력해주세요</div>} />
          <Field label="면적" control={<div className="seg"><span>~50평</span><span>50~100평</span><span>100~200평</span><span>200평~</span></div>} />
          <Field label="전기 / 수도" control={<div className="seg"><span>전기 가능</span><span>수도 가능</span><span>부분 가능</span></div>} />
          <Field label="채광 조건" control={<div className="seg"><span>매우 좋음</span><span>좋음</span><span>보통</span><span>낮음</span></div>} />
          <Field label="희망 운영 방식" control={<div className="seg"><span>임대형</span><span>수익 공유형</span><span>협의 가능</span></div>} />
          <Field label="사진 업로드" control={<div className="fake-control">공간 사진을 업로드해주세요. 최대 10장</div>} />
        </div>
        <button className="btn" style={{ width: "100%", marginTop: 24 }}>
          공간 등록 & 예상 리포트 받기 →
        </button>
      </article>
      <aside className="card report-card">
        <h2>예상 전환 리포트</h2>
        <p className="muted">스마트팜 적합도</p>
        <p className="big-number">85%</p>
        <div className="progress">
          <span className="bar" style={{ width: "85%" }} />
        </div>
        <Metric label="예상 월 임대 수익" value="₩3,250,000" />
        <Metric label="예상 프로젝트 오픈 기간" value="2.5개월" />
        <Metric label="예상 운영 형태" value="임대형" />
      </aside>
    </div>
  );
}

function Field({ label, control }: { label: string; control: ReactNode }) {
  return (
    <div className="field">
      <label>{label} *</label>
      {control}
    </div>
  );
}

export function DetailPage() {
  return (
    <main className="page">
      <section className="hero">
        <div className="thumb detail">
          <div className="shell" style={{ paddingTop: 210, color: "#fff" }}>
            <span className="badge">운영 중</span>
            <h1 style={{ marginTop: 18 }}>해운대 커뮤니티팜</h1>
            <p className="lead" style={{ color: "rgba(255,255,255,.9)" }}>
              부산광역시 해운대구 마린시티 2로 38, Rooftop Farm
            </p>
          </div>
        </div>
      </section>
      <div className="shell grid-2 section">
        <div>
          <Section title="함께 만드는 지속가능한 가치">
            <div className="grid-3">
              <Metric label="건물주" value="공간 제공" />
              <Metric label="운영자" value="재배 운영" />
              <Metric label="투자자" value="수익 참여" />
            </div>
          </Section>
          <Section title="IoT 실시간 환경 데이터">
            <div className="stats-grid">
              <Metric label="온도" value="24.6℃" />
              <Metric label="습도" value="62%" />
              <Metric label="CO₂" value="412ppm" />
              <Metric label="조도" value="320" />
              <Metric label="pH" value="6.2" />
            </div>
          </Section>
        </div>
        <aside>
          <article className="card report-card">
            <p className="muted">최소 참여 금액</p>
            <p className="big-number">₩100,000</p>
            <div className="grid-2">
              <Metric label="예상 연 수익률" value="8.6%" />
              <Metric label="예상 수익" value="₩8,600" />
            </div>
            <button className="btn" style={{ width: "100%", marginTop: 18 }}>
              지금 참여하기
            </button>
            <button className="outline" style={{ width: "100%", marginTop: 10 }}>
              관심 등록
            </button>
          </article>
          <article className="card report-card" style={{ marginTop: 20 }}>
            <h3>프로젝트 상태</h3>
            <ul className="timeline">
              {["프로젝트 등록", "운영 준비 완료", "모집 시작", "모집 진행 중", "자금 집행 예정"].map((item) => (
                <li key={item}>
                  <i />
                  {item}
                  <span>2024.05</span>
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </div>
    </main>
  );
}

export function TransparencyPage() {
  return (
    <main className="page">
      <Section title="투명성 상세" desc="프로젝트 자금 흐름, 에스크로 보관 현황, 계약 검증 상태를 한 화면에서 확인합니다.">
        <div className="stats-grid">
          <Metric label="총 투자 금액" value="₩1,248,560,000" />
          <Metric label="에스크로 보관 금액" value="₩432,780,000" />
          <Metric label="마일스톤 달성률" value="72%" />
          <Metric label="온체인 거래 수" value="356건" />
          <Metric label="데이터 업데이트" value="정상" />
        </div>
        <div className="grid-2" style={{ marginTop: 24 }}>
          <Panel title="온체인 자금 흐름">
            <div className="band" style={{ color: "#fff" }}>
              <b>투자자 → 에스크로 지갑 → 스마트팜 구축 · 운영 · 정산</b>
            </div>
          </Panel>
          <Donut title="에스크로 보관 현황" />
        </div>
        <div className="grid-2" style={{ marginTop: 24 }}>
          <Panel title="최근 온체인 거래 내역">
            <table className="table">
              <tbody>
                {["에스크로 집행", "운영 수익 입금", "에스크로 승인", "투자 입금"].map((row) => (
                  <tr key={row}>
                    <td>2024.05.15</td>
                    <td>{row}</td>
                    <td>0x8b7a...1e9f3c</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="계약 및 검증 상태">
            {["스마트 계약 검증 완료", "감사 보고서 완료", "KYC/AML 검증 완료", "Chainlink Oracle 연동"].map(
              (item) => (
                <p className="muted" key={item}>
                  ✓ {item}
                </p>
              ),
            )}
          </Panel>
        </div>
      </Section>
      <GreenBand text="투명한 데이터, 검증된 운영. 함께 만드는 지속가능한 농업 생태계" />
    </main>
  );
}
