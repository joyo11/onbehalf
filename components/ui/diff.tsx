import type { ReactNode } from "react";
import type { DiffKind, DiffSegmentT } from "@/lib/types";

type DiffSegmentProps = {
  kind: DiffKind;
  children: ReactNode;
  reason?: string;
};

export function DiffSegment({ kind, children, reason }: DiffSegmentProps) {
  if (kind === "keep") return <span>{children}</span>;
  if (kind === "add") {
    return (
      <span className="ttp inline relative">
        <span
          className="rounded-[3px] px-0.5"
          style={{
            background: "rgba(13, 148, 136, 0.14)",
            color: "var(--accent-hi)",
            boxShadow: "inset 0 -1px 0 var(--accent)",
          }}
        >
          {children}
        </span>
        {reason && <span className="ttp-body">{reason}</span>}
      </span>
    );
  }
  return (
    <span className="ttp inline relative">
      <span
        className="line-through"
        style={{ color: "#A37272", textDecorationColor: "#DC2626" }}
      >
        {children}
      </span>
      {reason && <span className="ttp-body">{reason}</span>}
    </span>
  );
}

export function DiffLine({ segments }: { segments: DiffSegmentT[] }) {
  return (
    <span>
      {segments.map((s, i) => (
        <DiffSegment key={i} kind={s.k} reason={s.r}>
          {s.t}
        </DiffSegment>
      ))}
    </span>
  );
}
