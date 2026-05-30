"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "./icon";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  width?: number;
};

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerActions,
  children,
  width = 580,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/20 anim-pop" onClick={onClose} aria-hidden />
      <div
        className="absolute right-0 top-0 h-full bg-white border-l border-line shadow-pop flex flex-col anim-slide-in"
        style={{ width: `min(100vw, ${width}px)` }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="h-14 px-5 flex items-center justify-between border-b border-line shrink-0">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-ink truncate">{title}</div>
            {subtitle && <div className="text-[12px] text-ink-soft truncate">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-1.5">
            {headerActions}
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-ctrl hover:bg-[#F1F0EB] flex items-center justify-center focus-ring"
              aria-label="Close"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
