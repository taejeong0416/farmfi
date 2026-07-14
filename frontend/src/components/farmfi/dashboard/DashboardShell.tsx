"use client";

import { useQuery } from "@tanstack/react-query";
import { Icon } from "../ui/Icon";
import { Panel } from "../ui/Panel";
import { Chart, type ChartPoint } from "./Chart";
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
  "리포트",
];

// ---- API response shapes (GET /api/dashboard/[projectId]) ----
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
  esg: { co2Reduction: number; foodMileReduction: number };
}

async function fetchDashboard(projectId: string): Promise<DashboardResponse> {
  const res = await fetch(`/api/dashboard/${projectId}`);
  if (!res.ok) throw new Error("대시보드 데이터를 불러오지 못했습니다");
  return res.json();
}

// ---- formatting helpers ----
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

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
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", projectId],
    queryFn: () => fetchDashboard(projectId as string),
    enabled: Boolean(projectId),
    refetchInterval: 5000,
  });

  const data = dashboardQuery.data;
  const iotLatest = data?.iot.latest ?? null;
  const iotHistory = data?.iot.history ?? [];

  const warnings = buildAnomalyWarnings(iotLatest);

  const tempChartData: ChartPoint[] = [...iotHistory]
    .reverse()
    .map((r) => ({ name: formatTime(r.recordedAt), value: r.temperature }));

  return (
    // 페이지가 자체 <main>에 임베드할 수 있도록 div — <main> 중첩 방지.
    <div className="page">
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
            지점의 생육 환경과 이상 신호를 실시간으로 확인합니다.
          </p>

          {!projectId && (
            <p className="muted" style={{ marginTop: 24 }}>
              표시할 지점이 선택되지 않았습니다.
            </p>
          )}
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

          <div className="grid-3" style={{ marginTop: 30 }}>
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

          <div style={{ marginTop: 24 }}>
            <Chart
              title="온도 추이 (최근 24시간)"
              data={tempChartData}
              type="area"
              valueFormatter={(v) => `${v}℃`}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
