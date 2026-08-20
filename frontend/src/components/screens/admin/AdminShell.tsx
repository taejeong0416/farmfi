"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { label: "콘솔 홈", href: "/admin" },
  { label: "프로젝트 관리", href: "/admin/projects" },
  { label: "운영자 심사", href: "/admin/operators" },
  { label: "보증서 관리", href: "/admin/certificates" },
  { label: "공간 · 설비", href: "/admin/spaces" },
  { label: "증빙 재검토", href: "/admin/evidence" },
];

/** 관리자 화면 공통 좌측 메뉴. 콘솔 안에서만 쓴다. */
export function AdminShell({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";

  return (
    <main className="mx-auto flex max-w-shell gap-8 px-8 py-10">
      <nav className="w-[200px] shrink-0">
        <p className="mb-4 text-11 font-medium text-muted">관리자 콘솔</p>
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-6 px-3 py-2.5 text-13 ${
                    active
                      ? "bg-brand-soft font-medium text-brand"
                      : "text-body hover:bg-surface"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        <div className="mb-7 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-24 font-bold text-ink">{title}</h1>
            {desc ? <p className="mt-2 text-13 text-body">{desc}</p> : null}
          </div>
          {action}
        </div>
        {children}
      </div>
    </main>
  );
}
