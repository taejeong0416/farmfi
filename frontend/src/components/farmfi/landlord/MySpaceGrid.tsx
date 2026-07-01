import { formatDate } from "@/lib/format";
import type { MySpace } from "./api";
import {
  spaceStatusBadgeClass,
  spaceStatusLabel,
  spaceStatusProgress,
  spaceThumbVariant,
  spaceTypeLabel,
} from "./status";

function formatRent(value: number | null): string {
  return value != null ? `₩${value.toLocaleString("ko-KR")}/월` : "산정 중";
}

function formatScore(value: number | null): string {
  return value != null ? `${value}%` : "—";
}

export function MySpaceGrid({ spaces }: { spaces: MySpace[] }) {
  if (spaces.length === 0) {
    return <p className="muted">아직 등록된 공간이 없습니다.</p>;
  }

  return (
    <div className="grid-3">
      {spaces.map((space) => {
        const progress = spaceStatusProgress(space.status);
        return (
          <article className="card project-card soft-card" key={space.id}>
            <div className={`thumb ${spaceThumbVariant(space.spaceType)}`.trim()}>
              <span className={`badge ${spaceStatusBadgeClass(space.status)}`} style={{ margin: 14 }}>
                {spaceStatusLabel(space.status)}
              </span>
            </div>
            <div className="project-body">
              <h3>{spaceTypeLabel(space.spaceType)}</h3>
              <p className="muted">⌖ {space.address}</p>
              <div className="kv">
                <div>
                  <span>스마트팜 적합도</span>
                  <b>{formatScore(space.suitabilityScore)}</b>
                </div>
                <div>
                  <span>예상 월 임대 수익</span>
                  <b>{formatRent(space.estimatedRent)}</b>
                </div>
                <div>
                  <span>등록일</span>
                  <b>{formatDate(space.createdAt)}</b>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 18, fontSize: 12 }}>
                계약 진행률 {progress}%
              </p>
              <div className="progress" style={{ marginTop: 6 }}>
                <span className="bar" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
