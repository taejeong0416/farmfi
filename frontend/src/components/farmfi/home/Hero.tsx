import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";

export function Hero({
  eyebrow,
  title,
  green,
  lead,
  art = "",
  actions,
  chips,
}: {
  eyebrow?: string;
  title: string;
  green?: string;
  lead: string;
  art?: string;
  actions?: ReactNode;
  chips?: string[];
}) {
  return (
    <section className="hero">
      <div className="shell hero-grid">
        <div className="hero-copy">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1>
            {title}
            {green ? (
              <>
                <br />
                <strong>{green}</strong>
              </>
            ) : null}
          </h1>
          <p className="lead">{lead}</p>
          {actions ? <div className="hero-actions">{actions}</div> : null}
          {chips ? <TrustStrip items={chips} /> : null}
        </div>
        <div className={`hero-art ${art}`} aria-hidden="true">
          <div className="farm-visual-card" />
        </div>
      </div>
    </section>
  );
}

function TrustStrip({ items }: { items: string[] }) {
  return (
    <div className="trust-row">
      {items.map((item) => (
        <span className="trust-chip" key={item}>
          <Icon name="check" />
          {item}
        </span>
      ))}
    </div>
  );
}
