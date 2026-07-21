"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { MobileAssignmentScreen, MobileInventoryScreen, MobileSalesScreen } from "./MobileFarmApp";
import styles from "./FarmOperations.module.css";

export type ServiceKey = "assignment" | "growth" | "inventory" | "sales";

const SERVICES: Array<{ key: ServiceKey; index: string; label: string; short: string; href: string }> = [
  { key: "assignment", index: "01", label: "운영자·공간 배정", short: "배정", href: "/dashboard/assignment" },
  { key: "growth", index: "02", label: "생육 모니터링", short: "생육", href: "/dashboard" },
  { key: "inventory", index: "03", label: "재고·생육 연동", short: "재고", href: "/dashboard/inventory" },
  { key: "sales", index: "04", label: "판매 데이터 리포트", short: "판매", href: "/dashboard/sales" },
];

const BRANCHES = [
  { id: "busan-b1", label: "부산대 1호점" },
  { id: "yeonsan-a07", label: "연산 2호점" },
  { id: "suyeong-203", label: "수영 3호점" },
];

export function ServiceNav({ active }: { active: ServiceKey }) {
  return (
    <nav className={styles.serviceNav} aria-label="FarmFi 앱 화면">
      <span className={styles.serviceNavLabel}>APP SERVICE</span>
      {SERVICES.map((service) => (
        <Link
          className={active === service.key ? styles.activeService : ""}
          href={service.href}
          aria-current={active === service.key ? "page" : undefined}
          key={service.key}
        >
          <span>{service.index}</span>
          <b>{service.label}</b>
          <small>{service.short}</small>
        </Link>
      ))}
    </nav>
  );
}

interface ShellProps {
  active: ServiceKey;
  eyebrow: string;
  title: string;
  description: string;
  context: Array<{ label: string; code: string; href: string; glyph: string }>;
  status: string;
  branchValue?: string;
  onBranchChange?: (branchId: string) => void;
  mobileView?: ReactNode;
  children: ReactNode;
}

function OperationsShell({ active, eyebrow, title, description, context, status, branchValue, onBranchChange, mobileView, children }: ShellProps) {
  const [localBranch, setLocalBranch] = useState(BRANCHES[0].id);
  const referenceMode = active === "assignment" || active === "inventory";

  useEffect(() => {
    document.body.classList.add("farmfi-growth-dashboard");
    return () => document.body.classList.remove("farmfi-growth-dashboard");
  }, []);

  const activeLabel = SERVICES.find((service) => service.key === active)?.label ?? title;
  const activeServiceIndex = Math.max(0, SERVICES.findIndex((service) => service.key === active));
  const previousService = SERVICES[(activeServiceIndex + SERVICES.length - 1) % SERVICES.length];
  const nextService = SERVICES[(activeServiceIndex + 1) % SERVICES.length];
  const selectedBranch = branchValue ?? localBranch;
  const changeBranch = (nextBranch: string) => {
    if (onBranchChange) onBranchChange(nextBranch);
    else setLocalBranch(nextBranch);
  };

  return (
    <>
    {mobileView}
    <main className={`${styles.page} ${mobileView ? styles.desktopOnly : ""}`}>
      <div className={`${styles.shell} ${referenceMode ? styles.referenceShell : ""}`}>
        {!referenceMode && <aside className={styles.sidebar}>
          <Link className={styles.brand} href="/dashboard" aria-label="FarmFi 관제실 홈">
            <span className={styles.brandSprout}><i /><b /></span>
            <span><strong>FARMFI</strong><small>OPERATIONS OS</small></span>
          </Link>

          <div className={styles.sideSectionLabel}>SCREEN MENU</div>
          <nav className={styles.contextNav} aria-label={`${title} 메뉴`}>
            {context.map((item, index) => (
              <a href={item.href} key={item.code}>
                <span className={styles.contextGlyph}>{item.glyph}</span>
                <span><b>{item.label}</b><small>{item.code}</small></span>
                <em>{String(index + 1).padStart(2, "0")}</em>
              </a>
            ))}
          </nav>

          <div className={styles.sideStatus}>
            <span>F</span>
            <div><small>FARM MATE</small><b>모든 시스템 연결</b></div>
            <i />
          </div>
          <Link className={styles.homeLink} href="/">← FARMFI 홈</Link>
        </aside>}

        <section className={styles.content}>
          {referenceMode ? (
            <>
              <header className={styles.referenceHeader}>
                <div className={styles.referenceHeadingCopy}><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
                <div className={styles.referenceUtilities}>
                  <label><small>지점</small><select value={selectedBranch} onChange={(event) => changeBranch(event.target.value)}>{BRANCHES.map((branch) => <option value={branch.id} key={branch.id}>{branch.label}</option>)}</select></label>
                  <time>{active === "assignment" ? "09:30" : "09:45"}</time>
                  <button type="button">▣ 일일 리포트 보기</button>
                </div>
              </header>
              <div className={styles.referenceOverviewBar}><span>{active === "assignment" ? "운영 현황" : "연동 개요"}</span><b>{"// TODAY OVERVIEW"}</b><i /><i /></div>
              <ServiceNav active={active} />
            </>
          ) : (
            <>
              <header className={styles.topbar}>
                <div className={styles.breadcrumb}><span>FARMFI</span><i>/</i><strong>{activeLabel}</strong></div>
                <div className={styles.topActions}>
                  <label><span>지점</span><select value={selectedBranch} onChange={(event) => changeBranch(event.target.value)}>{BRANCHES.map((branch) => <option value={branch.id} key={branch.id}>{branch.label}</option>)}</select></label>
                  <span className={styles.demoLive}><i /> LIVE SYNC</span>
                  <button type="button" aria-label="알림 1건">!<small>1</small></button>
                </div>
              </header>

              <ServiceNav active={active} />

              <header className={styles.pageHeading}>
                <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
                <div className={styles.headingStatus}><i /><span>현재 상태</span><b>{status}</b></div>
              </header>
            </>
          )}

          {children}

          {referenceMode && (
            <footer className={styles.referenceFooter}>
              <div><button type="button">▣ {active === "assignment" ? "자동 배정" : "자동 연동"}</button><button type="button">◉ {active === "assignment" ? "배정 초기화" : "연동 설정"}</button></div>
              <span><Link href={previousService.href} aria-label={`이전 화면: ${previousService.label}`}>‹</Link><b>{String(activeServiceIndex + 1).padStart(2, "0")}&nbsp; / &nbsp;04</b><Link href={nextService.href} aria-label={`다음 화면: ${nextService.label}`}>›</Link></span>
              <button type="button">▣ {active === "assignment" ? "변경 사항 저장" : "연동 리포트 저장"}</button>
            </footer>
          )}
        </section>
      </div>
    </main>
    </>
  );
}

type SpaceLayout = "dual" | "wide" | "rail";

interface SpaceRecord {
  id: string;
  name: string;
  location: string;
  area: string;
  dimensions: string;
  layout: SpaceLayout;
  layoutLabel: string;
  supportLabel: string;
  power: string;
  water: string;
  ceiling: string;
  access: string;
  status: string;
  score: number;
  beds: number;
}

const SPACES: SpaceRecord[] = [
  { id: "busan-b1", name: "부산대 1호점", location: "부산 금정구 부산대학로 · B1", area: "25평", dimensions: "7.2 × 11.5m", layout: "dual", layoutLabel: "양면 선반형", supportLabel: "저장고 + 사무실", power: "40kW", water: "급·배수 완료", ceiling: "3.2m", access: "부산대역 7분", status: "배정 대기", score: 96, beds: 4 },
  { id: "yeonsan-a07", name: "연산 2호점", location: "연산 지하상가 A-07 · 부산 연제구", area: "31평", dimensions: "10.8 × 9.5m", layout: "wide", layoutLabel: "광폭 2존형", supportLabel: "저장고 + 사무실", power: "50kW", water: "배수 보완", ceiling: "3.0m", access: "연산역 5분", status: "조건 검토", score: 84, beds: 6 },
  { id: "suyeong-203", name: "수영 3호점", location: "수영 빈점포 203 · 부산 수영구", area: "18평", dimensions: "4.1 × 14.5m", layout: "rail", layoutLabel: "협소 일렬형", supportLabel: "저장고 + 사무실", power: "28kW", water: "급수 연결", ceiling: "2.8m", access: "수영역 6분", status: "설비 협의", score: 78, beds: 3 },
];

interface CandidateRecord {
  id: string;
  name: string;
  area: string;
  ageGroup: string;
  contact: string;
  portraitPosition: string;
  level: number;
  role: "재배" | "수확" | "포장" | "검수" | "지원";
  assignedZone: string;
  assignmentState: "배정 완료" | "이동 중" | "대기";
  experience: string;
  training: string;
  availability: string;
  strengths: string[];
  experienceScore: number;
  availabilityScore: number;
  travelMinutes: Record<string, number>;
  fitScores: Record<string, number>;
}

interface CandidateMatch extends CandidateRecord {
  travel: number;
  proximityScore: number;
  fitScore: number;
  score: number;
}

const CANDIDATES: CandidateRecord[] = [
  { id: "op-01", name: "김하준", area: "금정구", ageGroup: "60대 초반", contact: "010-72**-14**", portraitPosition: "0%", level: 12, role: "재배", assignedZone: "구역 A", assignmentState: "배정 완료", experience: "텃밭 6년 · 소매 12년", training: "도시농업 관리과정 수료", availability: "매일 오전·저녁", strengths: ["판매 경험", "주말 운영", "작물 관리"], experienceScore: 94, availabilityScore: 92, travelMinutes: { "busan-b1": 7, "yeonsan-a07": 22, "suyeong-203": 30 }, fitScores: { "busan-b1": 96, "yeonsan-a07": 83, "suyeong-203": 78 } },
  { id: "op-02", name: "이서연", area: "동래구", ageGroup: "50대 후반", contact: "010-38**-62**", portraitPosition: "14.286%", level: 9, role: "수확", assignedZone: "구역 B", assignmentState: "배정 완료", experience: "식품매장 8년 · 재배 2년", training: "위생·재고관리 교육 수료", availability: "평일 오전·저녁", strengths: ["재고 관리", "고객 응대", "위생 관리"], experienceScore: 90, availabilityScore: 82, travelMinutes: { "busan-b1": 11, "yeonsan-a07": 13, "suyeong-203": 20 }, fitScores: { "busan-b1": 93, "yeonsan-a07": 91, "suyeong-203": 87 } },
  { id: "op-03", name: "박민수", area: "동래구", ageGroup: "50대 중반", contact: "010-91**-05**", portraitPosition: "28.571%", level: 10, role: "수확", assignedZone: "구역 B", assignmentState: "배정 완료", experience: "시설관리 10년 · 재배 1년", training: "스마트팜 기초과정 수료", availability: "매일 오전 · 주말 가능", strengths: ["설비 점검", "기록 관리", "차량 보유"], experienceScore: 88, availabilityScore: 86, travelMinutes: { "busan-b1": 12, "yeonsan-a07": 10, "suyeong-203": 19 }, fitScores: { "busan-b1": 91, "yeonsan-a07": 92, "suyeong-203": 88 } },
  { id: "op-04", name: "정다운", area: "금정구", ageGroup: "40대 후반", contact: "010-54**-31**", portraitPosition: "42.857%", level: 8, role: "포장", assignedZone: "포장실", assignmentState: "배정 완료", experience: "급식 조리 7년 · 재배 3년", training: "도시농업 실무교육 수료", availability: "평일 오전·주말", strengths: ["수확 관리", "위생 관리", "기록 작성"], experienceScore: 91, availabilityScore: 88, travelMinutes: { "busan-b1": 9, "yeonsan-a07": 20, "suyeong-203": 28 }, fitScores: { "busan-b1": 92, "yeonsan-a07": 85, "suyeong-203": 80 } },
  { id: "op-05", name: "최영서", area: "동래구", ageGroup: "50대 초반", contact: "010-66**-48**", portraitPosition: "57.143%", level: 6, role: "포장", assignedZone: "포장실", assignmentState: "이동 중", experience: "포장·물류 9년 · 재배 1년", training: "농산물 품질관리 수료", availability: "매일 오후·저녁", strengths: ["포장 운영", "재고 관리", "납품 대응"], experienceScore: 89, availabilityScore: 84, travelMinutes: { "busan-b1": 14, "yeonsan-a07": 12, "suyeong-203": 19 }, fitScores: { "busan-b1": 88, "yeonsan-a07": 91, "suyeong-203": 89 } },
  { id: "op-06", name: "강우진", area: "연제구", ageGroup: "40대 후반", contact: "010-47**-83**", portraitPosition: "71.429%", level: 7, role: "검수", assignedZone: "저장고", assignmentState: "배정 완료", experience: "편의점 운영 6년 · 재배 2년", training: "스마트팜 운영교육 수료", availability: "평일 오후·주말", strengths: ["매장 운영", "판매 분석", "고객 응대"], experienceScore: 86, availabilityScore: 89, travelMinutes: { "busan-b1": 24, "yeonsan-a07": 8, "suyeong-203": 16 }, fitScores: { "busan-b1": 80, "yeonsan-a07": 94, "suyeong-203": 91 } },
  { id: "op-07", name: "오진호", area: "수영구", ageGroup: "60대 초반", contact: "010-29**-77**", portraitPosition: "85.714%", level: 5, role: "검수", assignedZone: "출하 존", assignmentState: "대기", experience: "건물관리 12년 · 재배 2년", training: "시설·안전관리 교육 수료", availability: "매일 오전·긴급 대응", strengths: ["설비 관리", "안전 점검", "차량 보유"], experienceScore: 92, availabilityScore: 91, travelMinutes: { "busan-b1": 31, "yeonsan-a07": 17, "suyeong-203": 6 }, fitScores: { "busan-b1": 79, "yeonsan-a07": 90, "suyeong-203": 97 } },
  { id: "op-08", name: "윤세빈", area: "금정구", ageGroup: "40대 후반", contact: "010-83**-19**", portraitPosition: "100%", level: 4, role: "지원", assignedZone: "사무실", assignmentState: "배정 완료", experience: "고객지원 5년 · 재배 1년", training: "스마트팜 지원교육 수료", availability: "평일 주간", strengths: ["운영 지원", "기록 관리", "고객 응대"], experienceScore: 84, availabilityScore: 87, travelMinutes: { "busan-b1": 8, "yeonsan-a07": 21, "suyeong-203": 29 }, fitScores: { "busan-b1": 90, "yeonsan-a07": 84, "suyeong-203": 80 } },
];

function getCandidateMatches(space: SpaceRecord): CandidateMatch[] {
  return CANDIDATES.map((candidate) => {
    const travel = candidate.travelMinutes[space.id] ?? 30;
    const proximityScore = Math.round(Math.max(45, Math.min(100, 100 - Math.max(0, travel - 5) * 1.6)));
    const fitScore = candidate.fitScores[space.id] ?? 75;
    const score = Math.round(
      proximityScore * 0.42
      + candidate.experienceScore * 0.22
      + candidate.availabilityScore * 0.16
      + fitScore * 0.2,
    );
    return { ...candidate, travel, proximityScore, fitScore, score };
  }).sort((a, b) => b.score - a.score);
}

type FacilityModuleKind = "rack" | "storage" | "office" | "packing" | "van" | "worker";

const FACILITY_MODULE_ASSETS: Record<FacilityModuleKind, string> = {
  rack: "/assets/pixel/modules/growth-control-bed-v1.png",
  storage: "/assets/pixel/modules/inventory-storage-wall-v1.png",
  office: "/assets/pixel/modules/office-workstation-v1.png",
  packing: "/assets/pixel/modules/packing-logistics-v1.png",
  van: "/assets/pixel/modules/delivery-van-v1.png",
  worker: "/assets/pixel/modules/operator-walk-sheet-v3.png",
};

const FACILITY_MODULE_CLASSES: Record<FacilityModuleKind, string> = {
  rack: styles.facilityRackModule,
  storage: styles.facilityStorageModule,
  office: styles.facilityOfficeModule,
  packing: styles.facilityPackingModule,
  van: styles.facilityVanModule,
  worker: styles.facilityWorkerModule,
};

const FACILITY_LAYOUT_CLASSES: Record<SpaceLayout, string> = {
  dual: styles.facilityLayoutDual,
  wide: styles.facilityLayoutWide,
  rail: styles.facilityLayoutRail,
};

interface FacilityModuleProps {
  kind: FacilityModuleKind;
  label: string;
  slot?: number;
}

function FacilityModule({ kind, label, slot }: FacilityModuleProps) {
  return (
    <span
      className={`${styles.facilityModule} ${FACILITY_MODULE_CLASSES[kind]}`}
      data-slot={slot}
      style={{ "--module-sprite": `url("${FACILITY_MODULE_ASSETS[kind]}")` } as CSSProperties}
      aria-hidden="true"
    >
      <small>{label}</small>
    </span>
  );
}

function FacilityComposition({ space }: { space: SpaceRecord }) {
  const [innerDoorOpen, setInnerDoorOpen] = useState(true);
  const [entranceOpen, setEntranceOpen] = useState(false);

  return (
    <div
      className={`${styles.facilityComposition} ${FACILITY_LAYOUT_CLASSES[space.layout]}`}
      role="group"
      aria-label={`${space.name}의 재배 구역, 저장고, 포장실, 출하 존, 사무실로 구성된 공간도. 작업자 한 명이 시설 전체 통로를 순회합니다.`}
    >
      <span className={styles.siteMapLive}><i /> LIVE SITE MAP</span>
      <span className={styles.siteMapScale}>{space.dimensions}</span>
      <div className={styles.facilityFloor}>
        <section className={styles.facilityGrowRoom}>
          <span className={styles.facilityRoomLabel}><b>구역 A · B</b><small>재배 존</small></span>
          <span className={styles.servicePipe} />
          <div className={styles.facilityRackGrid}>
            {Array.from({ length: space.beds }, (_, index) => (
              <FacilityModule kind="rack" label={`BED ${String(index + 1).padStart(2, "0")}`} slot={index + 1} key={`rack-${index + 1}`} />
            ))}
          </div>
        </section>
        <section className={styles.facilityStorageRoom}>
          <span className={styles.facilityRoomLabel}><b>저장고</b><small>보관 존</small></span>
          <FacilityModule kind="storage" label="STORAGE" />
        </section>
        <section className={styles.facilityPackingRoom}>
          <span className={styles.facilityRoomLabel}><b>포장실</b><small>포장 존</small></span>
          <FacilityModule kind="packing" label="PACK" />
        </section>
        <section className={styles.facilityShippingRoom}>
          <span className={styles.facilityRoomLabel}><b>출하 존</b><small>출하 존</small></span>
          <FacilityModule kind="van" label="SHIP" />
        </section>
        <section className={styles.facilityOfficeRoom}>
          <span className={styles.facilityRoomLabel}><b>사무실</b><small>지원 존</small></span>
          <FacilityModule kind="office" label="OFFICE" />
        </section>
        <FacilityModule kind="worker" label="OPERATOR 01" />
        <button className={`${styles.facilityDoorSprite} ${styles.facilityInnerDoor} ${innerDoorOpen ? styles.openDoor : ""}`} type="button" onClick={() => setInnerDoorOpen((open) => !open)} aria-pressed={innerDoorOpen} aria-label={`재배 구역과 지원 구역 연결문 ${innerDoorOpen ? "닫기" : "열기"}`}><span>DOOR</span></button>
        <button className={`${styles.facilityDoorSprite} ${styles.facilityEntrance} ${entranceOpen ? styles.openDoor : ""}`} type="button" onClick={() => setEntranceOpen((open) => !open)} aria-pressed={entranceOpen} aria-label={`외부 출입문 ${entranceOpen ? "닫기" : "열기"}`}><span>ENTRANCE</span></button>
      </div>
      <div className={styles.mapTelemetry}>
        <span><small>GROW BED</small><b>{space.beds}</b></span>
        <span><small>LAYOUT</small><b>{space.layoutLabel}</b></span>
        <span><small>ROOM PLAN</small><b>6개 구역</b></span>
      </div>
    </div>
  );
}

export function AssignmentScreen() {
  const [spaceId, setSpaceId] = useState(SPACES[0].id);
  const [candidateId, setCandidateId] = useState(CANDIDATES[0].id);
  const [confirmed, setConfirmed] = useState(false);
  const space = SPACES.find((item) => item.id === spaceId) ?? SPACES[0];
  const candidateMatches = useMemo(() => getCandidateMatches(space), [space]);
  const candidate = candidateMatches.find((item) => item.id === candidateId) ?? candidateMatches[0];

  const selectSpace = (nextSpace: SpaceRecord) => {
    const nextMatches = getCandidateMatches(nextSpace);
    setSpaceId(nextSpace.id);
    setCandidateId(nextMatches[0].id);
  };

  useEffect(() => setConfirmed(false), [spaceId, candidateId]);

  return (
    <OperationsShell
      active="assignment"
      mobileView={<MobileAssignmentScreen />}
      branchValue={spaceId}
      onBranchChange={(branchId) => {
        const nextSpace = SPACES.find((item) => item.id === branchId);
        if (nextSpace) selectSpace(nextSpace);
      }}
      eyebrow="OPERATOR × SPACE MATCHING"
      title="운영자 배정실"
      description="운영자를 각 공간에 효율적으로 배정하여 농장의 생산성과 흐름을 최적화하세요."
      status="배정 검토 3건"
      context={[
        { label: "공간 구조", code: "SPACE", href: "#spaces", glyph: "▦" },
        { label: "운영자 후보", code: "PEOPLE", href: "#matching", glyph: "♟" },
        { label: "운영 조건", code: "TERMS", href: "#terms", glyph: "✓" },
        { label: "배정 기록", code: "HISTORY", href: "#history", glyph: "▤" },
      ]}
    >
      <section className={styles.metricRail} aria-label="배정 현황 요약">
        <MetricSlot code="01" label="근무 중 운영자" value="12" unit="/ 15명" detail="가동률 80%" />
        <MetricSlot code="02" label="활성 공간" value="6" unit="/ 7개" detail="비활성 1개" />
        <MetricSlot code="03" label="배정 완료율" value="92" unit="%" detail="완료 11 / 12건" />
        <MetricSlot code="04" label="열린 작업" value="3" unit="건" detail="지연 1건" warning />
      </section>

      <section className={styles.assignmentGrid} id="spaces">
        <section className={styles.assignmentAreaTabs} aria-label="공간 선택">
          <header>공간 선택</header>
          <div>
            {[
              ["구역 A", "재배 존", "4 / 4명", "grow"],
              ["구역 B", "재배 존", "3 / 4명", "grow"],
              ["포장실", "포장 존", "2 / 2명", "pack"],
              ["저장고", "보관 존", "1 / 1명", "store"],
              ["출하 존", "출하 존", "1 / 1명", "ship"],
              ["사무실", "지원 존", "1 / 1명", "office"],
              ["휴게실", "지원 존", "0 / 1명", "rest"],
            ].map(([label, sub, count, kind], index) => (
              <button className={index === 0 ? styles.selectedAreaTab : ""} type="button" key={label}>
                <span className={styles.assignmentZoneIcon} data-kind={kind} aria-hidden="true" />
                <span><b>{label}</b><small>{sub}</small><strong>{count}</strong></span>
              </button>
            ))}
          </div>
        </section>
        <article className={`${styles.panel} ${styles.spacePanel}`}>
          <PanelTitle code="SITE BLUEPRINT" title={`${space.name} 상세 공간 구조`} badge={space.area} />
          <div className={styles.siteIdentity}>
            <span>{String(SPACES.findIndex((item) => item.id === space.id) + 1).padStart(2, "0")}</span>
            <div><small>{space.status} · {space.layoutLabel}</small><b>{space.location}</b></div>
            <em>{space.dimensions}</em>
          </div>
          <div className={styles.facilityCanvas}>
            <FacilityComposition space={space} />
            <div className={styles.facilityLegend}><span><i className={styles.growLegend} />구역 A 베드</span><span><i className={styles.storeLegend} />저장고</span><span><i className={styles.utilityLegend} />사무실</span><span><i className={styles.aisleLegend} />작업자 1명</span></div>
          </div>
          <div className={`${styles.spaceFacts} ${styles.facilityFacts}`}>
            <span><small>공간 유형</small><b>{space.layoutLabel}</b></span><span><small>재배 베드</small><b>{space.beds}개</b></span>
            <span><small>지원 구역</small><b>{space.supportLabel}</b></span><span><small>접근성</small><b>{space.access}</b></span>
            <span><small>전력·층고</small><b>{space.power} · {space.ceiling}</b></span><span><small>급배수</small><b>{space.water}</b></span>
            </div>
        </article>

        <article className={`${styles.panel} ${styles.matchPanel}`} id="matching">
          <PanelTitle code="OPERATOR LIST" title="운영자 목록" />
          <div className={styles.matchFormula}><span>전체 후보</span><b>● 재배 경험</b><b>● 운영 가능</b><b>● 위생 교육</b></div>
          <div className={styles.candidateList}>
            {candidateMatches.map((item) => (
              <button className={candidateId === item.id ? styles.selectedCandidate : ""} type="button" onClick={() => setCandidateId(item.id)} aria-pressed={candidateId === item.id} key={item.id}>
                <span className={styles.candidateIdentity}>
                  <span className={styles.rankNo}>{candidateId === item.id ? "✓" : ""}</span>
                  <span className={styles.operatorPortrait} style={{ "--portrait-x": item.portraitPosition } as CSSProperties} aria-hidden="true" />
                  <span className={styles.listCopy}><b>{item.name}</b><small>LV.{item.level} <em data-role={item.role}>{item.role}</em></small></span>
                  <span className={styles.candidateAssignment}><b>{item.assignedZone}</b><small>{item.role} 존</small></span>
                  <strong className={`${styles.candidateRowState} ${item.assignmentState === "이동 중" ? styles.movingCandidateState : item.assignmentState === "대기" ? styles.waitingCandidateState : ""}`}>{item.assignmentState}</strong>
                </span>
                <span className={styles.candidateProfile}>
                  <span><small>예상 이동</small><b>{item.travel}분</b></span>
                  <span><small>경력</small><b>{item.experience}</b></span>
                  <span><small>교육</small><b>{item.training}</b></span>
                  <span><small>운영 가능</small><b>{item.availability}</b></span>
                </span>
                <span className={styles.factorScores}>
                  <em>거리 {item.proximityScore}</em><em>경험 {item.experienceScore}</em><em>운영 {item.availabilityScore}</em><em>공간 {item.fitScore}</em>
                </span>
              </button>
            ))}
            <button className={styles.inviteOperatorButton} type="button"><span>＋</span><b>운영자 초대</b><small>새로운 운영자를 초대하세요.</small></button>
          </div>
        </article>

        <article className={`${styles.panel} ${styles.termsPanel}`} id="terms">
          <PanelTitle code="ASSIGNMENT TERMS" title="운영 조건 확인·최종 배정" badge={confirmed ? "배정 완료" : "검토 중"} />
          <div className={styles.termsWorkspace}>
            <div className={styles.selectedPairColumn}>
              <div className={styles.pairCard}>
                <span className={styles.pairSpace}>▦</span><div><small>선택 공간</small><b>{space.name}</b><em>{space.area} · {space.layoutLabel}</em></div>
                <span className={styles.pairArrow}>↕</span>
                <span className={styles.pairPerson}>♟</span><div><small>선택 운영자</small><b>{candidate.name}</b><em>{candidate.area} · 이동 {candidate.travel}분</em></div>
              </div>
              <div className={styles.strengths}><small>운영자 강점</small>{candidate.strengths.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
            <div className={styles.termChecklist} key={`${space.id}-${candidate.id}`}>
              <label><input type="checkbox" defaultChecked /> 독립사업자 운영 구조 확인</label>
              <label><input type="checkbox" defaultChecked /> 일 1~2회 방문 가능</label>
              <label><input type="checkbox" defaultChecked /> 전기·자재비 부담 조건 확인</label>
              <label><input type="checkbox" defaultChecked={space.score >= 85} /> 공간 사용 조건 합의</label>
            </div>
            <div className={styles.assignmentDecision}>
              <div className={styles.decisionScore}><span>최종 적합도</span><b>{candidate.score}<small>%</small></b><em>운영 조건 종합</em></div>
              <p><small>추천 근거</small>{candidate.name} 운영자는 재배·매장 경험과 운영 가능 시간, {space.layoutLabel} 운영 적합성을 종합했을 때 현재 후보 중 {candidateMatches.findIndex((item) => item.id === candidate.id) + 1}순위입니다.</p>
              <button className={styles.primaryButton} type="button" onClick={() => setConfirmed(true)} disabled={confirmed}>
                {confirmed ? `${candidate.name} 운영자 배정 완료 ✓` : `${candidate.name} 운영자로 배정하기`}
              </button>
              <p className={styles.boundaryNote}><span>F</span> 배정은 고용이 아닌 독립 운영자와 공간의 연결입니다.</p>
            </div>
          </div>
        </article>
      </section>
    </OperationsShell>
  );
}

const INVENTORY_CROPS = [
  { id: "butter", name: "상추류", bed: "베드 A · BED 01", growing: 47, ready: 42, expected: 42, stage: "성숙", stock: 162, sold: 30, maturity: 100, advice: "성숙 완료 · 즉시 수확 가능", status: "수확 가능", frame: "97%", tomato: false },
  { id: "romaine", name: "로메인", bed: "베드 B · BED 02", growing: 34, ready: 28, expected: 28, stage: "성장", stock: 88, sold: 10, maturity: 78, advice: "성장 중 · 다음 수확 대기", status: "성장", frame: "76%", tomato: false },
  { id: "basil", name: "바질", bed: "베드 C · BED 03", growing: 26, ready: 18, expected: 18, stage: "초기", stock: 56, sold: 5, maturity: 32, advice: "초기 생육 · 관수 상태 정상", status: "초기", frame: "54%", tomato: false },
  { id: "tomato", name: "방울토마토", bed: "베드 D · BAY 01", growing: 42, ready: 36, expected: 36, stage: "열매 맺음", stock: 36, sold: 0, maturity: 61, advice: "열매 맺음 · 선별 수확 준비", status: "열매 맺음", frame: "95%", tomato: true },
];

const INVENTORY_STORAGE_ITEMS = [
  { name: "상추", current: 162, reserved: 30, iconPosition: "0% 0%" },
  { name: "로메인", current: 88, reserved: 10, iconPosition: "50% 0%" },
  { name: "바질", current: 56, reserved: 5, iconPosition: "100% 0%" },
  { name: "방울토마토", current: 36, reserved: 0, iconPosition: "0% 100%" },
  { name: "허브 믹스", current: 18, reserved: 2, iconPosition: "50% 100%" },
  { name: "잎채소 믹스", current: 24, reserved: 0, iconPosition: "100% 100%" },
];

type InventoryIconKind = "harvest" | "low" | "packing" | "shipping" | "waste" | "complete" | "add" | "storage";

const INVENTORY_ICON_POSITIONS: Record<InventoryIconKind, string> = {
  harvest: "0% 0%",
  low: "33.333% 0%",
  packing: "66.666% 0%",
  shipping: "100% 0%",
  waste: "0% 100%",
  complete: "33.333% 100%",
  add: "66.666% 100%",
  storage: "100% 100%",
};

const INVENTORY_ALERTS: Array<{
  id: string;
  icon: InventoryIconKind;
  tone: "good" | "warn" | "info" | "ship" | "danger" | "done";
  label: string;
  title: string;
  detail: string;
  action: string;
  cropId: string;
}> = [
  { id: "harvest", icon: "harvest", tone: "good", label: "수확 가능", title: "베드 A · 상추 42단위", detail: "성숙 완료 · 즉시 수확 가능", action: "수확", cropId: "butter" },
  { id: "restock", icon: "low", tone: "warn", label: "재고 부족", title: "로메인 재고 기준 이하", detail: "현재 88 / 기준 100", action: "보충 계획", cropId: "romaine" },
  { id: "packing", icon: "packing", tone: "info", label: "포장 대기", title: "상추 포장 대기 22단위", detail: "포장 라인으로 이동 필요", action: "처리", cropId: "butter" },
  { id: "shipping", icon: "shipping", tone: "ship", label: "출하 예약", title: "출하 예약 2건 (총 18단위)", detail: "내일 10:00 출하 예정", action: "상세", cropId: "tomato" },
  { id: "waste", icon: "waste", tone: "danger", label: "폐기 위험", title: "바질 5단위 유통기한 임박", detail: "2일 이내 출하 권장", action: "확인", cropId: "basil" },
  { id: "complete", icon: "complete", tone: "done", label: "작업 완료", title: "베드 C 관수 완료", detail: "성장률 +8% 추가", action: "확인", cropId: "basil" },
];

function InventoryStatusIcon({ kind }: { kind: InventoryIconKind }) {
  return <span className={styles.inventoryStatusIcon} style={{ "--inventory-icon-position": INVENTORY_ICON_POSITIONS[kind] } as CSSProperties} aria-hidden="true" />;
}

export function InventoryScreen() {
  const [cropId, setCropId] = useState(INVENTORY_CROPS[0].id);
  const [handledAlerts, setHandledAlerts] = useState<string[]>(["complete"]);
  const crop = INVENTORY_CROPS.find((item) => item.id === cropId) ?? INVENTORY_CROPS[0];

  const toggleAlert = (id: string, nextCropId: string) => {
    setCropId(nextCropId);
    setHandledAlerts((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return (
    <OperationsShell
      active="inventory"
      mobileView={<MobileInventoryScreen selectedCropId={cropId} onSelectCrop={setCropId} />}
      eyebrow="GROW × STORE LINK"
      title="재고 연동실"
      description="생육 상태와 재고 흐름을 연동하여 작물의 생산부터 출하까지를 효율적으로 관리하세요."
      status="진행 알림 6건"
      context={[
        { label: "오늘 할 일", code: "TODAY", href: "#today", glyph: "✓" },
        { label: "재배 흐름", code: "FLOW", href: "#flow", glyph: "⇢" },
        { label: "품목 상세", code: "DETAIL", href: "#detail", glyph: "▦" },
        { label: "처리 기록", code: "LOG", href: "#log", glyph: "▤" },
      ]}
    >
      <section className={styles.metricRail} aria-label="재고 생육 요약">
        <MetricSlot code="01" label="금일 수확량" value="128" unit="단위" detail="어제보다 +18%" />
        <MetricSlot code="02" label="수확 가능 작물" value="47" unit="단위" detail="3개 베드" />
        <MetricSlot code="03" label="저장고 사용률" value="68" unit="%" detail="사용 342 / 500칸" />
        <MetricSlot code="04" label="연동 출하 알림" value="2" unit="건" detail="출하 예정 2건" warning />
      </section>

      <section className={styles.inventoryCommandLayout}>
        <article className={`${styles.panel} ${styles.inventoryGamePanel}`} id="map">
          <PanelTitle code="PRODUCTION FLOOR" title="생산 → 재고 → 출하 맵" badge="LIVE" />
          <div className={styles.inventoryGameMap}>
            <span className={styles.inventoryPipeSpine} aria-hidden="true" />
            <span className={styles.inventoryRouteLane} aria-hidden="true" />
            <span className={styles.inventoryRoamingWorker} aria-hidden="true" />
            <span className={styles.inventoryMovingTruck} aria-hidden="true" />

            <section className={`${styles.inventoryMapZone} ${styles.inventoryBedsZone}`}>
              <header><b>재배 구역</b><small>GROW</small></header>
              <div className={styles.inventoryBedStack}>
                {INVENTORY_CROPS.map((item, index) => (
                  <button className={cropId === item.id ? styles.selectedInventoryBed : ""} type="button" onClick={() => setCropId(item.id)} aria-pressed={cropId === item.id} key={item.id}>
                    <span className={styles.inventoryBedSprite} aria-hidden="true" />
                    <span className={styles.inventoryBedHud}>
                      <small>베드 {String.fromCharCode(65 + index)}</small>
                      <b>{item.name}</b>
                      <em>생육 단계 {item.stage}</em>
                      <strong>예상 수확 {item.expected} 단위</strong>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className={`${styles.inventoryMapZone} ${styles.inventoryBufferZone}`}>
              <header><b>수확 대기</b><small>BUFFER</small></header>
              <span className={styles.harvestTrolleySprite} aria-hidden="true" />
              <div className={styles.inventoryZoneReadout}><small>수확 대기</small><b>47<em>단위</em></b><span>재배 구역에서 운반 중</span></div>
              <i className={styles.inventoryFlowArrow} aria-hidden="true">→</i>
            </section>

            <section className={`${styles.inventoryMapZone} ${styles.inventoryStorageZone}`}>
              <header><b>저장고 (보관 구역)</b><small>COLD STORAGE</small></header>
              <div className={styles.inventoryStorageGrid}>
                {INVENTORY_STORAGE_ITEMS.map((item) => (
                  <article key={item.name}>
                    <span className={styles.inventoryStorageCropIcon} style={{ "--storage-icon-position": item.iconPosition } as CSSProperties} aria-hidden="true" />
                    <div><b>{item.name}</b><small>현재 <strong>{item.current}</strong></small><small>예약 <strong>{item.reserved}</strong></small></div>
                  </article>
                ))}
              </div>
              <div className={styles.inventoryStorageSummary}>
                <span><i />정상 재고<b>5종</b></span><span><i />부족 재고<b>1종</b></span><span><i />과잉 재고<b>1종</b></span><span><i />폐기 위험<b>1종</b></span>
              </div>
            </section>

            <section className={`${styles.inventoryMapZone} ${styles.inventoryDispatchZone}`}>
              <header><b>포장·출하</b><small>PACK → SHIP</small></header>
              <div className={styles.inventoryDispatchStep}>
                <span className={styles.inventoryPackingSprite} aria-hidden="true" />
                <small>포장 대기</small><b>22 단위</b>
              </div>
              <i aria-hidden="true">→</i>
              <div className={styles.inventoryDispatchStep}>
                <span className={styles.inventoryPackingActiveSprite} aria-hidden="true" />
                <small>포장 중</small><b>12 단위</b>
              </div>
              <i aria-hidden="true">→</i>
              <div className={styles.inventoryDispatchStep}>
                <span className={styles.inventoryShippingBoxesSprite} aria-hidden="true" />
                <small>출하 대기</small><b>18 단위</b>
              </div>
              <i aria-hidden="true">→</i>
              <div className={styles.inventoryDispatchStep}>
                <small>출하 예약</small><b>2건</b>
              </div>
            </section>
          </div>
        </article>

        <article className={`${styles.panel} ${styles.inventoryAlertPanel}`} id="today">
          <PanelTitle code="LIVE ALERTS" title="연동 알림·작업" badge={`${handledAlerts.length}/${INVENTORY_ALERTS.length}`} />
          <div className={styles.inventoryAlertFilters}><span>전체</span><i />수확<i />재고<i />포장<i />출하</div>
          <div className={styles.inventoryAlerts}>
            {INVENTORY_ALERTS.map((alert) => {
              const done = handledAlerts.includes(alert.id);
              return (
                <button className={`${styles.inventoryAlert} ${styles[`inventoryAlert_${alert.tone}`]} ${done ? styles.handledAlert : ""}`} type="button" onClick={() => toggleAlert(alert.id, alert.cropId)} aria-pressed={done} key={alert.id}>
                  <InventoryStatusIcon kind={alert.icon} />
                  <span><small>{alert.label}</small><b>{alert.title}</b><em>{alert.detail}</em></span>
                  <strong>{done ? "✓" : alert.action}</strong>
                </button>
              );
            })}
          </div>
          <button className={styles.addInventoryTask} type="button"><InventoryStatusIcon kind="add" /><span><b>새 작업 등록</b><small>작업 계획을 추가하세요.</small></span></button>
        </article>
      </section>

      <section className={`${styles.inventoryLayout} ${styles.inventoryDataLayout}`}>

        <article className={`${styles.panel} ${styles.flowBoard}`} id="flow">
          <PanelTitle code="CROP PIPELINE" title="재배에서 매장까지" badge="LIVE" />
          <div className={styles.flowLegend}><span>작물·베드</span><span>재배 중</span><span>수확 가능</span><span>매장 재고</span><span>7일 판매</span></div>
          <div className={styles.cropFlows}>
            {INVENTORY_CROPS.map((item) => (
              <button className={cropId === item.id ? styles.selectedFlow : ""} type="button" onClick={() => setCropId(item.id)} key={item.id}>
                <span className={styles.flowCropName}><i>{item.tomato ? "●" : "♣"}</i><b>{item.name}</b><small>{item.bed}</small></span>
                <FlowNode value={item.growing} unit="포기" /> <em>→</em>
                <FlowNode value={item.ready} unit="포기" accent /> <em>→</em>
                <FlowNode value={item.stock} unit="팩" cyan />
                <FlowNode value={item.sold} unit="팩" amber />
                <span className={styles.flowTag}>{item.status}</span>
              </button>
            ))}
          </div>
        </article>

        <article className={`${styles.panel} ${styles.cropDetailPanel}`} id="detail">
          <PanelTitle code="SELECTED CROP" title={crop.name} badge={`${crop.maturity}%`} />
          <div className={styles.cropVisual}>
            <div
              className={`${styles.cropSprite} ${crop.tomato ? styles.tomatoSprite : ""}`}
              style={{ "--crop-frame": crop.frame } as CSSProperties}
              aria-hidden="true"
            />
            <span><small>선택 구역</small><b>{crop.bed}</b><em>{crop.status}</em></span>
          </div>
          <div className={styles.detailMeters}>
            <DetailMeter label="성숙도" value={crop.maturity} text={`${crop.maturity}%`} />
            <DetailMeter label="매장 재고" value={Math.min(100, crop.stock * 6)} text={`${crop.stock}팩`} />
            <DetailMeter label="판매 속도" value={Math.min(100, crop.sold * 4)} text={`${crop.sold}팩/7일`} />
          </div>
          <div className={styles.recommendBox}><span>추천</span><p>{crop.advice}</p></div>
          <button className={styles.primaryButton} type="button" onClick={() => setHandledAlerts((current) => current.includes("harvest") ? current : [...current, "harvest"])}>추천 내용을 오늘 기록에 반영</button>
        </article>
      </section>
    </OperationsShell>
  );
}

const PERIOD_DATA = {
  week: { revenue: "2,184,000", units: 124, average: "17,613", growth: "+12.4", bars: [21, 14, 8, 12], trend: [15, 24, 19, 31, 28, 42, 48, 44, 56, 61, 58, 72, 69, 78] },
  month: { revenue: "8,742,000", units: 506, average: "17,277", growth: "+8.7", bars: [88, 61, 34, 49], trend: [24, 31, 28, 42, 39, 51, 47, 60, 56, 68, 65, 77, 74, 84] },
  quarter: { revenue: "25,630,000", units: 1482, average: "17,294", growth: "+16.1", bars: [242, 181, 102, 147], trend: [20, 28, 35, 32, 46, 52, 49, 61, 67, 64, 75, 81, 79, 91] },
};

const SALES_ROWS = [
  { name: "버터헤드", sold: 21, revenue: "798,000", rate: 94, stock: 6, verdict: "증산 추천", tone: "good" },
  { name: "로메인", sold: 14, revenue: "532,000", rate: 78, stock: 15, verdict: "현행 유지", tone: "normal" },
  { name: "방울토마토", sold: 12, revenue: "516,000", rate: 81, stock: 9, verdict: "소폭 증산", tone: "good" },
  { name: "바질", sold: 8, revenue: "338,000", rate: 52, stock: 11, verdict: "감산 검토", tone: "warn" },
];

function trendPoints(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((value, index) => {
    const x = 18 + (index / (values.length - 1)) * 684;
    const y = 154 - ((value - min) / (max - min || 1)) * 126;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function SalesScreen() {
  const [period, setPeriod] = useState<keyof typeof PERIOD_DATA>("week");
  const [message, setMessage] = useState<string | null>(null);
  const data = PERIOD_DATA[period];
  const maxBar = Math.max(...data.bars);
  const points = useMemo(() => trendPoints(data.trend), [data.trend]);

  return (
    <OperationsShell
      active="sales"
      mobileView={<MobileSalesScreen />}
      eyebrow="SALES × NEXT CYCLE"
      title="판매 데이터 리포트"
      description="품목별 판매량과 재고 회전율을 비교해 다음 재배 사이클의 품목과 수량을 조정할 근거를 제공합니다."
      status="7월 데이터 정상"
      context={[
        { label: "매출 요약", code: "SUMMARY", href: "#summary", glyph: "▦" },
        { label: "판매 추이", code: "TREND", href: "#trend", glyph: "⌁" },
        { label: "품목 분석", code: "CROPS", href: "#crops", glyph: "♣" },
        { label: "다음 재배", code: "NEXT", href: "#next", glyph: "→" },
      ]}
    >
      <div className={styles.reportControls}>
        <div className={styles.periodTabs}>
          <button className={period === "week" ? styles.activePeriod : ""} type="button" onClick={() => setPeriod("week")}>최근 7일</button>
          <button className={period === "month" ? styles.activePeriod : ""} type="button" onClick={() => setPeriod("month")}>이번 달</button>
          <button className={period === "quarter" ? styles.activePeriod : ""} type="button" onClick={() => setPeriod("quarter")}>최근 분기</button>
        </div>
        <button className={styles.exportButton} type="button" onClick={() => setMessage("현재 리포트를 CSV 내보내기 목록에 담았습니다.")}>▤ 데이터 내보내기</button>
      </div>

      <section className={styles.metricRail} id="summary" aria-label="판매 요약">
        <MetricSlot code="01" label="총 판매액" value={data.revenue} unit="원" detail="부산대 1호점" />
        <MetricSlot code="02" label="판매 수량" value={String(data.units)} unit="팩" detail="4개 품목 합계" />
        <MetricSlot code="03" label="팩당 평균" value={data.average} unit="원" detail="할인 반영" />
        <MetricSlot code="04" label="이전 기간 대비" value={data.growth} unit="%" detail="판매액 기준" />
      </section>

      <section className={styles.salesImagegenHero} aria-label="네 가지 판매 품목의 픽셀 매장 장면">
        <header><span><i /> RETAIL FLOOR LIVE</span><b>오늘의 품목 진열과 판매 흐름</b><em>부산대 1호점</em></header>
        <div className={styles.salesProductPins}>
          {SALES_ROWS.map((row, index) => <span key={row.name}><small>{String(index + 1).padStart(2, "0")}</small><b>{row.name}</b><em>{row.sold}팩 · {row.verdict}</em></span>)}
        </div>
      </section>

      <section className={styles.salesGrid}>
        <article className={`${styles.panel} ${styles.salesTrendPanel}`} id="trend">
          <PanelTitle code="SALES TREND" title="판매 흐름" badge={period === "week" ? "14 DAYS" : period === "month" ? "12 WEEKS" : "6 MONTHS"} />
          <div className={styles.salesChartSummary}><span><small>현재 판매액</small><b>{data.revenue}원</b></span><em>이전 기간 대비 <b>{data.growth}%</b></em></div>
          <div className={styles.salesChart}>
            <svg viewBox="0 0 720 176" role="img" aria-label="판매액 변화 추이">
              {[28, 68, 108, 148].map((y) => <line key={y} x1="18" x2="702" y1={y} y2={y} />)}
              <polyline points={points} />
              {points.split(" ").map((point, index) => { const [x, y] = point.split(","); return <rect x={Number(x) - 3} y={Number(y) - 3} width="6" height="6" key={`${x}-${index}`} />; })}
            </svg>
            <div><span>START</span><span>25%</span><span>50%</span><span>75%</span><span>NOW</span></div>
          </div>
        </article>

        <article className={`${styles.panel} ${styles.cropBarsPanel}`}>
          <PanelTitle code="CROP SHARE" title="품목별 판매량" badge="PACK" />
          <div className={styles.cropBars}>
            {SALES_ROWS.map((row, index) => (
              <div key={row.name}><span className={styles.verticalBar}><i style={{ height: `${Math.max(12, (data.bars[index] / maxBar) * 100)}%` }}><b>{data.bars[index]}</b></i></span><strong>{row.name}</strong><small>{Math.round((data.bars[index] / data.bars.reduce((sum, value) => sum + value, 0)) * 100)}%</small></div>
            ))}
          </div>
        </article>
      </section>

      <section className={`${styles.panel} ${styles.salesTablePanel}`} id="crops">
        <PanelTitle code="CROP PERFORMANCE" title="품목별 판매·재고 분석" badge="최근 7일 기준" />
        <div className={styles.salesTableHead}><span>품목</span><span>판매량</span><span>판매액</span><span>회전율</span><span>현재 재고</span><span>판단</span></div>
        {SALES_ROWS.map((row, index) => (
          <div className={styles.salesRow} key={row.name}>
            <span className={styles.salesCrop}><i>{String(index + 1).padStart(2, "0")}</i><b>{row.name}</b></span>
            <strong>{row.sold}<small>팩</small></strong><strong>{row.revenue}<small>원</small></strong>
            <span className={styles.turnover}><i><b style={{ width: `${row.rate}%` }} /></i><em>{row.rate}%</em></span>
            <strong>{row.stock}<small>팩</small></strong><span className={`${styles.verdict} ${styles[row.tone]}`}>{row.verdict}</span>
          </div>
        ))}
      </section>

      <section className={styles.nextCycle} id="next">
        <div><span>F</span><p><small>NEXT GROW CYCLE</small><b>다음 재배 사이클 제안</b>버터헤드는 판매 속도가 생산 속도보다 14% 빠르고, 바질은 재고 회전이 느립니다.</p></div>
        <article><span>버터헤드</span><b>+8포기</b><small>30 → 38포기</small></article>
        <article><span>바질</span><b>-4포기</b><small>22 → 18포기</small></article>
        <button type="button" onClick={() => setMessage("다음 재배 사이클 검토안에 증감 제안을 저장했습니다.")}>검토안에 저장</button>
      </section>

      {message && <div className={styles.toast} role="status"><span>✓</span>{message}<button type="button" onClick={() => setMessage(null)}>×</button></div>}
    </OperationsShell>
  );
}

function MetricSlot({ code, label, value, unit, detail, warning = false }: { code: string; label: string; value: string; unit: string; detail: string; warning?: boolean }) {
  return <article className={warning ? styles.warningMetric : ""}><div><span>STAT {code}</span><i /></div><p>{label}</p><strong>{value}<small>{unit}</small></strong><em>{detail}</em></article>;
}

function PanelTitle({ code, title, badge }: { code: string; title: string; badge?: string }) {
  return <header className={styles.panelTitle}><div><span>{code}</span><h2>{title}</h2></div>{badge && <b>{badge}</b>}</header>;
}

function FlowNode({ value, unit, accent = false, cyan = false, amber = false }: { value: number; unit: string; accent?: boolean; cyan?: boolean; amber?: boolean }) {
  return <span className={`${styles.flowNode} ${accent ? styles.accentNode : ""} ${cyan ? styles.cyanNode : ""} ${amber ? styles.amberNode : ""}`}><b>{value}</b><small>{unit}</small></span>;
}

function DetailMeter({ label, value, text }: { label: string; value: number; text: string }) {
  return <div><span><small>{label}</small><b>{text}</b></span><i><em style={{ width: `${value}%` }} /></i></div>;
}
