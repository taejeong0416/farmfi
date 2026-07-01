import { formatDate, formatKRW } from "@/lib/format";
import type { PortfolioDividend } from "./types";

export function DividendHistory({ dividends }: { dividends: PortfolioDividend[] }) {
  if (dividends.length === 0) {
    return <p className="muted">아직 받은 배당이 없습니다.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>프로젝트</th>
            <th>정산 기간</th>
            <th>배당금</th>
            <th>좌당 배당액</th>
            <th>수령 상태</th>
          </tr>
        </thead>
        <tbody>
          {dividends.map((d) => (
            <tr key={d.id}>
              <td>{d.projectName}</td>
              <td>{d.period}</td>
              <td>{formatKRW(d.claimAmount)}</td>
              <td>{formatKRW(d.perToken)}</td>
              <td>
                <span className={`badge ${d.claimed ? "is-ok" : "is-pending"}`}>
                  {d.claimed ? "수령 완료" : "수령 대기"}
                </span>
                {d.claimed && d.claimedAt ? (
                  <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                    {formatDate(d.claimedAt)}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
