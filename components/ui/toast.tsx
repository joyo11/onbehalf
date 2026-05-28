"use client";

import { useEffect } from "react";
import { Icon, type IconName } from "./icon";

type ToastKind = "info" | "success" | "error";

type ToastProps = {
  open: boolean;
  message: string;
  kind?: ToastKind;
  onClose: () => void;
};

const ICON_FOR: Record<ToastKind, IconName> = {
  info: "info",
  success: "check",
  error: "alert-circle",
};

export function Toast({ open, message, kind = "info", onClose }: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-ink text-white px-3 py-2 rounded-ctrl shadow-pop flex items-center gap-2 text-[13px]">
      <Icon name={ICON_FOR[kind]} size={14} />
      {message}
    </div>
  );
}
