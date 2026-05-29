"use client";

/*  Search / Setup — single clean screen. */

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Icon, type IconName } from "@/components/ui/icon";

export type SearchDefaults = {
  targetRoles: string[];
  preferredLocations: string[];
  excludedCompanies: string[];
  desiredSalaryMin: number | null;
};

export default function SearchScreen({ defaults }: { defaults: SearchDefaults }) {
  const router = useRouter();
  const [keywords, setKeywords] = useState<string[]>(defaults.targetRoles);
  const [locations, setLocations] = useState<string[]>(defaults.preferredLocations);
  const [excluded, setExcluded] = useState<string[]>(defaults.excludedCompanies);
  const [salary, setSalary] = useState<number>(
    defaults.desiredSalaryMin ? Math.round(defaults.desiredSalaryMin / 1000) : 150,
  );
  const [size, setSize] = useState<string[]>(["Startup", "Mid"]);
  const [batch, setBatch] = useState<number>(12);
  const [mode, setMode] = useState<string>("review-each");

  const toggleSize = (s: string) =>
    setSize(size.includes(s) ? size.filter((x) => x !== s) : [...size, s]);

  return (
    <div className="px-10 py-9 max-w-[1100px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <SectionLabel>New search</SectionLabel>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.022em]">
            Tell me what you&apos;re looking for.
          </h1>
          <p className="mt-2 text-[14px] text-mute lh-body max-w-[600px]">
            I&apos;ll search across Greenhouse, Lever, Ashby, and Workday for the next 48 hours. You can stop me anytime from the dashboard.
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.push("/dashboard")}>
          Cancel
        </Button>
      </div>

      <div className="mt-10 grid grid-cols-12 gap-8">
        <div className="col-span-8 space-y-8">
          <SearchBlock label="Role keywords" hint="Pre-filled from your profile.">
            <ChipInput chips={keywords} onChange={setKeywords} placeholder="Add a role…" tone="accent" />
          </SearchBlock>

          <SearchBlock label="Locations" hint="We'll only surface jobs that match these.">
            <ChipInput
              chips={locations}
              onChange={setLocations}
              placeholder="Add a city or 'Remote (Region)'…"
            />
          </SearchBlock>

          <SearchBlock label="Minimum base salary">
            <div className="flex items-center gap-5">
              <div className="flex-1 relative h-10 flex items-center">
                <input
                  type="range"
                  min={80}
                  max={400}
                  step={5}
                  value={salary}
                  onChange={(e) => setSalary(+e.target.value)}
                  className="w-full appearance-none h-1.5 rounded-full bg-[#EFEDE7] focus:outline-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${
                      ((salary - 80) / 320) * 100
                    }%, #EFEDE7 ${((salary - 80) / 320) * 100}%, #EFEDE7 100%)`,
                  }}
                />
                <style>{`
                  input[type=range]::-webkit-slider-thumb {
                    -webkit-appearance: none; appearance: none; width: 18px; height: 18px;
                    border-radius: 50%; background: #fff;
                    border: 2px solid var(--accent);
                    box-shadow: 0 1px 3px rgba(0,0,0,.15); cursor: grab;
                  }
                `}</style>
              </div>
              <div className="w-[120px] text-right">
                <div className="text-[22px] font-semibold tabular-nums">${salary}k</div>
                <div className="text-[11.5px] text-mute">base / yr</div>
              </div>
            </div>
          </SearchBlock>

          <SearchBlock label="Company size">
            <div className="flex gap-2">
              {[
                { v: "Startup", sub: "< 50" },
                { v: "Mid", sub: "50–500" },
                { v: "Enterprise", sub: "500+" },
              ].map((o) => {
                const active = size.includes(o.v);
                return (
                  <button
                    key={o.v}
                    onClick={() => toggleSize(o.v)}
                    className={`flex-1 h-14 rounded-sm border text-left px-4 transition-colors ${
                      active ? "text-white" : "border-line bg-white text-ink hover:border-line-hi"
                    }`}
                    style={active ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
                  >
                    <div className="text-[13.5px] font-semibold">{o.v}</div>
                    <div className={`text-[11.5px] ${active ? "text-white/80" : "text-mute"}`}>
                      {o.sub} people
                    </div>
                  </button>
                );
              })}
            </div>
          </SearchBlock>

          <SearchBlock label="Exclude companies">
            <ChipInput
              chips={excluded}
              onChange={setExcluded}
              placeholder="Add a company to never apply to…"
            />
          </SearchBlock>

          <SearchBlock label="Batch size" hint="How many to find and process this run.">
            <div className="flex items-center gap-5">
              <div className="inline-flex items-center border border-line rounded-sm bg-white">
                <button
                  onClick={() => setBatch(Math.max(1, batch - 1))}
                  className="w-10 h-10 flex items-center justify-center text-mute hover:text-ink"
                >
                  <Icon name="minus" size={14} />
                </button>
                <div className="w-14 text-center text-[14px] font-semibold tabular-nums">{batch}</div>
                <button
                  onClick={() => setBatch(Math.min(50, batch + 1))}
                  className="w-10 h-10 flex items-center justify-center text-mute hover:text-ink"
                >
                  <Icon name="plus" size={14} />
                </button>
              </div>
              <span className="text-[13px] text-mute">applications per run · max 50</span>
            </div>
          </SearchBlock>

          <SearchBlock label="When to submit">
            <div className="grid grid-cols-3 gap-3">
              <ModeCard
                active={mode === "review-each"}
                onClick={() => setMode("review-each")}
                title="Review each"
                body="I'll prepare every application. You approve before submit."
                icon="eye"
              />
              <ModeCard
                active={mode === "auto-high"}
                onClick={() => setMode("auto-high")}
                title="Auto-submit when match > 85"
                body="I'll submit the obvious wins. Lower scores wait for you."
                icon="bolt"
                recommended
              />
              <ModeCard
                active={mode === "auto-all"}
                onClick={() => setMode("auto-all")}
                title="Auto-submit all"
                body="Trust me with everything in this batch. No review needed."
                icon="paper-plane"
              />
            </div>
          </SearchBlock>
        </div>

        <div className="col-span-4">
          <Card className="p-6 sticky top-8">
            <SectionLabel>Estimate</SectionLabel>
            <div className="mt-3 text-[15px] font-medium">This run</div>
            <div className="mt-5 space-y-3 text-[13.5px]">
              <EstimateRow label="Search" value="free" />
              <EstimateRow label={`Tailoring · ${batch} apps`} value={`$${(batch * 0.22).toFixed(2)}`} />
              <EstimateRow label="Screener answers" value={`$${(batch * 0.06).toFixed(2)}`} />
              <EstimateRow label="Submission automation" value={`$${(batch * 0.04).toFixed(2)}`} />
              <div className="border-t border-line pt-3 mt-3 flex items-center justify-between">
                <span className="text-[13px] font-medium">Total</span>
                <span className="text-[18px] font-semibold tabular-nums">${(batch * 0.32).toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-5 p-3 rounded-sm" style={{ background: "var(--accent-soft)" }}>
              <div className="text-[12px] font-medium" style={{ color: "var(--accent-hi)" }}>
                Included in your Pro plan
              </div>
              <div className="text-[11.5px] mt-0.5" style={{ color: "var(--accent-hi)", opacity: 0.85 }}>
                88 of 100 applications remaining this month.
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full mt-5"
              onClick={() => {
                const params = new URLSearchParams();
                if (keywords.length > 0) params.set("roles", keywords.join(","));
                if (locations.length > 0) params.set("locations", locations.join(","));
                if (salary > 0) params.set("salaryMin", String(salary * 1000));
                router.push(`/matches?${params.toString()}`);
              }}
              leading={<Icon name="sparkles" size={14} />}
            >
              Find &amp; apply
            </Button>
            <p className="mt-3 text-[11.5px] text-mute text-center lh-body">
              Estimated time to first match: <span className="text-ink font-medium">~90 seconds</span>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SearchBlock({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2.5">
        <div className="text-[13px] font-semibold">{label}</div>
        {hint && <div className="text-[12px] text-mute mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function ChipInput({
  chips,
  onChange,
  placeholder,
  tone = "neutral",
}: {
  chips: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  tone?: "neutral" | "accent";
}) {
  const [input, setInput] = useState<string>("");
  const add = (v: string) => {
    const t = v.trim();
    if (t && !chips.includes(t)) onChange([...chips, t]);
    setInput("");
  };
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <Chip key={c} tone={tone} onRemove={() => onChange(chips.filter((x) => x !== c))}>
            {c}
          </Chip>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(input);
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-mute py-1"
        />
      </div>
    </Card>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  body,
  icon,
  recommended,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
  icon: IconName;
  recommended?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left p-4 rounded-md border transition-colors ${
        active ? "bg-white" : "bg-white hover:border-line-hi border-line"
      }`}
      style={active ? { borderColor: "var(--accent)", boxShadow: "inset 0 0 0 1px var(--accent)" } : undefined}
    >
      {recommended && (
        <span
          className="absolute -top-2 right-3 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.06em] font-semibold rounded-sm"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Recommended
        </span>
      )}
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-sm flex items-center justify-center"
          style={{
            background: active ? "var(--accent-soft)" : "#F2F1EC",
            color: active ? "var(--accent-hi)" : "#6B6B6B",
          }}
        >
          <Icon name={icon} size={14} />
        </span>
        <span className="text-[13.5px] font-semibold">{title}</span>
      </div>
      <div className="mt-2 text-[12px] text-mute lh-body">{body}</div>
    </button>
  );
}

function EstimateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-mute">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
