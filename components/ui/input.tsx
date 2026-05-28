import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon, type IconName } from "./icon";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  leading?: IconName;
  size?: "sm" | "md";
};

export function Input({ leading, size = "md", className = "", ...rest }: InputProps) {
  const h = size === "sm" ? "h-7 text-[12.5px]" : "h-10 text-sm";
  const padLeft = leading ? "pl-8" : "pl-3";
  return (
    <div className={`relative inline-flex items-center w-full ${className}`}>
      {leading && (
        <span className="absolute left-2.5 text-ink-faint pointer-events-none">
          <Icon name={leading} size={14} />
        </span>
      )}
      <input
        className={`${h} ${padLeft} pr-3 w-full rounded-ctrl border border-line bg-white text-ink placeholder:text-mute focus-ring transition-shadow`}
        {...rest}
      />
    </div>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className = "", rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={`w-full p-3 rounded-ctrl border border-line bg-white text-sm text-ink placeholder:text-mute focus-ring transition-shadow leading-relaxed ${className}`}
      {...rest}
    />
  );
}
