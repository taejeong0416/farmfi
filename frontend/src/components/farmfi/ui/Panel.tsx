import type { ReactNode } from "react";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="card chart">
      <h3>{title}</h3>
      <div style={{ marginTop: 18 }}>{children}</div>
    </article>
  );
}
