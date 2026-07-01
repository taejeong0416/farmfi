import { formatKRW } from "@/lib/format";
import { MILESTONE_STATUS_COLOR, MILESTONE_STATUS_LABEL } from "./status";
import type { Milestone } from "./types";

export function MilestoneStepper({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) {
    return <p className="muted">등록된 마일스톤이 없습니다.</p>;
  }

  const sorted = [...milestones].sort((a, b) => a.seq - b.seq);

  return (
    <ul className="timeline">
      {sorted.map((m) => (
        <li key={m.id}>
          <i style={{ background: MILESTONE_STATUS_COLOR[m.status] ?? "#c7cfc9" }} />
          <div>
            <strong style={{ display: "block" }}>
              M{m.seq}. {m.name}
            </strong>
            {m.conditionText ? (
              <span className="muted" style={{ fontSize: 12 }}>
                {m.conditionText}
              </span>
            ) : null}
          </div>
          <div style={{ textAlign: "right" }}>
            <strong style={{ display: "block" }}>{formatKRW(m.releaseAmount)}</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
