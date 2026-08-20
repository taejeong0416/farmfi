"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  desc,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  desc?: string;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-modal rounded-10 border border-line bg-white"
      >
        <div className="border-b border-line-soft px-6 py-5">
          <h2 className="text-20 font-bold text-ink">{title}</h2>
          {desc ? <p className="mt-2 text-12 text-muted">{desc}</p> : null}
        </div>
        {children ? <div className="px-6 py-5">{children}</div> : null}
        {footer ? (
          <div className="flex gap-2 border-t border-line-soft px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
