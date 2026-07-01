"use client";

// Real, working filter controls for the /projects list. This is a
// deliberate sibling to ui/FilterBar.tsx (not an edit of it) — FilterBar
// renders static placeholder `<div>` cells with no state/inputs, and it's
// owned by another agent's file set. This component reuses the same
// `.filterbar` / `.input` visual language with actual <input>/<select>
// elements wired to real fetched data.

import type { ChangeEvent } from "react";
import { PROJECT_STATUS_LABEL } from "./status";

export type ProjectFilters = {
  search: string;
  status: string; // "all" | ProjectStatus
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "전체 상태" },
  ...Object.entries(PROJECT_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

export function ProjectFilterBar({
  value,
  onChange,
}: {
  value: ProjectFilters;
  onChange: (next: ProjectFilters) => void;
}) {
  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, search: e.target.value });
  };
  const handleStatus = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...value, status: e.target.value });
  };

  return (
    <div className="card filterbar" style={{ gridTemplateColumns: "2fr 1fr" }}>
      <input
        className="input"
        type="text"
        placeholder="프로젝트명, 위치로 검색"
        value={value.search}
        onChange={handleSearch}
        aria-label="프로젝트 검색"
      />
      <select
        className="input"
        value={value.status}
        onChange={handleStatus}
        aria-label="모집 상태 필터"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
