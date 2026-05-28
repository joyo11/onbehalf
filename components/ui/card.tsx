import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
};

export function Card({ hover, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`bg-white border border-line rounded-card shadow-card ${
        hover ? "hover:border-line-hi transition-colors" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[10.5px] font-semibold uppercase tracking-[0.08em] text-mute ${className}`}>
      {children}
    </div>
  );
}
