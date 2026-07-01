import { formatDate, formatKRW, shortenHash } from "@/lib/format";
import { TRANSACTION_TYPE_LABEL } from "./status";
import type { Transaction } from "./types";

const AMOY_TX_BASE = "https://amoy.polygonscan.com/tx/";

export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return <p className="muted">아직 거래 내역이 없습니다.</p>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>일시</th>
          <th>유형</th>
          <th>금액</th>
          <th>토큰 수량</th>
          <th>온체인 기록</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((tx) => (
          <tr key={tx.id}>
            <td>{formatDate(tx.createdAt)}</td>
            <td>{TRANSACTION_TYPE_LABEL[tx.type] ?? tx.type}</td>
            <td>{formatKRW(tx.amount)}</td>
            <td>{tx.tokenAmount ?? "-"}</td>
            <td>
              {tx.txHash ? (
                <a
                  className="link"
                  href={`${AMOY_TX_BASE}${tx.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shortenHash(tx.txHash)} ↗
                </a>
              ) : (
                <span className="muted">온체인 연동 대기</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
