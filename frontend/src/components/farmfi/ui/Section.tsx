import type { ReactNode } from "react";

export function Section({
  title,
  desc,
  children,
  aside,
  id,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <section className="section" id={id}>
      <div className="shell">
        <div className="section-head">
          <div>
            <h2>{title}</h2>
            {desc ? <p className="section-desc">{desc}</p> : null}
          </div>
          {aside}
        </div>
        {children}
      </div>
    </section>
  );
}
