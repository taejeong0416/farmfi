import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const variantClass: Record<Variant, string> = {
  primary: "bg-brand text-white border border-brand hover:bg-[#0F4325]",
  secondary: "bg-white text-brand border border-brand hover:bg-brand-soft",
  ghost: "bg-white text-ink border border-line hover:bg-surface",
  danger: "bg-white text-danger border border-danger hover:bg-[#FBF3F2]",
};

const sizeClass: Record<Size, string> = {
  md: "h-11 px-5 text-14",
  sm: "h-9 px-4 text-12",
};

function classes(variant: Variant, size: Size, full?: boolean, extra?: string) {
  return [
    "inline-flex items-center justify-center gap-1.5 rounded-6 font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-40",
    variantClass[variant],
    sizeClass[size],
    full ? "w-full" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  href?: string;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  full,
  href,
  className,
  children,
  ...rest
}: Props) {
  const cn = classes(variant, size, full, className);
  if (href) {
    return (
      <Link href={href} className={cn}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cn} {...rest}>
      {children}
    </button>
  );
}
