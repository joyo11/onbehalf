import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  leading?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12.5px] gap-1.5",
  md: "h-9 px-3.5 text-[13px] gap-1.5",
  lg: "h-11 px-5 text-[14.5px] gap-2",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover shadow-subtle",
  secondary:
    "bg-surface text-ink border border-line hover:border-ink/30 hover:bg-[#FBFAF6] shadow-subtle",
  ghost: "text-ink hover:bg-black/[0.04]",
  danger:
    "bg-surface text-error border border-line hover:bg-[#FDF5F5] hover:border-error/40",
  link: "text-accent hover:text-accent-hover underline underline-offset-[3px] decoration-[1px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  leading,
  trailing,
  loading,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const disabledCls = disabled || loading ? "opacity-50 cursor-not-allowed" : "active:translate-y-px";
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-ctrl font-medium transition-colors focus-ring ${sizes[size]} ${variants[variant]} ${disabledCls} ${className}`}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </button>
  );
}
