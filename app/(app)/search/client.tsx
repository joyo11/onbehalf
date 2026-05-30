"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Ic } from "@/components/ob/icons";
import { Eyebrow } from "@/components/ob/primitives";

export type SearchDefaults = {
  targetRoles: string[];
  preferredLocations: string[];
  excludedCompanies: string[];
  desiredSalaryMin: number | null;
  totalYearsExperience: string | null;
  seniorityLevel: string | null;
  batchSize: number | null;
};

const YOE_OPTIONS = ["0-2", "3-5", "6-8", "9-12", "13+"] as const;
const LEVEL_OPTIONS = ["junior", "mid", "senior", "staff", "principal"] as const;
const LEVEL_LABEL: Record<(typeof LEVEL_OPTIONS)[number], string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal+",
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
  const [batch, setBatch] = useState<number>(defaults.batchSize ?? 10);
  const [mode, setMode] = useState<string>("review-each");
  const [yoe, setYoe] = useState<string | null>(defaults.totalYearsExperience);
  const [level, setLevel] = useState<string | null>(defaults.seniorityLevel);

  const toggleSize = (s: string) =>
    setSize(size.includes(s) ? size.filter((x) => x !== s) : [...size, s]);

  const onSubmit = () => {
    void fetch("/api/profile/search-prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        targetRoleTitles: keywords,
        preferredLocations: locations,
        excludedCompanies: excluded,
        desiredSalaryMin: salary * 1000,
        totalYearsExperience: yoe,
        seniorityLevel: level,
        batchSize: batch,
      }),
    }).catch(() => {});

    const params = new URLSearchParams();
    if (keywords.length > 0) params.set("roles", keywords.join(","));
    if (locations.length > 0) params.set("locations", locations.join(","));
    if (salary > 0) params.set("salaryMin", String(salary * 1000));
    if (level) params.set("level", level);
    params.set("limit", String(batch));
    router.push(`/matches?${params.toString()}`);
  };

  return (
    <div className="max-w-[1180px] mx-auto px-5 sm:px-9 py-7 sm:py-9">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <Eyebrow tone="teal" className="mb-3">
            New search
          </Eyebrow>
          <h1
            className="font-display font-black text-ink"
            style={{ fontSize: "clamp(2rem, 3vw, 2.7rem)", lineHeight: 1.05, letterSpacing: "-0.03em" }}
          >
            Tell me what you&apos;re looking for.
          </h1>
          <p className="mt-3 text-[15px] text-ink-mute lh-body max-w-[640px]">
            I&apos;ll search Greenhouse, Lever, Ashby, and Workday and queue applications you can review
            or auto-submit.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="shrink-0 inline-flex items-center gap-2 rounded-full bg-sand-50 hover:bg-sand-100 border border-sand-200 text-ink-soft text-[14px] font-semibold px-4 py-2 transition-colors"
        >
          Cancel
        </Link>
      </div>

      <div className="mt-10 grid grid-cols-12 gap-7">
        <div className="col-span-12 lg:col-span-8 space-y-7">
          <Block label="Role keywords" hint="Pre-filled from your profile.">
            <ChipInput chips={keywords} onChange={setKeywords} placeholder="Add a role…" tone="accent" />
          </Block>

          <Block label="Locations" hint="We&apos;ll only surface jobs that match these.">
            <ChipInput
              chips={locations}
              onChange={setLocations}
              placeholder="Add a city or 'Remote (Region)'…"
            />
          </Block>

          <Block label="Years of experience" hint="Used to filter and rank matches.">
            <div className="flex flex-wrap gap-2">
              {YOE_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => setYoe(yoe === v ? null : v)}
                  className={
                    "h-9 px-3.5 rounded-full border text-[13px] font-semibold transition-colors " +
                    (yoe === v
                      ? "bg-teal-500 border-teal-500 text-white"
                      : "bg-white border-sand-200 text-ink hover:border-ink/30")
                  }
                >
                  {v} yrs
                </button>
              ))}
            </div>
          </Block>

          <Block label="Seniority level" hint="Hard-filters titles that don&apos;t match.">
            <div className="flex flex-wrap gap-2">
              {LEVEL_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => setLevel(level === v ? null : v)}
                  className={
                    "h-9 px-3.5 rounded-full border text-[13px] font-semibold transition-colors " +
                    (level === v
                      ? "bg-teal-500 border-teal-500 text-white"
                      : "bg-white border-sand-200 text-ink hover:border-ink/30")
                  }
                >
                  {LEVEL_LABEL[v]}
                </button>
              ))}
            </div>
          </Block>

          <Block label="Minimum base salary">
            <div className="flex items-center gap-5">
              <div className="flex-1 relative h-10 flex items-center">
                <input
                  type="range"
                  min={80}
                  max={400}
                  step={5}
                  value={salary}
                  onChange={(e) => setSalary(+e.target.value)}
                  className="w-full appearance-none h-1.5 rounded-full focus:outline-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, #0D9488 0%, #0D9488 ${
                      ((salary - 80) / 320) * 100
                    }%, #EDE7D6 ${((salary - 80) / 320) * 100}%, #EDE7D6 100%)`,
                  }}
                />
                <style>{`
                  input[type=range]::-webkit-slider-thumb {
                    -webkit-appearance: none; appearance: none; width: 20px; height: 20px;
                    border-radius: 50%; background: #fff;
                    border: 2px solid #0D9488;
                    box-shadow: 0 1px 4px rgba(0,0,0,.15); cursor: grab;
                  }
                `}</style>
              </div>
              <div className="w-[130px] text-right">
                <div className="font-display font-black text-ink" style={{ fontSize: "2rem", lineHeight: 1, letterSpacing: "-0.02em" }}>
                  ${salary}k
                </div>
                <div className="text-[12px] text-ink-faint mt-1">base / yr</div>
              </div>
            </div>
          </Block>

          <Block label="Company size">
            <div className="grid grid-cols-3 gap-3">
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
                    className={
                      "h-14 rounded-xl2 border text-left px-4 transition-colors " +
                      (active
                        ? "border-teal-500 bg-teal-500 text-white"
                        : "border-sand-200 bg-white text-ink hover:border-ink/30")
                    }
                  >
                    <div className="text-[14px] font-bold">{o.v}</div>
                    <div className={"text-[11.5px] " + (active ? "text-white/85" : "text-ink-faint")}>
                      {o.sub} people
                    </div>
                  </button>
                );
              })}
            </div>
          </Block>

          <Block label="Exclude companies">
            <ChipInput
              chips={excluded}
              onChange={setExcluded}
              placeholder="Add a company to never apply to…"
            />
          </Block>

          <Block label="Batch size" hint="How many to find and process this run.">
            <div className="flex items-center gap-5">
              <div className="inline-flex items-center border border-sand-200 rounded-xl2 bg-white overflow-hidden">
                <button
                  onClick={() => setBatch(Math.max(1, batch - 1))}
                  className="w-11 h-11 flex items-center justify-center text-ink-mute hover:text-ink hover:bg-sand-50 transition-colors"
                >
                  <Ic.minus className="h-3.5 w-3.5" />
                </button>
                <div className="w-14 text-center text-[15px] font-bold tabular">{batch}</div>
                <button
                  onClick={() => setBatch(Math.min(50, batch + 1))}
                  className="w-11 h-11 flex items-center justify-center text-ink-mute hover:text-ink hover:bg-sand-50 transition-colors"
                >
                  <Ic.plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="text-[13px] text-ink-mute">applications per run · max 50</span>
            </div>
          </Block>

          <Block label="When to submit">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ModeCard
                active={mode === "review-each"}
                onClick={() => setMode("review-each")}
                title="Review each"
                body="I'll prepare every application. You approve before submit."
                icon={Ic.eye}
              />
              <ModeCard
                active={mode === "auto-high"}
                onClick={() => setMode("auto-high")}
                title="Auto-submit > 85"
                body="I'll submit the obvious wins. Lower scores wait for you."
                icon={Ic.bolt}
                recommended
              />
              <ModeCard
                active={mode === "auto-all"}
                onClick={() => setMode("auto-all")}
                title="Auto-submit all"
                body="Trust me with everything in this batch. No review needed."
                icon={Ic.send}
              />
            </div>
          </Block>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-6 lg:sticky lg:top-9">
            <Eyebrow>This run</Eyebrow>
            <p
              className="font-display font-black text-ink mt-3"
              style={{ fontSize: "2.4rem", lineHeight: 1, letterSpacing: "-0.025em" }}
            >
              {batch}
              <span className="text-[14px] font-medium text-ink-faint ml-2">
                {batch === 1 ? "application" : "applications"}
              </span>
            </p>

            <ul className="mt-6 space-y-3 text-[13.5px]">
              <SumRow label="Roles" value={String(keywords.length || "—")} />
              <SumRow label="Locations" value={String(locations.length || "—")} />
              <SumRow label="Min salary" value={`$${salary}k`} />
              <SumRow
                label="Submit mode"
                value={
                  mode === "review-each" ? "Review" : mode === "auto-high" ? "Auto >85" : "Auto all"
                }
              />
            </ul>

            <button
              onClick={onSubmit}
              className="group mt-6 w-full inline-flex items-center justify-center gap-2.5 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[15px] py-3.5 transition-colors ob-card-shadow"
            >
              <Ic.spark className="h-[18px] w-[18px]" />
              Find &amp; apply
              <Ic.arrow className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1" />
            </button>
            <p className="mt-3 text-[11.5px] text-ink-faint text-center leading-relaxed">
              Each application takes 30–60s end-to-end.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-6">
      <div className="mb-3.5">
        <p className="text-[14px] font-bold text-ink">{label}</p>
        {hint && <p className="text-[12.5px] text-ink-mute mt-0.5">{hint}</p>}
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
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span
          key={c}
          className={
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium " +
            (tone === "accent" ? "bg-teal-50 text-teal-700" : "bg-sand-50 text-ink-soft")
          }
        >
          {c}
          <button
            onClick={() => onChange(chips.filter((x) => x !== c))}
            className={
              "h-4 w-4 grid place-items-center rounded-full " +
              (tone === "accent" ? "hover:bg-teal-100" : "hover:bg-sand-100")
            }
          >
            <Ic.x className="h-2.5 w-2.5" />
          </button>
        </span>
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
        className="flex-1 min-w-[160px] bg-transparent text-[14px] outline-none placeholder:text-ink-faint py-1"
      />
    </div>
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
  icon: (p: { className?: string }) => React.JSX.Element;
  recommended?: boolean;
}) {
  const Icon = icon;
  return (
    <button
      onClick={onClick}
      className={
        "relative text-left p-4 rounded-xl2 border transition-colors " +
        (active
          ? "bg-teal-50 border-teal-500"
          : "bg-white border-sand-200 hover:border-ink/30")
      }
    >
      {recommended && (
        <span className="absolute -top-2 right-3 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em] font-bold rounded-sm bg-teal-500 text-white">
          Recommended
        </span>
      )}
      <div className="flex items-center gap-2">
        <span
          className={
            "h-7 w-7 rounded-xl2 flex items-center justify-center " +
            (active ? "bg-teal-500 text-white" : "bg-sand-50 text-ink-mute")
          }
        >
          <Icon className="h-[15px] w-[15px]" />
        </span>
        <span className="text-[14px] font-bold text-ink">{title}</span>
      </div>
      <div className="mt-2 text-[12.5px] text-ink-mute leading-relaxed">{body}</div>
    </button>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-ink-mute">{label}</span>
      <span className="font-bold tabular text-ink">{value}</span>
    </li>
  );
}
