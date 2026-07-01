import Link from "next/link";
import { Panel } from "@/components/FarmFi";
import { formatKRW } from "@/lib/format";
import type { TokenHoldingSummary } from "@/lib/useAuth";

export function TokenHoldingsPanel({ holdings }: { holdings: TokenHoldingSummary[] }) {
  if (holdings.length === 0) {
    return (
      <Panel title="보유 토큰">
        <p className="muted" style={{ marginTop: 0 }}>
          아직 보유한 토큰이 없어요.
        </p>
        <Link className="link" href="/projects" style={{ marginTop: 12 }}>
          투자할 프로젝트 둘러보기 →
        </Link>
      </Panel>
    );
  }

  return (
    <Panel title="보유 토큰">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>프로젝트</th>
              <th>보유 수량</th>
              <th>평균 매입가</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.projectId}>
                <td>
                  <Link className="link" href={`/projects/${h.projectId}`} style={{ marginTop: 0 }}>
                    {h.projectName} ({h.tokenSymbol})
                  </Link>
                </td>
                <td>{h.amount.toLocaleString()}개</td>
                <td>{formatKRW(h.avgPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
