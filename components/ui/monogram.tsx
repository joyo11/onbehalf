import { useMemo } from "react";

const COMPANY_BRAND: Record<string, string> = {
  Stripe: "#635BFF",
  Vercel: "#000000",
  Linear: "#5E6AD2",
  Notion: "#1A1A1A",
  Figma: "#0ACF83",
  Anthropic: "#C96442",
  Ramp: "#F4F147",
  Mercury: "#2B3F6C",
  Retool: "#3D3D3D",
  Plaid: "#111111",
  Brex: "#1B1B1B",
  Airtable: "#FCB400",
  Loom: "#625DF5",
  Webflow: "#4353FF",
  Replit: "#F26207",
  Cursor: "#0F0F0F",
  Supabase: "#3ECF8E",
  Vanta: "#143F33",
  Persona: "#3B5BDB",
  ClickUp: "#7B68EE",
  Render: "#46E3B7",
  "Fly.io": "#8B5CF6",
  Modal: "#1A1A1A",
  "Modal Labs": "#1A1A1A",
};

const FALLBACK_PALETTE = [
  "#0F766E",
  "#7C4A1C",
  "#5B47B5",
  "#3B5A8C",
  "#9B3636",
  "#363636",
  "#2F6B3D",
  "#A8552E",
];

function paletteFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

type MonogramProps = {
  name: string;
  size?: number;
  square?: boolean;
};

export function Monogram({ name, size = 28, square = true }: MonogramProps) {
  const initials = useMemo(() => {
    const parts = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }, [name]);

  const color = COMPANY_BRAND[name] ?? paletteFor(name);

  return (
    <div
      className="inline-flex items-center justify-center shrink-0 text-white font-medium"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: square ? 5 : "50%",
        fontSize: Math.floor(size * 0.42),
        letterSpacing: "-0.01em",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
