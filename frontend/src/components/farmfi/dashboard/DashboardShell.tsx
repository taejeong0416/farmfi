"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { ServiceNav } from "@/components/farmfi/operations/FarmOperationsScreens";
import { MobileGrowthScreen } from "@/components/farmfi/operations/MobileFarmApp";
import styles from "./GrowthDashboard.module.css";

interface ProjectDTO {
  id: string;
  name: string;
}

interface IotRecordDTO {
  temperature: number;
  humidity: number;
  co2Level: number;
  lightIntensity: number;
  phLevel: number;
  anomalyScore: number;
  isAnomaly: boolean;
  recordedAt: string;
}

interface DashboardResponse {
  project: ProjectDTO;
  iot: { latest: IotRecordDTO | null; history: IotRecordDTO[] };
}

interface ProjectListItem {
  id: string;
}

type NavId = "overview" | "crops" | "sensors" | "tasks" | "retail" | "recipes";
type RackId = "A" | "B" | "C" | "D";
type TrendMetric = "temperature" | "humidity";

interface TierData {
  id: number;
  code: string;
  crop: string;
  stage: string;
  progress: number;
  plants: number;
  harvest: string;
  note: string;
}

const NAV_ITEMS: Array<{ id: NavId; label: string; code: string; glyph: string }> = [
  { id: "overview", label: "관제실", code: "HOME", glyph: "▦" },
  { id: "crops", label: "생육 맵", code: "GROW", glyph: "♣" },
  { id: "sensors", label: "환경 기록", code: "SENS", glyph: "⌁" },
  { id: "tasks", label: "오늘 할 일", code: "QUEST", glyph: "✓" },
  { id: "retail", label: "재고 연동", code: "STORE", glyph: "▤" },
  { id: "recipes", label: "생육 레시피", code: "RECIPE", glyph: "✦" },
];

const RACKS: Record<
  RackId,
  { label: string; crop: string; health: number; ready: number; plants: number; note: string; tone: string }
> = {
  A: {
    label: "베드 A",
    crop: "버터헤드",
    health: 98,
    ready: 18,
    plants: 64,
    note: "레시피 일치 96%",
    tone: "NORMAL",
  },
  B: {
    label: "베드 B",
    crop: "로메인",
    health: 94,
    ready: 12,
    plants: 58,
    note: "수확 예상 D-4",
    tone: "NORMAL",
  },
  C: {
    label: "베드 C",
    crop: "바질",
    health: 87,
    ready: 8,
    plants: 42,
    note: "습도 추세 확인 필요",
    tone: "CHECK",
  },
  D: {
    label: "베드 D",
    crop: "방울토마토",
    health: 91,
    ready: 6,
    plants: 20,
    note: "착과 레시피 일치 93%",
    tone: "NORMAL",
  },
};

const RACK_ORDER: RackId[] = ["A", "B", "C", "D"];

const RACK_TIERS: Record<RackId, TierData[]> = {
  A: [
    { id: 3, code: "BED 03", crop: "버터헤드", stage: "육묘기", progress: 28, plants: 12, harvest: "07.31", note: "뿌리 활착이 안정적으로 진행 중이에요." },
    { id: 2, code: "BED 02", crop: "버터헤드", stage: "비대기", progress: 68, plants: 20, harvest: "07.22", note: "최근 24시간 생장 속도가 목표보다 3% 빨라요." },
    { id: 1, code: "BED 01", crop: "버터헤드", stage: "수확기", progress: 92, plants: 18, harvest: "07.18", note: "오늘부터 순차 수확 가능한 상태예요." },
  ],
  B: [
    { id: 3, code: "BED 03", crop: "로메인", stage: "육묘기", progress: 24, plants: 14, harvest: "08.02", note: "새 잎이 고르게 전개되고 있어요." },
    { id: 2, code: "BED 02", crop: "로메인", stage: "신장기", progress: 61, plants: 18, harvest: "07.25", note: "엽장이 목표 범위 안에서 안정적으로 늘고 있어요." },
    { id: 1, code: "BED 01", crop: "로메인", stage: "수확 전", progress: 84, plants: 12, harvest: "07.20", note: "하단 잎 상태가 좋아 이틀 뒤 수확을 추천해요." },
  ],
  C: [
    { id: 3, code: "BED 03", crop: "바질", stage: "정식기", progress: 35, plants: 16, harvest: "07.28", note: "정식 후 새 뿌리가 빠르게 자리 잡고 있어요." },
    { id: 2, code: "BED 02", crop: "바질", stage: "분지기", progress: 72, plants: 14, harvest: "07.20", note: "곁순이 늘어 향과 엽량이 함께 올라가고 있어요." },
    { id: 1, code: "BED 01", crop: "바질", stage: "수확기", progress: 88, plants: 8, harvest: "07.18", note: "윗잎부터 순차 수확하면 재생장이 빨라요." },
  ],
  D: [
    { id: 3, code: "BAY 03", crop: "방울토마토", stage: "정식기", progress: 31, plants: 2, harvest: "08.18", note: "유인끈 활착과 첫 마디 생장이 안정적이에요." },
    { id: 2, code: "BAY 02", crop: "방울토마토", stage: "개화기", progress: 58, plants: 2, harvest: "08.05", note: "꽃송이 개화율이 86%로 목표보다 좋아요." },
    { id: 1, code: "BAY 01", crop: "방울토마토", stage: "착과기", progress: 76, plants: 2, harvest: "07.30", note: "첫 화방에서 초록·주황·적색 과실이 함께 익는 중이에요." },
  ],
};

const INITIAL_TASKS = [
  {
    id: "harvest",
    tag: "수확 추천",
    title: "베드 A · 수확구역 18포기",
    detail: "성숙도 92% · 예상 작업 24분",
    reward: "+120 XP",
    tone: "lime",
  },
  {
    id: "restock",
    tag: "재고 보충",
    title: "버터헤드 12팩 진열",
    detail: "매장 재고 6팩 · 판매 속도 빠름",
    reward: "+80 XP",
    tone: "cyan",
  },
  {
    id: "observe",
    tag: "환경 확인",
    title: "베드 C 습도 추세 보기",
    detail: "목표 범위 하단에 38분 머무는 중",
    reward: "+40 XP",
    tone: "amber",
  },
];

const FALLBACK_IOT: IotRecordDTO = {
  temperature: 22.8,
  humidity: 74,
  co2Level: 827,
  lightIntensity: 12650,
  phLevel: 6.1,
  anomalyScore: 0.18,
  isAnomaly: false,
  recordedAt: "",
};

const FALLBACK_TRENDS: Record<TrendMetric, number[]> = {
  temperature: [22.1, 22.3, 22.2, 22.6, 22.8, 22.7, 22.9, 23.1, 22.9, 22.8, 22.7, 22.8],
  humidity: [72, 73, 74, 73, 75, 76, 75, 74, 74, 73, 74, 74],
};

const GROWTH_STAGES = [
  { name: "발아", day: "DAY 01—03", note: "떡잎 전개" },
  { name: "본엽", day: "DAY 04—07", note: "뿌리 활착" },
  { name: "초기 생장", day: "DAY 08—12", note: "잎 수 증가" },
  { name: "로제트", day: "DAY 13—18", note: "엽폭 확장" },
  { name: "비대기", day: "DAY 19—24", note: "결구 진행" },
  { name: "수확 가능", day: "DAY 25—28", note: "상품 크기" },
];

const TOMATO_GROWTH_STAGES = [
  { name: "정식기", day: "DAY 01—14", note: "유인끈 활착" },
  { name: "개화기", day: "DAY 15—35", note: "꽃송이 전개" },
  { name: "착과·수확", day: "DAY 36—70", note: "과실 색 전환" },
];

const ANIMATED_RACK_CROPS = [
  { id: "lt-1", x: 20.31, y: 37.89, width: 7.2, stage: 0, delay: -0.2 },
  { id: "lt-2", x: 25.59, y: 37.89, width: 7.4, stage: 0, delay: -1.8 },
  { id: "lt-3", x: 30.60, y: 37.89, width: 7.7, stage: 1, delay: -0.9 },
  { id: "lt-4", x: 35.61, y: 37.89, width: 7.8, stage: 1, delay: -2.6 },
  { id: "lt-5", x: 40.76, y: 37.89, width: 8.0, stage: 1, delay: -1.3 },
  { id: "rt-1", x: 58.40, y: 37.89, width: 7.2, stage: 0, delay: -2.1 },
  { id: "rt-2", x: 63.61, y: 37.89, width: 7.5, stage: 0, delay: -0.6 },
  { id: "rt-3", x: 68.75, y: 37.89, width: 7.7, stage: 1, delay: -2.9 },
  { id: "rt-4", x: 73.96, y: 37.89, width: 7.9, stage: 1, delay: -1.4 },
  { id: "rt-5", x: 79.17, y: 37.89, width: 8.0, stage: 1, delay: -0.1 },
  { id: "lm-1", x: 22.20, y: 55.76, width: 11.4, stage: 2, delay: -1.6 },
  { id: "lm-2", x: 31.64, y: 55.76, width: 11.8, stage: 2, delay: -0.4 },
  { id: "lm-3", x: 40.43, y: 55.76, width: 12.2, stage: 3, delay: -2.4 },
  { id: "rm-1", x: 59.18, y: 55.76, width: 11.4, stage: 2, delay: -0.8 },
  { id: "rm-2", x: 68.36, y: 55.76, width: 11.9, stage: 3, delay: -2.7 },
  { id: "rm-3", x: 77.47, y: 55.76, width: 12.1, stage: 3, delay: -1.2 },
  { id: "lb-1", x: 22.72, y: 72.66, width: 16.4, stage: 4, delay: -2.2 },
  { id: "lb-2", x: 36.98, y: 72.66, width: 17.0, stage: 5, delay: -0.7 },
  { id: "rb-1", x: 61.65, y: 72.66, width: 16.4, stage: 4, delay: -1.1 },
  { id: "rb-2", x: 76.69, y: 72.66, width: 17.0, stage: 5, delay: -2.8 },
];

const CROP_FRAME_POSITIONS = [-2.6, 13.3, 32.2, 52.6, 74.6, 97.2];

const RACK_CROP_LAYOUTS: Record<"A" | "B" | "C", typeof ANIMATED_RACK_CROPS> = {
  A: ANIMATED_RACK_CROPS,
  B: ANIMATED_RACK_CROPS.map((crop, index) => ({
    ...crop,
    id: `b-${crop.id}`,
    stage: index < 10 ? 1 : index < 16 ? 3 : 4,
  })),
  C: ANIMATED_RACK_CROPS.map((crop, index) => ({
    ...crop,
    id: `c-${crop.id}`,
    stage: index < 10 ? 1 : index < 16 ? 2 : 3,
  })),
};

const TOMATO_RACK_CROPS = [
  { id: "dt-1", x: 21.55, y: 75.59, width: 11.0, stage: 0, delay: -0.4 },
  { id: "dt-2", x: 30.01, y: 75.59, width: 11.0, stage: 0, delay: -2.1 },
  { id: "dm-1", x: 45.70, y: 75.59, width: 15.5, stage: 1, delay: -1.7 },
  { id: "dm-2", x: 54.17, y: 75.59, width: 15.5, stage: 1, delay: -0.3 },
  { id: "db-1", x: 69.79, y: 75.59, width: 17.0, stage: 2, delay: -0.8 },
  { id: "db-2", x: 77.99, y: 75.59, width: 17.0, stage: 2, delay: -2.4 },
];

const TOMATO_FRAME_POSITIONS = [1.2, 46.7, 94.8];
const TOMATO_BAY_CENTERS = [25.78, 49.94, 73.89];

const INVENTORY_ROWS = [
  { crop: "버터헤드", icon: "♣", growing: 30, ready: 18, stock: 6, sold: 21, status: "보충 추천", tone: "urgent" },
  { crop: "로메인", icon: "♠", growing: 26, ready: 12, stock: 15, sold: 14, status: "균형", tone: "good" },
  { crop: "바질", icon: "♧", growing: 22, ready: 8, stock: 11, sold: 8, status: "충분", tone: "good" },
  { crop: "방울토마토", icon: "●", growing: 20, ready: 6, stock: 9, sold: 12, status: "관찰", tone: "good" },
];

async function fetchProjects(): Promise<ProjectListItem[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("프로젝트 목록을 불러오지 못했습니다");
  const json = await res.json();
  return json.projects ?? [];
}

async function fetchDashboard(projectId: string): Promise<DashboardResponse> {
  const res = await fetch(`/api/dashboard/${projectId}`);
  if (!res.ok) throw new Error("대시보드 데이터를 불러오지 못했습니다");
  return res.json();
}

function formatTime(iso: string): string {
  if (!iso) return "DEMO FEED";
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function chartPoints(values: number[], width = 720, height = 176, padding = 14): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function rangeStatus(value: number, min: number, max: number): "good" | "check" {
  return value >= min && value <= max ? "good" : "check";
}

function scrollToSection(id: NavId) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function DashboardShell({
  operator = false,
  projectId,
}: {
  operator?: boolean;
  projectId?: string;
}) {
  const [activeNav, setActiveNav] = useState<NavId>("overview");
  const [selectedRack, setSelectedRack] = useState<RackId>("A");
  const [selectedTier, setSelectedTier] = useState(1);
  const [previewStage, setPreviewStage] = useState<number | null>(null);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("temperature");
  const [demoTick, setDemoTick] = useState(0);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [branch, setBranch] = useState("busan-01");
  const [showAlerts, setShowAlerts] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("farmfi-growth-dashboard");
    return () => document.body.classList.remove("farmfi-growth-dashboard");
  }, []);

  useEffect(() => {
    const requestedRack = new URLSearchParams(window.location.search).get("bed")?.toUpperCase() as RackId | undefined;
    if (requestedRack && RACK_ORDER.includes(requestedRack)) {
      setSelectedRack(requestedRack);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setDemoTick((tick) => tick + 1), 2_000);
    return () => window.clearInterval(timer);
  }, []);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
    enabled: !projectId,
    retry: 1,
  });

  const resolvedProjectId = projectId ?? projectsQuery.data?.[0]?.id;
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", resolvedProjectId],
    queryFn: () => fetchDashboard(resolvedProjectId as string),
    enabled: Boolean(resolvedProjectId),
    refetchInterval: 15_000,
    retry: 1,
  });

  const data = dashboardQuery.data;
  const demoLatest = useMemo<IotRecordDTO>(() => ({
    ...FALLBACK_IOT,
    temperature: Number((22.8 + Math.sin(demoTick * 0.72) * 0.4).toFixed(1)),
    humidity: Math.round(74 + Math.sin(demoTick * 0.48 + 1.2) * 2),
    co2Level: Math.round(827 + Math.sin(demoTick * 0.37 + 2.1) * 38),
    lightIntensity: Math.round(12_650 + Math.sin(demoTick * 0.31) * 260),
    phLevel: Number((6.1 + Math.sin(demoTick * 0.22 + 0.8) * 0.08).toFixed(1)),
  }), [demoTick]);
  const latest = data?.iot.latest ?? demoLatest;
  const currentRack = RACKS[selectedRack];
  const currentTiers = RACK_TIERS[selectedRack];
  const currentTier = currentTiers.find((tier) => tier.id === selectedTier) ?? currentTiers[2];
  const currentGrowthStages = selectedRack === "D" ? TOMATO_GROWTH_STAGES : GROWTH_STAGES;
  const matchedStageIndex = Math.min(
    currentGrowthStages.length - 1,
    Math.max(0, Math.round((currentTier.progress / 100) * (currentGrowthStages.length - 1))),
  );
  const activeStageIndex = previewStage ?? matchedStageIndex;
  const activeGrowthStage = currentGrowthStages[activeStageIndex];
  const selectedRackIndex = RACK_ORDER.indexOf(selectedRack);
  const isDemo = !data;
  const activeLabel = NAV_ITEMS.find((item) => item.id === activeNav)?.label ?? "관제실";

  const trendValues = useMemo(() => {
    const history = data?.iot.history ?? [];
    if (history.length === 0) {
      const amplitude = trendMetric === "temperature" ? 0.09 : 0.38;
      return FALLBACK_TRENDS[trendMetric].map((value, index) =>
        Number((value + Math.sin((index + demoTick * 0.75) * 0.82) * amplitude).toFixed(2)),
      );
    }
    return [...history]
      .reverse()
      .slice(-18)
      .map((reading) => reading[trendMetric]);
  }, [data?.iot.history, demoTick, trendMetric]);

  const sensors = [
    {
      code: "TEMP",
      label: "온도",
      value: latest.temperature.toFixed(1),
      unit: "°C",
      target: "20—24°C",
      status: rangeStatus(latest.temperature, 20, 24),
      glyph: "T°",
      spark: [54, 60, 58, 66, 72, 68, 73, 70],
    },
    {
      code: "HUM",
      label: "습도",
      value: latest.humidity.toFixed(0),
      unit: "%",
      target: "65—78%",
      status: rangeStatus(latest.humidity, 65, 78),
      glyph: "H₂O",
      spark: [60, 64, 72, 68, 75, 74, 70, 74],
    },
    {
      code: "CO2",
      label: "이산화탄소",
      value: latest.co2Level.toFixed(0),
      unit: "ppm",
      target: "700—1,100",
      status: rangeStatus(latest.co2Level, 700, 1100),
      glyph: "CO₂",
      spark: [42, 48, 64, 58, 72, 68, 66, 70],
    },
    {
      code: "LUX",
      label: "광량",
      value: `${(latest.lightIntensity / 1000).toFixed(1)}k`,
      unit: "lux",
      target: "10k—15k",
      status: rangeStatus(latest.lightIntensity, 10_000, 15_000),
      glyph: "LUX",
      spark: [70, 72, 70, 73, 72, 71, 72, 72],
    },
    {
      code: "PH",
      label: "양액 pH",
      value: latest.phLevel.toFixed(1),
      unit: "pH",
      target: "5.8—6.4",
      status: rangeStatus(latest.phLevel, 5.8, 6.4),
      glyph: "pH",
      spark: [64, 62, 65, 64, 66, 65, 64, 65],
    },
    {
      code: "EC",
      label: "양액 EC",
      value: "1.7",
      unit: "mS/cm",
      target: "1.4—1.9",
      status: "good" as const,
      glyph: "EC",
      spark: [56, 58, 62, 64, 62, 65, 66, 64],
    },
  ];

  const taskProgress = Math.round((completedTaskIds.length / INITIAL_TASKS.length) * 100);
  const trendMin = Math.min(...trendValues);
  const trendMax = Math.max(...trendValues);
  const trendUnit = trendMetric === "temperature" ? "°C" : "%";
  const points = chartPoints(trendValues);

  const toggleTask = (taskId: string) => {
    setCompletedTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  };

  const handleNav = (id: NavId) => {
    setActiveNav(id);
    scrollToSection(id);
  };

  const selectRack = (rackId: RackId) => {
    setSelectedRack(rackId);
    setPreviewStage(null);
    const url = new URL(window.location.href);
    url.searchParams.set("bed", rackId);
    window.history.replaceState({}, "", url);
  };

  const moveRack = (direction: -1 | 1) => {
    const nextIndex = Math.min(RACK_ORDER.length - 1, Math.max(0, selectedRackIndex + direction));
    selectRack(RACK_ORDER[nextIndex]);
  };

  return (
    <>
    <MobileGrowthScreen selectedRack={selectedRack} onSelectRack={selectRack} />
    <main className={`${styles.page} ${styles.desktopOnly}`}>
      <div className={styles.skyGlow} aria-hidden="true" />
      <div className={styles.dashboardShell}>
        <aside className={styles.sidebar} aria-label="생장 모니터링 메뉴">
          <div className={styles.sideBrand}>
            <span className={styles.pixelSprout} aria-hidden="true">
              <i />
              <b />
            </span>
            <div>
              <strong>FARMFI</strong>
              <small>GROWTH OS</small>
            </div>
          </div>

          <nav className={styles.sideNav}>
            {NAV_ITEMS.map((item) => (
              <button
                className={activeNav === item.id ? styles.activeNav : ""}
                type="button"
                key={item.id}
                onClick={() => handleNav(item.id)}
                aria-current={activeNav === item.id ? "page" : undefined}
              >
                <span className={styles.navGlyph}>{item.glyph}</span>
                <span className={styles.navCopy}>
                  <b>{item.label}</b>
                  <small>{item.code}</small>
                </span>
                <span className={styles.navArrow}>›</span>
              </button>
            ))}
          </nav>

          <div className={styles.sideStatus}>
            <span className={styles.botAvatar}>F</span>
            <div>
              <small>FARM MATE</small>
              <b>모든 시스템 연결</b>
            </div>
            <i className={styles.liveDot} />
          </div>
          <Link className={styles.backLink} href="/">
            ← FARMFI 홈
          </Link>
        </aside>

        <section className={styles.content}>
          <header className={styles.topbar}>
            <div className={styles.breadcrumb}>
              <span>FARMFI</span>
              <i>/</i>
              <strong>{activeLabel}</strong>
            </div>
            <div className={styles.topActions}>
              <label className={styles.branchSelect}>
                <span>지점</span>
                <select value={branch} onChange={(event) => setBranch(event.target.value)}>
                  <option value="busan-01">부산대 1호점</option>
                  <option value="yeonsan-02">연산 2호점</option>
                  <option value="suyeong-03">수영 3호점</option>
                </select>
              </label>
              <span className={`${styles.syncBadge} ${isDemo ? styles.demoBadge : ""}`}>
                <i /> {isDemo ? "DEMO LIVE" : "LIVE SYNC"}
              </span>
              <div className={styles.alertWrap}>
                <button
                  className={styles.iconButton}
                  type="button"
                  aria-label="알림 보기"
                  aria-expanded={showAlerts}
                  onClick={() => setShowAlerts((value) => !value)}
                >
                  !<span>1</span>
                </button>
                {showAlerts && (
                  <div className={styles.alertPopover}>
                    <div>
                      <span className={styles.amberDot} />
                      <b>베드 C 습도 추세 확인</b>
                    </div>
                    <p>목표 범위 하단에 머물고 있어요. 설비 제어 앱에서 상태를 함께 확인해 주세요.</p>
                    <button type="button" onClick={() => handleNav("sensors")}>환경 기록 열기 →</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <ServiceNav active="growth" />

          {notice && (
            <div className={styles.notice} role="status">
              <span>✓</span> {notice}
              <button type="button" onClick={() => setNotice(null)} aria-label="안내 닫기">×</button>
            </div>
          )}

          <section className={styles.heroHeader} id="overview">
            <div>
              <span className={styles.kicker}>
                GROWTH MONITORING · {isDemo ? `SIM T+${String(demoTick * 2).padStart(2, "0")}s` : formatTime(latest.recordedAt)}
              </span>
              <h1>{operator ? "나의 생장 관제실" : "생장 관제실"}</h1>
              <p>도심 유휴공간에서 자라는 작물과 환경 흐름을 한눈에 살펴보세요.</p>
            </div>
            <button
              className={styles.reportButton}
              type="button"
              onClick={() => setNotice("7월 생육 리포트가 미리보기 상태로 준비됐어요.")}
            >
              <span>▤</span> 7월 리포트 보기
            </button>
          </section>

          <section className={styles.summaryGrid} aria-label="농장 요약">
            <SummaryCard
              index="01"
              label="농장 컨디션"
              value="96"
              unit="%"
              detail="어제보다 +2%"
              tone="lime"
              meter={96}
            />
            <SummaryCard
              index="02"
              label="오늘 수확 가능"
              value="38"
              unit="포기"
              detail="4개 베드 합계"
              tone="cyan"
              meter={76}
            />
            <SummaryCard
              index="03"
              label="매장 재고"
              value="74"
              unit="%"
              detail="보충 추천 1품목"
              tone="amber"
              meter={74}
            />
            <SummaryCard
              index="04"
              label="7월 생산량"
              value="412"
              unit="/ 500"
              detail="월 목표의 82%"
              tone="mint"
              meter={82}
            />
          </section>

          <section className={styles.commandGrid} id="crops">
            <article className={`${styles.pixelPanel} ${styles.rackPanel}`}>
              <PanelHeader
                eyebrow="LIVE GROW BED"
                title="실시간 생장 베드"
                right={<span className={styles.normalBadge}><i /> 전체 정상</span>}
              />

              <div className={styles.rackTabs} role="tablist" aria-label="재배 베드 선택">
                {RACK_ORDER.map((rackId) => (
                  <button
                    key={rackId}
                    type="button"
                    role="tab"
                    aria-selected={selectedRack === rackId}
                    className={selectedRack === rackId ? styles.selectedRack : ""}
                    onClick={() => selectRack(rackId)}
                  >
                    <span>{RACKS[rackId].label}</span>
                    <small>{RACKS[rackId].crop}</small>
                    {RACKS[rackId].tone === "CHECK" && <i />}
                  </button>
                ))}
              </div>

              <div className={styles.rackViewport}>
                <div className={styles.pixelGrid} aria-hidden="true" />
                <div className={styles.scanLine} aria-hidden="true" />
                <span className={styles.viewportCode}>URBAN FARM VIEW · {currentRack.label}</span>
                <span className={styles.viewportLive}><i /> 센서 연결</span>
                <div
                  className={styles.rackSceneTrack}
                  style={{ transform: `translateX(-${selectedRackIndex * 25}%)` }}
                >
                  {RACK_ORDER.map((rackId) => {
                    const sceneRack = RACKS[rackId];
                    return (
                      <div
                        className={`${styles.rackScene} ${styles[`rackScene${rackId}`]}`}
                        aria-hidden={selectedRack !== rackId}
                        key={rackId}
                      >
                        <div className={styles.rackSceneCanvas}>
                          <Image
                            className={styles.rackImage}
                            src={rackId === "D" ? "/assets/pixel/urban-tomato-trellis-empty-v1.png" : "/assets/pixel/urban-growth-racks-empty-v1.png"}
                            alt={rackId === "D"
                              ? "도심 유휴공간 방울토마토 전용 수직 유인 베드 픽셀 아트"
                              : `${sceneRack.label} ${sceneRack.crop} 도심 유휴공간 다단 엽채류 베드 픽셀 아트`}
                            width={1536}
                            height={1024}
                            priority={rackId === "A"}
                          />
                          {rackId === "D" ? (
                            <span className={styles.tomatoCropLayer} aria-hidden="true">
                              {TOMATO_RACK_CROPS.map((crop) => (
                                <i
                                  className={styles.tomatoPlant}
                                  key={crop.id}
                                  style={{
                                    "--tomato-x": `${crop.x}%`,
                                    "--tomato-y": `${crop.y}%`,
                                    "--tomato-width": `${crop.width}%`,
                                    "--tomato-frame": `${TOMATO_FRAME_POSITIONS[crop.stage]}%`,
                                    "--tomato-delay": `${crop.delay}s`,
                                  } as CSSProperties}
                                />
                              ))}
                            </span>
                          ) : (
                            <span className={styles.animatedCropLayer} aria-hidden="true">
                              {RACK_CROP_LAYOUTS[rackId].map((crop) => (
                                <i
                                  className={styles.swayPlant}
                                  key={crop.id}
                                  style={{
                                    "--crop-x": `${crop.x}%`,
                                    "--crop-y": `${crop.y}%`,
                                    "--crop-width": `${crop.width}%`,
                                    "--crop-frame": `${CROP_FRAME_POSITIONS[crop.stage]}%`,
                                    "--crop-delay": `${crop.delay}s`,
                                  } as CSSProperties}
                                />
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <span className={styles.liveParticles} aria-hidden="true">
                  <i /><i /><i /><i /><i />
                </span>
                {selectedRack === "D"
                  ? currentTiers.map((tier, index) => (
                    <button
                      className={`${styles.tomatoBayMarker} ${selectedTier === tier.id ? styles.selectedTomatoBay : ""}`}
                      style={{ left: `${TOMATO_BAY_CENTERS[index]}%` }}
                      type="button"
                      key={tier.id}
                      onClick={() => {
                        setSelectedTier(tier.id);
                        setPreviewStage(null);
                      }}
                    >
                      <span>{tier.code}</span>
                      <b>{tier.progress}%</b>
                    </button>
                  ))
                  : currentTiers.map((tier, index) => (
                    <button
                      className={`${styles.tierMarker} ${selectedTier === tier.id ? styles.selectedTierMarker : ""}`}
                      style={{ top: `${24 + index * 25}%` }}
                      type="button"
                      key={tier.id}
                      onClick={() => {
                        setSelectedTier(tier.id);
                        setPreviewStage(null);
                      }}
                    >
                      <span>{tier.code}</span>
                      <b>{tier.progress}%</b>
                    </button>
                  ))}
                <div className={styles.rackPager} aria-label="재배 베드 이동">
                  <button
                    type="button"
                    disabled={selectedRackIndex === 0}
                    onClick={() => moveRack(-1)}
                    aria-label="이전 재배 베드"
                  >‹</button>
                  <span>{String(selectedRackIndex + 1).padStart(2, "0")} / 04</span>
                  <button
                    type="button"
                    disabled={selectedRackIndex === RACK_ORDER.length - 1}
                    onClick={() => moveRack(1)}
                    aria-label="다음 재배 베드"
                  >›</button>
                </div>
              </div>

              <div className={styles.rackHud}>
                <div>
                  <small>선택 베드</small>
                  <b>{currentRack.label} · {currentTier.code}</b>
                </div>
                <div>
                  <small>작물 / 단계</small>
                  <b>{currentTier.crop} · {currentTier.stage}</b>
                </div>
                <div>
                  <small>식재 수량</small>
                  <b>{currentTier.plants}포기</b>
                </div>
                <div>
                  <small>수확 예상</small>
                  <b>{currentTier.harvest}</b>
                </div>
                <div className={styles.hudProgress}>
                  <span><small>성숙도</small><b>{currentTier.progress}%</b></span>
                  <Progress value={currentTier.progress} tone="lime" />
                </div>
              </div>
              <p className={styles.rackInsight}><span>F</span> {currentTier.note}</p>
            </article>

            <article className={`${styles.pixelPanel} ${styles.questPanel}`} id="tasks">
              <PanelHeader
                eyebrow="TODAY'S QUEST"
                title="오늘 할 일"
                right={<span className={styles.questCount}>{completedTaskIds.length}/{INITIAL_TASKS.length}</span>}
              />
              <div className={styles.questProgress}>
                <div>
                  <span>오늘의 진행률</span>
                  <b>{taskProgress}%</b>
                </div>
                <Progress value={taskProgress} tone="lime" />
              </div>

              <div className={styles.taskList}>
                {INITIAL_TASKS.map((task) => {
                  const done = completedTaskIds.includes(task.id);
                  return (
                    <button
                      className={`${styles.taskCard} ${styles[task.tone]} ${done ? styles.taskDone : ""}`}
                      type="button"
                      key={task.id}
                      aria-pressed={done}
                      onClick={() => toggleTask(task.id)}
                    >
                      <span className={styles.taskCheck}>{done ? "✓" : ""}</span>
                      <span className={styles.taskCopy}>
                        <small>{task.tag}</small>
                        <b>{task.title}</b>
                        <em>{task.detail}</em>
                      </span>
                      <span className={styles.taskReward}>{done ? "DONE" : task.reward}</span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.inventoryHint}>
                <div className={styles.miniStore} aria-hidden="true"><i /><b>24H</b></div>
                <div>
                  <small>재고 × 생육 연동</small>
                  <b>버터헤드 12팩 보충 추천</b>
                  <p>현재 수확 가능 18포기 · 매장 재고 6팩</p>
                </div>
              </div>
              <button className={styles.textButton} type="button" onClick={() => handleNav("retail")}>
                재고 흐름 자세히 보기 <span>→</span>
              </button>
            </article>
          </section>

          <section className={`${styles.pixelPanel} ${styles.growthStagePanel}`} aria-label="생장 단계 픽셀 스캔">
            <PanelHeader
              eyebrow="GROWTH JOURNAL"
              title="작물 생장 일지"
              right={
                <span className={styles.stageCurrentBadge}>
                  {previewStage === null ? "현재 단계" : "단계 비교"} · {activeGrowthStage.name}
                </span>
              }
            />
            <div className={styles.growthStageBody}>
              <div className={styles.stageArt}>
                <div className={styles.stageArtGrid} aria-hidden="true" />
                <Image
                  className={`${styles.stageImage} ${selectedRack === "D" ? styles.tomatoStageImage : ""}`}
                  src={selectedRack === "D" ? "/assets/pixel/tomato-growth-stages-v1.png" : "/assets/pixel/growth-stages-v1.png"}
                  alt={selectedRack === "D" ? "방울토마토의 정식기, 개화기, 착과 수확기 픽셀 스프라이트" : "잎채소의 발아부터 수확 가능까지 여섯 단계 픽셀 스프라이트"}
                  width={selectedRack === "D" ? 1920 : 1983}
                  height={selectedRack === "D" ? 819 : 793}
                />
                <div
                  className={styles.stageHitGrid}
                  style={{ gridTemplateColumns: `repeat(${currentGrowthStages.length}, 1fr)` }}
                >
                  {currentGrowthStages.map((stage, index) => (
                    <button
                      type="button"
                      key={stage.name}
                      className={activeStageIndex === index ? styles.activeStageCell : ""}
                      onClick={() => setPreviewStage(index === matchedStageIndex ? null : index)}
                      aria-label={`${stage.name} 단계 미리보기`}
                      aria-pressed={activeStageIndex === index}
                    />
                  ))}
                </div>
                <span
                  className={styles.stagePointer}
                  style={{ left: `${(activeStageIndex + 0.5) * (100 / currentGrowthStages.length)}%` }}
                >
                  {previewStage === null ? "현재" : "비교"}
                </span>
              </div>
              <div
                className={styles.stageLabels}
                style={{ gridTemplateColumns: `repeat(${currentGrowthStages.length}, 1fr)` }}
              >
                {currentGrowthStages.map((stage, index) => (
                  <button
                    type="button"
                    key={stage.name}
                    className={activeStageIndex === index ? styles.activeStageLabel : ""}
                    onClick={() => setPreviewStage(index === matchedStageIndex ? null : index)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b>{stage.name}</b>
                    <small>{stage.day}</small>
                  </button>
                ))}
              </div>
              <div className={styles.stageReadout}>
                <div><small>모니터링 구역</small><b>{currentRack.label} · {currentTier.code}</b></div>
                <div><small>실제 성숙도</small><b>{currentTier.progress}%</b></div>
                <div><small>선택 단계</small><b>{activeGrowthStage.day}</b></div>
                <div><small>관찰 포인트</small><b>{activeGrowthStage.note}</b></div>
                <p><span>F</span>{previewStage === null ? currentTier.note : "단계 셀을 눌러 크기와 형태를 비교 중이에요. 현재 단계를 다시 누르면 실제 작물 상태로 돌아갑니다."}</p>
              </div>
            </div>
          </section>

          <section className={styles.sectionBlock} id="sensors">
            <SectionHeading
              code="ENVIRONMENT LOG"
              title="실시간 환경 기록"
              description="설비 센서에서 수집한 값을 작물 레시피 범위와 비교합니다."
              meta={isDemo ? "샘플 센서 데이터" : `마지막 동기화 ${formatTime(latest.recordedAt)}`}
            />
            <div className={styles.sensorGrid}>
              {sensors.map((sensor) => <SensorCard key={sensor.code} {...sensor} />)}
            </div>
          </section>

          <section className={styles.analyticsGrid}>
            <article className={`${styles.pixelPanel} ${styles.trendPanel}`}>
              <PanelHeader
                eyebrow="24H TREND"
                title="환경 변화 추이"
                right={
                  <div className={styles.metricTabs}>
                    <button
                      type="button"
                      className={trendMetric === "temperature" ? styles.activeMetric : ""}
                      onClick={() => setTrendMetric("temperature")}
                    >온도</button>
                    <button
                      type="button"
                      className={trendMetric === "humidity" ? styles.activeMetric : ""}
                      onClick={() => setTrendMetric("humidity")}
                    >습도</button>
                  </div>
                }
              />
              <div className={styles.trendSummary}>
                <div>
                  <small>현재</small>
                  <b>{trendValues.at(-1)?.toFixed(1)}{trendUnit}</b>
                </div>
                <span>24시간 범위 {trendMin.toFixed(1)}—{trendMax.toFixed(1)}{trendUnit}</span>
              </div>
              <div className={styles.chartWrap}>
                <span className={styles.chartMax}>{trendMax.toFixed(1)}</span>
                <span className={styles.chartMin}>{trendMin.toFixed(1)}</span>
                <svg viewBox="0 0 720 176" role="img" aria-label={`${trendMetric === "temperature" ? "온도" : "습도"} 24시간 추이 그래프`}>
                  <defs>
                    <linearGradient id="pixelChartArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6f9f45" stopOpacity="0.34" />
                      <stop offset="100%" stopColor="#6f9f45" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[28, 68, 108, 148].map((y) => <line key={y} x1="14" x2="706" y1={y} y2={y} />)}
                  <polygon points={`14,176 ${points} 706,176`} fill="url(#pixelChartArea)" />
                  <polyline points={points} />
                  {points.split(" ").map((point, index) => {
                    const [cx, cy] = point.split(",");
                    return <rect key={`${cx}-${index}`} x={Number(cx) - 3} y={Number(cy) - 3} width="6" height="6" />;
                  })}
                </svg>
                <div className={styles.chartTimes}><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>NOW</span></div>
              </div>
            </article>

            <article className={`${styles.pixelPanel} ${styles.recipePanel}`} id="recipes">
              <PanelHeader eyebrow="GROWTH RECIPE" title="레시피 매칭" right={<span className={styles.matchScore}>96%</span>} />
              <div className={styles.recipeCrop}>
                <span className={styles.cropPixel}>♣</span>
                <div><small>선택 작물</small><b>{currentTier.crop}</b><p>{currentRack.label} · {currentTier.code}</p></div>
              </div>
              <RecipeRow label="온도" current={`${latest.temperature.toFixed(1)}°C`} target="20—24°C" value={88} />
              <RecipeRow label="습도" current={`${latest.humidity.toFixed(0)}%`} target="65—78%" value={92} />
              <RecipeRow label="pH" current={latest.phLevel.toFixed(1)} target="5.8—6.4" value={96} />
              <RecipeRow label="광주기" current="14h" target="14—16h" value={90} />
              <p className={styles.recipeInsight}><span>✦</span> 현재 환경이 버터헤드 표준 레시피와 잘 맞아요.</p>
            </article>
          </section>

          <section className={styles.sectionBlock} id="retail">
            <SectionHeading
              code="FARM × RETAIL"
              title="재배에서 매장까지"
              description="재배 중인 수량과 수확 가능량, 매장 재고와 판매 속도를 연결해 봅니다."
              meta="최근 7일 판매 기준"
            />
            <article className={`${styles.pixelPanel} ${styles.flowPanel}`}>
              <div className={styles.flowHeader} aria-hidden="true">
                <span>작물</span><span>재배 중</span><span>수확 가능</span><span>매장 재고</span><span>7일 판매</span><span>상태</span>
              </div>
              {INVENTORY_ROWS.map((row) => (
                <div className={styles.flowRow} key={row.crop}>
                  <div className={styles.flowCrop}><span>{row.icon}</span><b>{row.crop}</b></div>
                  <FlowValue label="재배 중" value={row.growing} suffix="포기" tone="green" />
                  <div className={styles.flowArrow}>→</div>
                  <FlowValue label="수확 가능" value={row.ready} suffix="포기" tone="lime" />
                  <div className={styles.flowArrow}>→</div>
                  <FlowValue label="매장 재고" value={row.stock} suffix="팩" tone="cyan" />
                  <FlowValue label="7일 판매" value={row.sold} suffix="팩" tone="amber" />
                  <span className={`${styles.flowStatus} ${styles[row.tone]}`}>{row.status}</span>
                </div>
              ))}
              <div className={styles.flowFooter}>
                <span className={styles.botAvatar}>F</span>
                <p><b>다음 재배 제안</b> 버터헤드는 판매 속도가 생산 속도보다 14% 빨라요. 다음 사이클에서 8포기 증산을 검토해 보세요.</p>
                <button type="button" onClick={() => setNotice("다음 재배 사이클 검토 목록에 버터헤드 +8포기를 담았어요.")}>검토 목록에 담기</button>
              </div>
            </article>
          </section>

          {(projectsQuery.isError || dashboardQuery.isError) && (
            <p className={styles.dataFootnote}>
              현재 서버 데이터에 연결하지 못해 안전한 시연용 데이터로 표시 중입니다. 연결이 복구되면 자동으로 갱신됩니다.
            </p>
          )}
        </section>
      </div>
    </main>
    </>
  );
}

function SummaryCard({
  index,
  label,
  value,
  unit,
  detail,
  tone,
  meter,
}: {
  index: string;
  label: string;
  value: string;
  unit: string;
  detail: string;
  tone: "lime" | "cyan" | "amber" | "mint";
  meter: number;
}) {
  return (
    <article className={`${styles.summaryCard} ${styles[tone]}`}>
      <div className={styles.summaryTop}><span>{index}</span><i /></div>
      <p>{label}</p>
      <strong>{value}<small>{unit}</small></strong>
      <div className={styles.summaryBottom}><span>{detail}</span><PixelMeter value={meter} /></div>
    </article>
  );
}

function PanelHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className={styles.panelHeader}>
      <div><span>{eyebrow}</span><h2>{title}</h2></div>
      {right}
    </header>
  );
}

function SectionHeading({
  code,
  title,
  description,
  meta,
}: {
  code: string;
  title: string;
  description: string;
  meta: string;
}) {
  return (
    <header className={styles.sectionHeading}>
      <div><span>{code}</span><h2>{title}</h2><p>{description}</p></div>
      <small><i /> {meta}</small>
    </header>
  );
}

function Progress({ value, tone }: { value: number; tone: "lime" | "cyan" }) {
  return (
    <div className={`${styles.progressTrack} ${styles[tone]}`} aria-label={`${value}%`}>
      <i style={{ width: `${Math.max(value, 2)}%` }} />
    </div>
  );
}

function PixelMeter({ value }: { value: number }) {
  const on = Math.round(value / 20);
  return (
    <span className={styles.pixelMeter} aria-label={`${value}%`}>
      {[0, 1, 2, 3, 4].map((index) => <i className={index < on ? styles.meterOn : ""} key={index} />)}
    </span>
  );
}

function SensorCard({
  code,
  label,
  value,
  unit,
  target,
  status,
  glyph,
  spark,
}: {
  code: string;
  label: string;
  value: string;
  unit: string;
  target: string;
  status: "good" | "check";
  glyph: string;
  spark: number[];
}) {
  return (
    <article className={`${styles.sensorCard} ${status === "check" ? styles.sensorCheck : ""}`}>
      <div className={styles.sensorTop}>
        <span className={styles.sensorGlyph}>{glyph}</span>
        <span className={styles.sensorState}><i /> {status === "good" ? "GOOD" : "CHECK"}</span>
      </div>
      <small>{code} · {label}</small>
      <strong>{value}<em>{unit}</em></strong>
      <div className={styles.sparkline} aria-hidden="true">
        {spark.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
      </div>
      <p>레시피 범위 <b>{target}</b></p>
    </article>
  );
}

function RecipeRow({
  label,
  current,
  target,
  value,
}: {
  label: string;
  current: string;
  target: string;
  value: number;
}) {
  return (
    <div className={styles.recipeRow}>
      <div><span>{label}</span><b>{current}</b></div>
      <Progress value={value} tone="lime" />
      <small>{target}</small>
    </div>
  );
}

function FlowValue({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix: string;
  tone: string;
}) {
  return (
    <div className={`${styles.flowValue} ${styles[tone]}`}>
      <small>{label}</small><b>{value}<em>{suffix}</em></b>
    </div>
  );
}
