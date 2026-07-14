"use client";

import type { AssignableRole } from "@/lib/useAuth";

const ROLE_OPTIONS: { value: AssignableRole; label: string; desc: string }[] = [
  {
    value: "operator",
    label: "운영자",
    desc: "배정받은 공간에서 스마트팜 매장을 직접 운영해요.",
  },
  {
    value: "landlord",
    label: "공간 제공자",
    desc: "보유한 유휴공간을 등록하고 스마트팜 매장으로 전환해요.",
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
