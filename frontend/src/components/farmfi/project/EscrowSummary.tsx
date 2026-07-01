import { formatKRW } from "@/lib/format";
import { StatBox } from "./StatBox";
import type { Escrow } from "./types";

export function EscrowSummary({ escrow }: { escrow: Escrow | null }) {
  if (!escrow) {
    return <p className="muted">에스크로 정보가 없습니다.</p>;
  }

  return (
    <div className="grid-3">
      <StatBox label="총 락업 금액" value={formatKRW(escrow.totalLocked)} />
      <StatBox label="해제된 금액" value={formatKRW(escrow.totalReleased)} />
      <StatBox label="잔여 금액" value={formatKRW(escrow.remaining)} />
    </div>
  );
}
