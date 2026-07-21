"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./MobileFarmApp.module.css";

export type MobileServiceKey = "store" | "assignment" | "growth" | "inventory" | "sales";
export type MobileRackId = "A" | "B" | "C" | "D";
type CropKind = "butter" | "romaine" | "basil" | "tomato";
type IconName = "store" | "user" | "monitor" | "link" | "report" | "sprout" | "basket" | "check" | "drop" | "users" | "clock" | "calendar" | "bars" | "plus";
type PixelGlyphName = "store" | "sprout" | "basket" | "bars" | "users" | "bed" | "bulb";

const BRANCHES = ["부산대 1호점", "연산 2호점", "수영 3호점"];
const BRANCH_STORAGE_KEY = "farmfi:selected-branch";
const BRANCH_EVENT = "farmfi:branch-change";

const APP_TABS: Array<{ key: MobileServiceKey; label: string; icon: IconName; href: string }> = [
  { key: "store", label: "매장", icon: "store", href: "/dashboard/store" },
  { key: "assignment", label: "운영", icon: "sprout", href: "/dashboard/assignment" },
  { key: "growth", label: "모니터링", icon: "monitor", href: "/dashboard" },
  { key: "inventory", label: "연동", icon: "link", href: "/dashboard/inventory" },
  { key: "sales", label: "리포트", icon: "report", href: "/dashboard/sales" },
];

const CROP_POSITIONS: Record<CropKind, string> = {
  butter: "0% 0%",
  romaine: "50% 0%",
  basil: "100% 0%",
  tomato: "0% 100%",
};

const RACK_PLANT_ASSETS: Record<CropKind, { src: string; width: number; height: number }> = {
  butter: { src: "/assets/app-v2/crop-butterhead-stage-v1.png", width: 1254, height: 1254 },
  romaine: { src: "/assets/app-v2/crop-romaine-stage-v1.png", width: 1254, height: 1254 },
  basil: { src: "/assets/app-v2/crop-basil-stage-v1.png", width: 1254, height: 1254 },
  tomato: { src: "/assets/app-v2/crop-tomato-stage-v1.png", width: 1024, height: 1536 },
};

const RACK_DATA: Record<MobileRackId, { crop: string; kind: CropKind; state: string; stage: string; maturity: number; humidity: number }> = {
  A: { crop: "버터헤드", kind: "butter", state: "정상", stage: "수확기", maturity: 92, humidity: 92 },
  B: { crop: "로메인", kind: "romaine", state: "정상", stage: "성장기", maturity: 75, humidity: 88 },
  C: { crop: "바질", kind: "basil", state: "정상", stage: "성장기", maturity: 68, humidity: 84 },
  D: { crop: "방울토마토", kind: "tomato", state: "관찰", stage: "착과기", maturity: 72, humidity: 78 },
};

const STORE_DATA: Array<{ name: string; harvest: number; beds: number; rack: MobileRackId }> = [
  { name: "부산대 1호점", harvest: 38, beds: 4, rack: "A" },
  { name: "연산 2호점", harvest: 24, beds: 4, rack: "B" },
  { name: "수영 3호점", harvest: 31, beds: 4, rack: "C" },
];

const STOCK_ROWS: Array<{ kind: CropKind; name: string; stock: number; value: number }> = [
  { kind: "butter", name: "버터헤드", stock: 12, value: 68 },
  { kind: "romaine", name: "로메인", stock: 8, value: 53 },
  { kind: "basil", name: "바질", stock: 6, value: 40 },
  { kind: "tomato", name: "방울토마토", stock: 4, value: 31 },
];

const LINKED_BEDS: Array<{ rack: MobileRackId; kind: CropKind; crop: string; maturity: number; harvest: string; yield: number }> = [
  { rack: "A", kind: "butter", crop: "버터헤드", maturity: 92, harvest: "2일 후", yield: 14 },
  { rack: "B", kind: "romaine", crop: "로메인", maturity: 75, harvest: "4일 후", yield: 10 },
  { rack: "C", kind: "basil", crop: "바질", maturity: 68, harvest: "6일 후", yield: 12 },
  { rack: "D", kind: "tomato", crop: "방울토마토", maturity: 45, harvest: "9일 후", yield: 8 },
];

const SALES_RANKING: Array<{ kind: CropKind; name: string; count: number; value: number }> = [
  { kind: "butter", name: "버터헤드", count: 520, value: 100 },
  { kind: "romaine", name: "로메인", count: 320, value: 67 },
  { kind: "basil", name: "바질", count: 240, value: 51 },
  { kind: "tomato", name: "방울토마토", count: 200, value: 40 },
];

const SALES_HISTORY = [
  ["07.16", "버터헤드", "2팩", "18,000원"],
  ["07.16", "로메인", "1팩", "8,500원"],
  ["07.15", "바질", "1팩", "6,000원"],
];

const CHART_VALUES = [52, 102, 82, 128, 102, 82, 102, 103, 151, 127, 169, 103, 153, 104, 151];

function useSelectedBranch() {
  const [branch, setBranchState] = useState(BRANCHES[0]);

  useEffect(() => {
    const storedBranch = window.localStorage.getItem(BRANCH_STORAGE_KEY);
    if (storedBranch && BRANCHES.includes(storedBranch)) setBranchState(storedBranch);

    const syncBranch = (event: Event) => {
      const nextBranch = (event as CustomEvent<string>).detail;
      if (BRANCHES.includes(nextBranch)) setBranchState(nextBranch);
    };
    window.addEventListener(BRANCH_EVENT, syncBranch);
    return () => window.removeEventListener(BRANCH_EVENT, syncBranch);
  }, []);

  const setBranch = useCallback((nextBranch: string) => {
    if (!BRANCHES.includes(nextBranch)) return;
    setBranchState(nextBranch);
    window.localStorage.setItem(BRANCH_STORAGE_KEY, nextBranch);
    window.dispatchEvent(new CustomEvent<string>(BRANCH_EVENT, { detail: nextBranch }));
  }, []);

  return [branch, setBranch] as const;
}

function PixelGlyph({ name, size = 24 }: { name: PixelGlyphName; size?: number }) {
  const dark = "#252923";
  const green = "#5f973d";
  const greenDark = "#1e603d";
  const lime = "#a8cf52";
  const yellow = "#f2cf68";
  const brown = "#8a6039";
  return (
    <svg className={styles.pixelGlyph} width={size} height={size} viewBox="0 0 24 24" shapeRendering="crispEdges" aria-hidden="true">
      {name === "sprout" && <>
        <path fill={dark} d="M11 9h2v11h-2zM4 4h6v2H4zm-1 2h2v4H3zm2 4h6v2H5zm9-7h7v2h-7zm-2 2h2v6h-2zm2 6h5v2h-5zM7 20h10v2H7z" />
        <path fill={lime} d="M5 6h4v2H5zm2 2h4v2H7zm9-3h4v2h-4zm-2 2h4v3h-4z" />
        <path fill={green} d="M5 8h2v2H5zm4 0h2v2H9zm5 2h4v1h-4z" />
        <path fill={brown} d="M9 19h6v2H9z" />
      </>}
      {name === "store" && <>
        <path fill={dark} d="M4 3h16v2h1v6h-1v10H4V11H3V5h1zm2 10v6h12v-6z" />
        <path fill={yellow} d="M5 5h3v5H5zm6 0h3v5h-3zm6 0h2v5h-2z" />
        <path fill={green} d="M8 5h3v5H8zm6 0h3v5h-3z" />
        <path fill="#fff7d9" d="M6 12h12v7H6z" />
        <path fill={greenDark} d="M7 13h4v6H7zm6 1h4v3h-4z" />
      </>}
      {name === "basket" && <>
        <path fill={dark} d="M7 3h2v2h6V3h2v2h2v3h2v12H3V8h2V5h2zm-2 7v8h14v-8z" />
        <path fill={brown} d="M5 10h14v8H5z" />
        <path fill="#c18a49" d="M7 11h2v6H7zm4 0h2v6h-2zm4 0h2v6h-2z" />
        <path fill={green} d="M6 6h4v3H6zm8-1h4v4h-4zm-4 1h4v3h-4z" />
        <path fill={lime} d="M7 5h2v2H7zm8 1h2v2h-2zm-4-1h2v2h-2z" />
      </>}
      {name === "bars" && <>
        <path fill={dark} d="M3 14h5v8H3zm7-5h5v13h-5zm7-6h5v19h-5z" />
        <path fill={green} d="M5 16h2v4H5zm7-5h2v9h-2zm7-6h2v15h-2z" />
      </>}
      {name === "users" && <>
        <path fill={dark} d="M5 4h5v2h2v5h-2v2H5v-2H3V6h2zm9 1h5v2h2v5h-2v1h-5v-1h-2V7h2zM3 15h9v2h2v5H1v-5h2zm11 0h7v2h2v5h-8v-4h-1z" />
        <path fill={yellow} d="M5 6h5v5H5zm9 1h5v4h-5z" />
        <path fill="#fff" d="M3 17h9v3H3zm13 0h5v3h-5z" />
      </>}
      {name === "bed" && <>
        <path fill={dark} d="M3 5h2v14H3zm16 0h2v14h-2zM5 6h14v3H5zm0 6h14v3H5zM2 19h4v2H2zm16 0h4v2h-4z" />
        <path fill={brown} d="M5 7h14v1H5zm0 6h14v1H5z" />
      </>}
      {name === "bulb" && <>
        <path fill={dark} d="M9 2h6v2h2v2h2v7h-2v2h-2v3H9v-3H7v-2H5V6h2V4h2zm0 4v6h2v3h2v-3h2V6zM9 20h6v2H9z" />
        <path fill={yellow} d="M9 5h6v2h2v5h-2v2h-6v-2H7V7h2z" />
        <path fill="#fff2a6" d="M10 6h3v2h-3z" />
      </>}
    </svg>
  );
}

function AppIcon({ name, size = 24 }: { name: IconName; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className={styles.appIcon} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {name === "store" && <g {...common}><path d="M3 9h18l-2-5H5L3 9Z" /><path d="M5 9v10h14V9M8 19v-6h4v6M15 12h2" /><path d="M4 9c0 1.2 1 2 2.1 2S8 10.2 8 9c0 1.2 1 2 2 2s2-1 2-2c0 1.2 1 2 2 2s2-1 2-2c0 1.2.9 2 2 2s2-1 2-2" /></g>}
      {name === "user" && <g {...common}><circle cx="12" cy="7" r="3.2" /><path d="M5.5 20c.4-4.2 2.6-6.5 6.5-6.5s6.1 2.3 6.5 6.5" /></g>}
      {name === "monitor" && <g {...common}><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></g>}
      {name === "link" && <g {...common}><path d="m9.5 14.5-2 2a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" /><path d="m14.5 9.5 2-2a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0M8.5 15.5l7-7" /></g>}
      {name === "report" && <g fill="currentColor"><rect x="3.5" y="14" width="4.2" height="7" rx=".8" /><rect x="9.9" y="9" width="4.2" height="12" rx=".8" /><rect x="16.3" y="3" width="4.2" height="18" rx=".8" /></g>}
      {name === "sprout" && <g {...common}><path d="M12 21v-9" /><path d="M12 12C7 12 5 9.8 5 5c4.8 0 7 2 7 7ZM12 11c0-4.4 2.2-6.4 7-6.4 0 4.5-2.3 6.4-7 6.4Z" /><path d="M8 21h8" /></g>}
      {name === "basket" && <g {...common}><path d="M4 9h16l-1.5 10h-13L4 9ZM8 9l4-5 4 5M8 13v3M12 13v3M16 13v3" /></g>}
      {name === "check" && <g {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 8" /></g>}
      {name === "drop" && <g {...common}><path d="M12 3S6.5 9.2 6.5 14a5.5 5.5 0 0 0 11 0C17.5 9.2 12 3 12 3Z" /><path d="M9 15.5c.6 1.2 1.5 1.8 3 1.8" /></g>}
      {name === "users" && <g {...common}><circle cx="8" cy="8" r="3" /><circle cx="16.5" cy="8.5" r="2.5" /><path d="M2.5 20c.2-4 2-6 5.5-6s5.3 2 5.5 6M13 14.5c3.8-.8 7 1.2 7.5 5.5" /></g>}
      {name === "clock" && <g {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></g>}
      {name === "calendar" && <g {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></g>}
      {name === "bars" && <g {...common}><path d="M5 20v-6h3v6M10.5 20V9h3v11M16 20V4h3v16" /></g>}
      {name === "plus" && <g {...common}><path d="M12 4v16M4 12h16" /></g>}
    </svg>
  );
}

function StatusBar() {
  return (
    <div className={styles.statusBar} aria-hidden="true">
      <b>9:41</b>
      <span className={styles.dynamicIsland}><i /></span>
      <span className={styles.phoneSignals}><i /><i /><i /><em /><strong /></span>
    </div>
  );
}

function BranchSelect({ calendar = false }: { calendar?: boolean }) {
  const [branch, setBranch] = useSelectedBranch();
  return (
    <div className={styles.branchRow}>
      <label className={styles.branchSelect}>
        <PixelGlyph name="store" size={24} />
        <select value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="지점 선택">
          {BRANCHES.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
        <i aria-hidden="true" />
      </label>
      {calendar && <button className={styles.calendarButton} type="button" aria-label="리포트 날짜 선택"><AppIcon name="calendar" size={25} /></button>}
    </div>
  );
}

function BottomNavigation({ active }: { active: MobileServiceKey }) {
  return (
    <nav className={styles.bottomNav} data-active={active} aria-label="앱 주요 화면">
      {APP_TABS.map((item) => (
        <Link className={active === item.key ? styles.activeNav : ""} href={item.href} aria-current={active === item.key ? "page" : undefined} key={item.key}>
          <AppIcon name={item.icon} size={25} /><b>{item.label}</b>
        </Link>
      ))}
    </nav>
  );
}

function AppShell({ active, children }: { active: MobileServiceKey; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <main className={styles.appStage} data-mobile-screen={active}>
      <motion.div
        className={styles.appFrame}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}
      >
        <StatusBar />
        <div className={styles.appContent}>{children}</div>
        <BottomNavigation active={active} />
      </motion.div>
    </main>
  );
}

function CropPixel({ kind, size = "medium", className = "" }: { kind: CropKind; size?: "tiny" | "small" | "medium" | "large"; className?: string }) {
  return <span className={`${styles.cropPixel} ${styles[`crop_${size}`]} ${className}`} style={{ "--crop-position": CROP_POSITIONS[kind] } as CSSProperties} aria-hidden="true" />;
}

const LEAFY_SLOTS = [
  ...[29, 40.5, 52, 63.5, 75].map((x) => ({ x, y: 29.5 })),
  ...[29, 40.5, 52, 63.5, 75].map((x) => ({ x, y: 52.7 })),
  ...[29, 40.5, 52, 63.5, 75].map((x) => ({ x, y: 76.3 })),
];

const TOMATO_SLOTS = [
  ...[29, 43.5, 58, 72.5].map((x) => ({ x, y: 44.1 })),
  ...[29, 43.5, 58, 72.5].map((x) => ({ x, y: 78.6 })),
];

function RackPlant({ kind, index, maturity }: { kind: CropKind; index: number; maturity: number }) {
  const slots = kind === "tomato" ? TOMATO_SLOTS : LEAFY_SLOTS;
  const slot = slots[index];
  const asset = RACK_PLANT_ASSETS[kind];
  const stageScale = kind === "butter" ? .95 : kind === "romaine" ? .87 : kind === "basil" ? .84 : .9;
  const maturityScale = .86 + (maturity / 100) * .14;
  const variation = stageScale * maturityScale * (0.96 + (index % 3) * .025);
  return (
    <span
      className={`${styles.rackPlantSlot} ${kind === "tomato" ? styles.tomatoPlantSlot : styles.leafyPlantSlot}`}
      style={{ left: `${slot.x}%`, top: `${slot.y}%`, "--plant-scale": variation, "--sway-delay": `${(index % 5) * -.37}s` } as CSSProperties}
      aria-hidden="true"
    >
      <span className={`${styles.rackPlantMotion} ${kind === "tomato" ? styles.tomatoPlantMotion : ""}`}>
        <Image className={styles.rackPlantSprite} src={asset.src} alt="" width={asset.width} height={asset.height} />
      </span>
    </span>
  );
}

function GrowthRackScene({ rackId, compact = false }: { rackId: MobileRackId; compact?: boolean }) {
  const rack = RACK_DATA[rackId];
  const isTomato = rack.kind === "tomato";
  const slots = isTomato ? TOMATO_SLOTS : LEAFY_SLOTS;
  return (
    <div className={`${styles.growRackScene} ${compact ? styles.compactRackScene : ""}`} data-crop={rack.kind} role="img" aria-label={`${rack.crop} ${rack.stage}, 성숙도 ${rack.maturity}%인 수직 재배 베드`}>
      <Image
        className={styles.rackBaseImage}
        src={isTomato ? "/assets/app-v2/growth-rack-tomato-empty-v2.png" : "/assets/app-v2/growth-rack-empty-v2.png"}
        alt=""
        width={1536}
        height={1024}
        priority={!compact}
      />
      <div className={styles.rackPlantLayer} aria-hidden="true">
        {slots.map((_, index) => <RackPlant kind={rack.kind} index={index} maturity={rack.maturity} key={`${rackId}-${index}`} />)}
      </div>
    </div>
  );
}

function FloorPlanTomatoBed() {
  return (
    <div className={styles.floorTomatoBed} role="img" aria-label="베드 D 방울토마토 재배 베드">
      <Image src="/assets/app-v2/tomato-bed-topdown-v1.png" alt="" width={1536} height={1024} />
    </div>
  );
}

function MiniRackPlant({ kind }: { kind: CropKind }) {
  const asset = RACK_PLANT_ASSETS[kind];
  return (
    <span className={`${styles.miniRackPlant} ${kind === "tomato" ? styles.miniTomatoPlant : ""}`} aria-hidden="true">
      <Image src={asset.src} alt="" width={asset.width} height={asset.height} />
    </span>
  );
}

function SectionTitle({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return <h2 className={styles.sectionTitle}>{icon && (icon === "sprout" ? <PixelGlyph name="sprout" size={21} /> : icon === "users" ? <PixelGlyph name="users" size={24} /> : <AppIcon name={icon} size={20} />)}{children}</h2>;
}

function StoreCard({ name, harvest, beds, rack, selected, onSelect }: { name: string; harvest: number; beds: number; rack: MobileRackId; selected: boolean; onSelect: () => void }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      className={`${styles.storeCard} ${selected ? styles.selectedStoreCard : ""}`}
      type="button"
      onClick={onSelect}
      layout
      animate={reduceMotion ? undefined : { scale: selected ? 1 : .995 }}
      whileTap={reduceMotion ? undefined : { scale: .985 }}
      transition={{ duration: .2, ease: [0.22, 1, 0.36, 1] }}
      aria-pressed={selected}
    >
      <div className={styles.storeThumbnail}><GrowthRackScene rackId={rack} compact /></div>
      <div className={styles.storeCardCopy}>
        <span className={styles.storeCardHeading}><b>{name}</b>{selected ? <em><AppIcon name="check" size={14} />선택됨</em> : <em className={styles.chooseStore}><i />선택</em>}</span>
        <span className={styles.storeFact}><PixelGlyph name="sprout" size={20} /><small>농장 상태</small><strong>정상</strong></span>
        <span className={styles.storeFact}><CropPixel kind={RACK_DATA[rack].kind} size="tiny" /><small>수확 가능</small><strong>{harvest}포기</strong></span>
        <span className={styles.storeFact}><PixelGlyph name="bed" size={20} /><small>재배 베드</small><strong>{beds}개</strong></span>
      </div>
    </motion.button>
  );
}

export function MobileStoreScreen() {
  const [branch, setBranch] = useSelectedBranch();
  const [addMessage, setAddMessage] = useState("매장 추가");

  useEffect(() => {
    document.body.classList.add("farmfi-growth-dashboard");
    return () => document.body.classList.remove("farmfi-growth-dashboard");
  }, []);

  return (
    <AppShell active="store">
      <header className={styles.storeHero}>
        <PixelGlyph name="store" size={69} />
        <h1>매장 선택</h1>
        <p><i />관리할 매장을 선택해주세요.<i /></p>
      </header>

      <section className={styles.storeListSection}>
        <div className={styles.storeListHeading}>
          <h2><PixelGlyph name="store" size={25} />등록된 매장</h2>
          <button type="button" onClick={() => setAddMessage((current) => current === "매장 추가" ? "준비 중" : "매장 추가")}><AppIcon name="plus" size={22} />{addMessage}</button>
        </div>
        <div className={styles.storeCards}>
          {STORE_DATA.map((store) => (
            <StoreCard {...store} selected={branch === store.name} onSelect={() => setBranch(store.name)} key={store.name} />
          ))}
        </div>
      </section>

      <aside className={styles.storeTip}><PixelGlyph name="bulb" size={23} /><span><b>TIP</b><small>매장을 선택하면 운영, 모니터링, 리포트 정보를 확인할 수 있어요.</small></span></aside>
    </AppShell>
  );
}

export function MobileGrowthScreen({ selectedRack, onSelectRack }: { selectedRack: MobileRackId; onSelectRack: (rack: MobileRackId) => void }) {
  const rack = RACK_DATA[selectedRack];
  const previousRack = useRef(selectedRack);
  const reduceMotion = useReducedMotion();
  const direction = (["A", "B", "C", "D"] as MobileRackId[]).indexOf(selectedRack) >= (["A", "B", "C", "D"] as MobileRackId[]).indexOf(previousRack.current) ? 1 : -1;

  useEffect(() => {
    previousRack.current = selectedRack;
  }, [selectedRack]);

  return (
    <AppShell active="growth">
      <BranchSelect />
      <header className={styles.growthHero}>
        <PixelGlyph name="sprout" size={47} />
        <h1>성장 모니터링</h1>
        <p><i />실시간으로 작물의 성장 상태를 확인하세요.<i /></p>
      </header>

      <section className={styles.growthMetrics} aria-label="생산 현황">
        <article><span><PixelGlyph name="sprout" size={18} />농장 컨디션</span><strong>96<em>%</em></strong></article>
        <article><span><PixelGlyph name="basket" size={18} />오늘 수확 가능</span><strong>38<em>포기</em></strong></article>
        <article><span><PixelGlyph name="bars" size={18} />7월 생산량</span><strong>412<em>/ 500</em></strong></article>
      </section>

      <section className={styles.growthBedSection}>
        <SectionTitle icon="sprout">실시간 성장 베드</SectionTitle>
        <div className={styles.bedTabs} role="tablist" aria-label="성장 베드 선택">
          {(["A", "B", "C", "D"] as MobileRackId[]).map((rackId) => (
            <button className={selectedRack === rackId ? styles.activeBedTab : ""} type="button" role="tab" aria-selected={selectedRack === rackId} onClick={() => onSelectRack(rackId)} key={rackId}>베드 {rackId}</button>
          ))}
        </div>
        <div className={styles.rackTransitionFrame} aria-live="polite">
          <AnimatePresence initial={false} mode="wait" custom={direction}>
            <motion.article
              className={styles.rackCard}
              key={selectedRack}
              custom={direction}
              initial={reduceMotion ? false : { opacity: 0, x: direction * 28, scale: .992 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -20, scale: .992 }}
              transition={{ duration: reduceMotion ? .01 : .22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={styles.rackImage}>
                <GrowthRackScene rackId={selectedRack} />
                <span className={styles.growthStageBadge}>{rack.crop} · {rack.stage} {rack.maturity}%</span>
              </div>
              <div className={styles.rackStatus}>
                <span><AppIcon name="check" size={30} /><small>생육 상태</small><b>{rack.state}</b></span>
                <i />
                <span><AppIcon name="drop" size={30} /><small>습도</small><b>{rack.humidity}%</b></span>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>
      </section>
    </AppShell>
  );
}

export function MobileSalesScreen() {
  return (
    <AppShell active="sales">
      <BranchSelect calendar />
      <h1 className={styles.pageTitle}>판매 데이터 리포트</h1>

      <section className={`${styles.outlineCard} ${styles.salesSummary}`}>
        <SectionTitle>7월 판매 요약</SectionTitle>
        <div>
          <article><small>매출(원)</small><strong>2,450,000</strong></article>
          <article><small>판매량</small><strong>1,280<em>개</em></strong></article>
          <article><small>주문수</small><strong>86<em>건</em></strong></article>
        </div>
      </section>

      <section className={`${styles.outlineCard} ${styles.salesChartCard}`}>
        <SectionTitle>일별 매출</SectionTitle>
        <SalesLineChart />
      </section>

      <section className={`${styles.outlineCard} ${styles.rankingCard}`}>
        <SectionTitle>인기 품목 TOP 4</SectionTitle>
        <div className={styles.rankingRows}>
          {SALES_RANKING.map((item) => <article key={item.name}><CropPixel kind={item.kind} size="small" /><b>{item.name}</b><i><em style={{ width: `${item.value}%` }} /></i><strong>{item.count}개</strong></article>)}
        </div>
      </section>

      <section className={`${styles.outlineCard} ${styles.historyCard}`}>
        <SectionTitle>최근 판매 내역</SectionTitle>
        <div>{SALES_HISTORY.map((row, index) => <article key={`${row[0]}-${row[1]}`}><span>{row[0]}</span><b>{row[1]}</b><span>{row[2]}</span><strong>{row[3]}</strong>{index < SALES_HISTORY.length - 1 && <i />}</article>)}</div>
      </section>
    </AppShell>
  );
}

function SalesLineChart() {
  const width = 320;
  const height = 126;
  const padX = 40;
  const padY = 12;
  const max = 200;
  const points = CHART_VALUES.map((value, index) => {
    const x = padX + (index / (CHART_VALUES.length - 1)) * (width - padX - 8);
    const y = height - padY - (value / max) * (height - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div className={styles.lineChart}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="7월 일별 매출 선 그래프">
        {[0, 50, 100, 150, 200].map((value) => { const y = height - padY - (value / max) * (height - padY * 2); return <g key={value}><line x1={padX} x2={width - 8} y1={y} y2={y} /><text x="2" y={y + 3}>{value === 0 ? "0" : `${value}만`}</text></g>; })}
        <polyline points={points} />
        {points.split(" ").map((point, index) => { const [x, y] = point.split(","); return <circle cx={x} cy={y} r="3" key={index} />; })}
      </svg>
      <div><span>7/1</span><span>7/8</span><span>7/15</span><span>7/22</span><span>7/29</span></div>
    </div>
  );
}

export function MobileInventoryScreen({ selectedCropId, onSelectCrop }: { selectedCropId: string; onSelectCrop: (id: string) => void }) {
  return (
    <AppShell active="inventory">
      <BranchSelect />
      <header className={styles.pageIntro}>
        <h1>재고 · 생육 연동</h1>
        <p>재고와 생육 상태를 함께 확인하세요.</p>
      </header>

      <section className={`${styles.outlineCard} ${styles.stockCard}`}>
        <SectionTitle>매장 재고 현황</SectionTitle>
        <div>
          {STOCK_ROWS.map((item) => (
            <motion.button className={selectedCropId === item.kind ? styles.selectedStock : ""} type="button" onClick={() => onSelectCrop(item.kind)} whileTap={{ scale: .985 }} layout key={item.kind}>
              <CropPixel kind={item.kind} /><span><b>{item.name}</b><i><em style={{ width: `${item.value}%` }} /></i></span><strong>{item.stock}<em>팩</em></strong>
            </motion.button>
          ))}
        </div>
      </section>

      <section className={`${styles.outlineCard} ${styles.linkedCard}`}>
        <SectionTitle>생장 연동 현황</SectionTitle>
        <div className={styles.linkedBeds}>
          {LINKED_BEDS.map((bed) => (
            <motion.button className={selectedCropId === bed.kind ? styles.selectedLinkedBed : ""} type="button" onClick={() => onSelectCrop(bed.kind)} whileTap={{ scale: .99 }} layout key={bed.rack}>
              <span className={styles.bedPreview}><b>베드 {bed.rack}</b><i>{[0, 1, 2, 3].map((index) => <MiniRackPlant kind={bed.kind} key={index} />)}</i><em /></span>
              <span><b>{bed.crop}</b><small>성숙도 <strong>{bed.maturity}%</strong></small></span>
              <span><small>예상 수확</small><b>{bed.harvest}</b></span>
              <span><small>예상 수확량</small><b>{bed.yield}<em>팩</em></b></span>
            </motion.button>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export function MobileAssignmentScreen() {
  const [message, setMessage] = useState("운영자 변경");
  return (
    <AppShell active="assignment">
      <BranchSelect />
      <header className={`${styles.pageIntro} ${styles.assignmentIntro}`}>
        <h1>운영자 배정</h1>
        <p>매장의 운영자를 배정하고 근무 정보를 관리해주세요.</p>
      </header>

      <section className={styles.operatorSection}>
        <SectionTitle icon="users">현재 운영자</SectionTitle>
        <motion.button className={styles.operatorCard} type="button" onClick={() => setMessage("운영자 상세 확인")} whileTap={{ scale: .988 }}>
          <span className={styles.operatorImage}><Image src="/assets/app-v2/operator-portrait-v2.png" alt="초록 모자와 앞치마를 착용한 운영자" width={1254} height={1254} priority /></span>
          <span className={styles.operatorCopy}><span><b>운영자 1</b><em>근무 중</em></span><small><AppIcon name="clock" size={18} />오전 09:00 ~ 오후 06:00</small></span>
          <strong>›</strong>
        </motion.button>
      </section>

      <section className={styles.floorSection}>
        <SectionTitle icon="sprout">매장 공간 구조</SectionTitle>
        <div className={styles.floorPlan}>
          <Image src="/assets/app-v2/store-floor-plan-v1.png" alt="네 개의 재배 베드와 작업대, 채소 판매 코너가 있는 매장 공간도" width={1254} height={1254} priority />
          <FloorPlanTomatoBed />
          <span className={styles.labelA}>베드 A</span><span className={styles.labelB}>베드 B</span><span className={styles.labelC}>베드 C</span><span className={styles.labelD}>베드 D</span>
          <span className={styles.workLabel}>작업대</span><span className={styles.storeLabel}>채소 판매 코너</span>
        </div>
      </section>

      <button className={styles.changeOperatorButton} type="button" onClick={() => setMessage((current) => current === "운영자 변경" ? "운영자 선택 열기" : "운영자 변경")}><AppIcon name="user" size={23} />{message}</button>
    </AppShell>
  );
}
