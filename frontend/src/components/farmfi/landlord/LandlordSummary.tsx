import { Metric } from "@/components/FarmFi";
import type { MySpace } from "./api";

export function LandlordSummary({ spaces }: { spaces: MySpace[] }) {
  const totalSpaces = spaces.length;
  const approvedCount = spaces.filter((s) => s.status === "approved").length;

  const scored = spaces.filter((s) => s.suitabilityScore != null);
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, s) => sum + (s.suitabilityScore ?? 0), 0) / scored.length)
      : 0;

  const totalEstimatedRent = spaces.reduce((sum, s) => sum + (s.estimatedRent ?? 0), 0);

  return (
    <div className="stats-grid">
      <Metric label="등록 공간 수" value={`${totalSpaces}개`} />
      <Metric label="계약 진행 중" value={`${approvedCount}개`} />
      <Metric label="평균 스마트팜 적합도" value={scored.length > 0 ? `${avgScore}%` : "—"} />
      <Metric label="예상 월 임대 수익 합계" value={`₩${totalEstimatedRent.toLocaleString("ko-KR")}`} />
    </div>
  );
}
