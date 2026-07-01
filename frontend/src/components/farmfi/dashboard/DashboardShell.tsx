"use client";

import { useQuery } from "@tanstack/react-query";
import { Icon } from "../ui/Icon";
import { Metric } from "../ui/Metric";
import { Panel } from "../ui/Panel";
import { Chart, Donut, type ChartPoint, type DonutSlice } from "./Chart";
import { HEALTHY_RANGES, type IoTReading } from "@/lib/iot-health";

const MENU = [
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

// ---- API response shapes (subset of GET /api/dashboard/[projectId] we use) ----
interface ProjectDTO {
  id: string;
  name: string;
}

interface EscrowDTO {
  totalLocked: number;
  totalReleased: number;
  remaining: number;
  status: string;
}

interface MilestoneDTO {
  id: string;
  seq: number;
  name: string;
  releaseAmount: number;
  status: string;
}

interface TransactionDTO {
  id: string;
  type: string;
  amount: number;
  txHash: string | null;
  createdAt: string;
}

interface DividendDTO {
  id: string;
  totalDividend: number;
  perToken: number;
  period: string;
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

interface NavSnapshotDTO {
  nav: number;
  recordedAt: string;
}

interface DashboardResponse {
  project: ProjectDTO;
  escrow: EscrowDTO | null;
  milestones: MilestoneDTO[];
  transactions: TransactionDTO[];
  tokenHoldersCount: number;
  dividends: DividendDTO[];
  iot: { latest: IotRecordDTO | null; history: IotRecordDTO[] };
  navSnapshots: NavSnapshotDTO[];
  nav: { nav: number; breakdown: { escrow: number; asset: number; cashFlow: number } };
  esg: { co2Reduction: number; foodMileReduction: number };
}

interface ProjectListItem {
  id: string;
}

// ---- fetchers ----
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

// ---- formatting helpers ----
function formatWon(value: number): string {
  return `₩${Math.round(value).toLocaleString("ko-KR")}`;
}

function formatCompactWon(value: number): string {
  if (Math.abs(value) >= 100_000_000) return `₩${(value / 100_000_000).toFixed(1)}억`;
  if (Math.abs(value) >= 10_000) return `₩${(value / 10_000).toFixed(0)}만`;
  return formatWon(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

const TX_TYPE_LABEL: Record<string, string> = {
  subscription: "청약 입금",
  tranche_release: "마일스톤 해제",
  dividend: "배당 지급",
  revenue: "매출 정산",
};

const SENSOR_LABEL: Record<keyof IoTReading, string> = {
  temperature: "온도",
  humidity: "습도",
  co2Level: "CO₂ 농도",
  lightIntensity: "광량",
  phLevel: "pH",
};

const SENSOR_UNIT: Record<keyof IoTReading, string> = {
  temperature: "℃",
  humidity: "%",
  co2Level: "ppm",
  lightIntensity: "lux",
  phLevel: "",
};

function buildAnomalyWarnings(latest: IotRecordDTO | null): string[] {
  if (!latest) return [];
  const warnings: string[] = [];
  (Object.keys(HEALTHY_RANGES) as (keyof IoTReading)[]).forEach((key) => {
    const [lo, hi] = HEALTHY_RANGES[key];
    const value = latest[key];
    if (value < lo || value > hi) {
      warnings.push(`${SENSOR_LABEL[key]} 이상 감지 · 현재 ${value}${SENSOR_UNIT[key]} (정상범위 ${lo}~${hi}${SENSOR_UNIT[key]})`);
    }
  });
  if (latest.isAnomaly && warnings.length === 0) {
    warnings.push(`복합 이상 패턴 감지 · 이상 스코어 ${latest.anomalyScore.toFixed(2)}`);
  }
  return warnings;
}

export function DashboardShell({
  operator = false,
  projectId,
}: {
  operator?: boolean;
  projectId?: string;
}) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
    enabled: !projectId,
  });

  const resolvedProjectId = projectId ?? projectsQuery.data?.[0]?.id;

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", resolvedProjectId],
    queryFn: () => fetchDashboard(resolvedProjectId as string),
    enabled: Boolean(resolvedProjectId),
    refetchInterval: 5000,
  });

  const data = dashboardQuery.data;
  const escrow = data?.escrow ?? null;
  const dividends = data?.dividends ?? [];
  const transactions = data?.transactions ?? [];
  const milestones = data?.milestones ?? [];
  const iotLatest = data?.iot.latest ?? null;
  const navSnapshots = data?.navSnapshots ?? [];

  const cumulativeDividend = dividends.reduce((sum, d) => sum + d.totalDividend, 0);

  const summaryMetrics = [
    { label: "에스크로 잔액", value: formatCompactWon(escrow?.remaining ?? 0) },
    { label: "총 해제", value: formatCompactWon(escrow?.totalReleased ?? 0) },
    { label: "투자자 수", value: `${data?.tokenHoldersCount ?? 0}명` },
    { label: "누적 배당", value: formatCompactWon(cumulativeDividend) },
  ];

  const warnings = buildAnomalyWarnings(iotLatest);

  const milestoneChartData: ChartPoint[] = milestones.map((m) => ({
    name: m.name,
    value: m.releaseAmount,
    status: m.status === "completed" ? "completed" : m.status === "pending" ? "pending" : "active",
  }));

  const navChartData: ChartPoint[] =
    navSnapshots.length > 0
      ? [...navSnapshots].reverse().map((snap) => ({ name: formatDate(snap.recordedAt), value: snap.nav }))
      : data
        ? [{ name: "현재", value: data.nav.nav }]
        : [];

  const navDonutData: DonutSlice[] = data
    ? [
        { name: "에스크로", value: data.nav.breakdown.escrow },
        { name: "자산가치", value: data.nav.breakdown.asset },
        { name: "누적 현금흐름", value: data.nav.breakdown.cashFlow },
      ]
    : [];

  return (
    <main className="page">
      <div className="shell dashboard">
        <aside className="side">
          {MENU.map((item) => (
            <a href="#dash" key={item}>
              <Icon name="check" /> {item}
            </a>
          ))}
        </aside>
        <section className="dash-content" id="dash">
          <h1>{operator ? "운영자 운영 대시보드" : "통합 대시보드"}</h1>
          <p className="lead">
            {data ? `${data.project.name} · ` : ""}
            투자자, 건물주, 운영자, 소비자가 한 플랫폼에서 각자의 활동을 관리하고
            실시간 데이터를 확인합니다.
          </p>

          {dashboardQuery.isLoading && (
            <p className="muted" style={{ marginTop: 24 }}>
              데이터를 불러오는 중입니다...
            </p>
          )}
          {dashboardQuery.isError && (
            <p className="muted" style={{ marginTop: 24 }}>
              대시보드 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
            </p>
          )}

          <div className="grid-4" style={{ marginTop: 30 }}>
            {summaryMetrics.map((m) => (
              <Metric key={m.label} label={m.label} value={m.value} />
            ))}
          </div>

          <div className="grid-3" style={{ marginTop: 24 }}>
            <Panel title="실시간 IoT 환경">
              <div className="seg">
                <span>{SENSOR_LABEL.temperature} {iotLatest ? `${iotLatest.temperature}${SENSOR_UNIT.temperature}` : "-"}</span>
                <span>{SENSOR_LABEL.humidity} {iotLatest ? `${iotLatest.humidity}${SENSOR_UNIT.humidity}` : "-"}</span>
                <span>{SENSOR_LABEL.co2Level} {iotLatest ? `${iotLatest.co2Level}${SENSOR_UNIT.co2Level}` : "-"}</span>
                <span>{SENSOR_LABEL.lightIntensity} {iotLatest ? `${iotLatest.lightIntensity}${SENSOR_UNIT.lightIntensity}` : "-"}</span>
              </div>
              <p className="muted" style={{ marginTop: 14 }}>
                {iotLatest ? `마지막 갱신 ${formatTime(iotLatest.recordedAt)}` : "IoT 데이터가 아직 없습니다"}
              </p>
            </Panel>
            <Panel title="이상 감지 및 경고">
              {warnings.length > 0 ? (
                warnings.map((w) => (
                  <p className="muted" key={w}>
                    ⚠ {w}
                  </p>
                ))
              ) : (
                <p className="muted">✓ 모든 센서 정상 범위 · 이상 없음</p>
              )}
            </Panel>
            <Panel title="ESG 임팩트">
              <p className="muted">CO₂ 저감 효과</p>
              <p className="big-number">{(data?.esg.co2Reduction ?? 0).toFixed(1)}kg</p>
              <p className="muted" style={{ marginTop: 12 }}>
                푸드마일 절감
              </p>
              <p className="big-number">{(data?.esg.foodMileReduction ?? 0).toFixed(1)}km</p>
            </Panel>
          </div>

          <div className="grid-3" style={{ marginTop: 24 }}>
            <Chart
              title="마일스톤별 자금 흐름"
              data={milestoneChartData}
              type="bar"
              valueFormatter={formatCompactWon}
            />
            <Chart title="NAV 추이" data={navChartData} type="area" valueFormatter={formatCompactWon} />
            <Donut
              title="NAV 구성"
              data={navDonutData}
              centerLabel={data ? `좌당 ${formatCompactWon(data.nav.nav)}` : undefined}
              valueFormatter={formatCompactWon}
            />
          </div>

          <div className="grid-2" style={{ marginTop: 24 }}>
            <Panel title="최근 거래 내역">
              <table className="table">
                <tbody>
                  {transactions.length > 0 ? (
                    transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{formatDate(tx.createdAt)}</td>
                        <td>{TX_TYPE_LABEL[tx.type] ?? tx.type}</td>
                        <td>{formatCompactWon(tx.amount)}</td>
                        <td>{tx.txHash ?? "대기"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="muted">거래 내역이 없습니다</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Panel>
            <Panel title="배당 내역">
              <table className="table">
                <tbody>
                  {dividends.length > 0 ? (
                    dividends.map((d) => (
                      <tr key={d.id}>
                        <td>{d.period}</td>
                        <td>{formatCompactWon(d.totalDividend)}</td>
                        <td>좌당 {formatWon(d.perToken)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="muted">배당 내역이 없습니다</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}
