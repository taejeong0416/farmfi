"use client";

import type { AssignableRole } from "@/lib/useAuth";

const ROLE_OPTIONS: { value: AssignableRole; label: string; desc: string }[] = [
  {
    value: "investor",
    label: "투자자",
    desc: "도심 스마트팜 프로젝트에 투자하고 수익을 받아요.",
  },
  {
    value: "landlord",
    label: "건물주",
    desc: "유휴공간을 등록하고 안정적인 임대 수익을 받아요.",
  },
  {
    value: "operator",
    label: "운영자",
    desc: "스마트팜을 직접 운영하고 지속가능한 농업을 실현해요.",
  },
];

export function RoleSelect({
  value,
  onChange,
}: {
  value: AssignableRole;
  onChange: (role: AssignableRole) => void;
}) {
  const selected = ROLE_OPTIONS.find((opt) => opt.value === value);

  return (
    <div>
      <div className="seg is-interactive" role="radiogroup" aria-label="가입 유형 선택">
        {ROLE_OPTIONS.map((opt) => {
          const active = opt.value === value;
          return (
            <span
              key={opt.value}
              role="radio"
              aria-checked={active}
              tabIndex={0}
              className={active ? "is-active" : undefined}
              onClick={() => onChange(opt.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onChange(opt.value);
                }
              }}
            >
              {opt.label}
            </span>
          );
        })}
      </div>
      {selected && (
        <p className="muted" style={{ marginTop: 10 }}>
          {selected.desc}
        </p>
      )}
    </div>
  );
}
