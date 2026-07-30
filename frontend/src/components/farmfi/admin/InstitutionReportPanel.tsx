"use client";

import { useCallback, useEffect, useState } from "react";

// GET /api/reports/institution?institutionId=&days= 응답 스펙 (route.ts 기준).
type ProjectRow = {
  projectId: string;
  name: string;
  status: string;
  harvestQuantity: number;
  salesQuantity: number;
  revenue: number;
  iotRecords: number;
  anomalyRate: number;
};
type InstitutionReport = {
  institution: { id: string; name: string };
  periodDays: number;
  summary: {
    projectCount: number;
    operatingRate: number;
    totalHarvest: number;
    totalSalesQuantity: number;
    totalRevenue: number;
  };
  byProject: ProjectRow[];
};

// 기관 목록 전용 엔드포인트가 없어 프로젝트 목록의 institutionId로 후보를 만든다.
type ProjectLite = { id: string; name: string; institutionId: string | null };
type InstitutionOption = { id: string; hint: string };

function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

export function InstitutionReportPanel() {
  const [options, setOptions] = useState<InstitutionOption[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<InstitutionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/projects", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { projects?: ProjectLite[] }) => {
        if (!alive) return;
        const grouped = new Map<string, string[]>();
        for (const p of d.projects ?? []) {
          if (!p.institutionId) continue;
          const names = grouped.get(p.institutionId) ?? [];
          names.push(p.name);
          grouped.set(p.institutionId, names);
        }
        const opts = [...grouped.entries()].map(([id, names]) => ({
          id,
          hint: `${names[0]}${names.length > 1 ? ` 외 ${names.length - 1}건` : ""}`,
        }));
        setOptions(opts);
        setInstitutionId((prev) => prev || opts[0]?.id || "");
      })
      .catch(() => {
        if (alive) setError("프로젝트 목록을 불러오지 못했습니다.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadReport = useCallback(async () => {
    if (!institutionId.trim()) {
      setError("institutionId를 선택하거나 입력해주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/institution?institutionId=${encodeURIComponent(
          institutionId.trim()
        )}&days=${days}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "리포트를 불러오지 못했습니다.");
      setReport(data as InstitutionReport);
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "리포트를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [institutionId, days]);

  return (
    <article className="card chart">
      <h3>기관 성과 집계</h3>
      <div style={{ marginTop: 18, display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr", maxWidth: 640 }}>
          {options.length > 0 ? (
            <div>
              <p className="muted" style={{ marginBottom: 6 }}>
                기관 선택
              </p>
              <select
                className="input"
                value={options.some((o) => o.id === institutionId) ? institutionId : ""}
                onChange={(e) => setInstitutionId(e.target.value)}
              >
                <option value="">직접 입력</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.hint}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <p className="muted" style={{ marginBottom: 6 }}>
              institutionId
            </p>
            <input
              className="input"
              value={institutionId}
              placeholder="기관 ID"
              onChange={(e) => setInstitutionId(e.target.value)}
            />
          </div>

          <div>
            <p className="muted" style={{ marginBottom: 6 }}>
              집계 기간 (일)
            </p>
            <select
              className="input"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {[7, 30, 90, 365].map((d) => (
                <option key={d} value={d}>
                  최근 {d}일
                </option>
              ))}
            </select>
          </div>

          <button className="btn" type="button" disabled={loading} onClick={loadReport}>
            {loading ? "불러오는 중…" : "리포트 조회"}
          </button>
        </div>

        {error ? <p style={{ color: "#b02a2a" }}>{error}</p> : null}

        {report ? (
          <>
            <div>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
                {report.institution.name}
              </p>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                최근 {report.periodDays}일 집계
              </p>
            </div>

            <ul className="kv">
              <li>
                <span className="muted">지점 수</span>
                <strong>{report.summary.projectCount}개</strong>
              </li>
              <li>
                <span className="muted">운영률</span>
                <strong>{report.summary.operatingRate}%</strong>
              </li>
              <li>
                <span className="muted">총 수확량</span>
                <strong>{report.summary.totalHarvest.toLocaleString("ko-KR")}</strong>
              </li>
              <li>
                <span className="muted">총 판매량</span>
                <strong>
                  {report.summary.totalSalesQuantity.toLocaleString("ko-KR")}
                </strong>
              </li>
              <li>
                <span className="muted">총 매출</span>
                <strong>{won(report.summary.totalRevenue)}</strong>
              </li>
            </ul>

            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>지점</th>
                    <th>상태</th>
                    <th>수확량</th>
                    <th>판매량</th>
                    <th>매출</th>
                    <th>IoT 기록</th>
                    <th>이상률</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byProject.map((p) => (
                    <tr key={p.projectId}>
                      <td>{p.name}</td>
                      <td>{p.status}</td>
                      <td>{p.harvestQuantity.toLocaleString("ko-KR")}</td>
                      <td>{p.salesQuantity.toLocaleString("ko-KR")}</td>
                      <td>{won(p.revenue)}</td>
                      <td>{p.iotRecords.toLocaleString("ko-KR")}</td>
                      <td
                        style={{
                          color: p.anomalyRate > 10 ? "#b02a2a" : "var(--green-700)",
                          fontWeight: 800,
                        }}
                      >
                        {p.anomalyRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}
