import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  padded?: boolean;
};

export function Card({ children, className, padded = true }: CardProps) {
  return (
    <div
      className={[
        "rounded-10 border border-line bg-white",
        padded ? "p-6" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
};

export function CardHeader({ title, desc, action }: CardHeaderProps) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-15 font-bold text-ink">{title}</h2>
        {desc ? <p className="mt-1 text-12 text-muted">{desc}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardDivider() {
  return <hr className="my-5 border-0 border-t border-line-soft" />;
}

/** 화면 최상단의 제목 블록. 1440 본문과 730 패널 양쪽에서 같은 형태로 쓴다. */
export function PageHeading({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-6">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-14 font-medium text-brand">{eyebrow}</p>
        ) : null}
        <h1 className="text-24 font-bold text-ink">{title}</h1>
        {desc ? <p className="mt-2 text-12 text-muted">{desc}</p> : null}
      </div>
      {action}
    </div>
  );
}
