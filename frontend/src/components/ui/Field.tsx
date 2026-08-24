"use client";

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const control =
  "h-[46px] w-full rounded-8 border border-line bg-white px-4 text-13 text-ink placeholder:text-muted outline-none focus:border-brand disabled:bg-surface disabled:text-muted";

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  /** 라벨 옆에 * 를 붙인다. 입력 자체의 required 는 컨트롤에 따로 준다. */
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-2 block text-12 text-muted">
          {label}
          {required ? (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          ) : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1.5 block text-11 text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-11 text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={`${control} ${className ?? ""}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select className={`${control} ${className ?? ""}`} {...rest}>
      {children}
    </select>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      className={`${control} h-auto min-h-[96px] resize-y py-3 leading-6 ${className ?? ""}`}
      {...rest}
    />
  );
}

export function Checkbox({
  label,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        className="mt-0.5 h-[15px] w-[15px] shrink-0 accent-brand"
        {...rest}
      />
      <span className="text-12 text-body">{label}</span>
    </label>
  );
}

/** 카드형 단일 선택. 픽업 지점·팩 크기·본인확인 방법처럼 항목을 골라야 하는 화면에 쓴다. */
export function OptionCard({
  selected,
  title,
  desc,
  right,
  onClick,
}: {
  selected: boolean;
  title: ReactNode;
  desc?: ReactNode;
  right?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-4 rounded-10 border px-5 py-4 text-left transition-colors ${
        selected
          ? "border-brand bg-brand-soft"
          : "border-line bg-white hover:bg-surface"
      }`}
    >
      <span>
        <span className="block text-14 font-medium text-ink">{title}</span>
        {desc ? (
          <span className="mt-1 block text-12 text-muted">{desc}</span>
        ) : null}
      </span>
      {right}
    </button>
  );
}
