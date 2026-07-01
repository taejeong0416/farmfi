import { formatDate, formatKRW, shortenHash } from "@/lib/format";
import { PORTFOLIO_TX_TYPE_LABEL } from "./status";
import type { PortfolioTransaction } from "./types";

export function RecentActivity({ transactions }: { transactions: PortfolioTransaction[] }) {
  if (transactions.length === 0) {
    return <p className="muted">아직 거래 내역이 없습니다.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>일시</th>
            <th>프로젝트</th>
            <th>유형</th>
            <th>금액</th>
            <th>온체인 기록</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id}>
              <td>{formatDate(tx.createdAt)}</td>
              <td>{tx.projectName}</td>
              <td>{PORTFOLIO_TX_TYPE_LABEL[tx.type] ?? tx.type}</td>
              <td>{formatKRW(tx.amount)}</td>
              <td>
                {tx.txHash ? (
                  <span>{shortenHash(tx.txHash)}</span>
                ) : (
                  <span className="muted">대기 · 모의</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
