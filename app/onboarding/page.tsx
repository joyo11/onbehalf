"use client";

/*  Onboarding — 7 steps, sticky progress bar. */

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Icon, type IconName } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Wordmark } from "@/components/ui/wordmark";
import {
  EXCLUDE_COMPANIES,
  SKILL_YEARS,
  TARGET_LOCATIONS,
  TARGET_ROLES,
} from "@/lib/data";
import type { ParsedResume, SkillYear } from "@/lib/types";

const ONBOARDING_STEPS = [
  { id: 1, label: "Resume" },
  { id: 2, label: "About you" },
  { id: 3, label: "Target roles" },
  { id: 4, label: "Experience" },
  { id: 5, label: "Preferences" },
  { id: 6, label: "Voice sample" },
  { id: 7, label: "Connect Gmail" },
];

export type AboutForm = {
  name: string;
  pronouns: string;
  email: string;
  phone: string;
  linkedin: string;
  site: string;
  location: string;
  timezone: string;
};

const EMPTY_ABOUT: AboutForm = {
  name: "",
  pronouns: "",
  email: "",
  phone: "",
  linkedin: "",
  site: "",
  location: "",
  timezone: "",
};

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [about, setAbout] = useState<AboutForm>(EMPTY_ABOUT);
  const total = ONBOARDING_STEPS.length;

  // When a resume parses, seed any About fields that are still blank.
  // Don't overwrite anything the user has typed.
  function handleParsed(p: ParsedResume | null) {
    setParsed(p);
    if (!p) return;
    const c = p.contact;
    setAbout((prev) => ({
      ...prev,
      name: prev.name || c.name || "",
      email: prev.email || c.email || "",
      phone: prev.phone || c.phone || "",
      linkedin: prev.linkedin || c.linkedin || "",
      site: prev.site || c.portfolio || c.github || "",
      location: prev.location || c.location || "",
    }));
  }

  const canContinue = (() => {
    if (step === 1) return parsed !== null;
    if (step === 2) {
      const req: (keyof AboutForm)[] = [
        "name",
        "email",
        "phone",
        "linkedin",
        "site",
        "location",
        "timezone",
      ];
      return req.every((k) => about[k].trim() !== "");
    }
    return true;
  })();

  const next = () => {
    if (!canContinue) return;
    if (step < total) setStep(step + 1);
    else router.push("/dashboard");
  };
  const back = () => step > 1 && setStep(step - 1);

  return (
    <div className="min-h-full bg-sand">
      {/* Sticky progress */}
      <div className="sticky top-0 z-20 bg-sand/90 backdrop-blur border-b border-line">
        <div className="max-w-[760px] mx-auto px-6 h-16 flex items-center gap-6">
          <Wordmark size={18} />
          <div className="flex-1 flex items-center gap-3">
            <div className="flex-1">
              <Progress value={step} max={total} />
            </div>
            <span className="text-[12px] text-mute font-medium tabular-nums">
              Step {step} of {total} · {ONBOARDING_STEPS[step - 1].label}
            </span>
          </div>
          <button className="text-[12.5px] text-mute hover:text-ink">Save &amp; finish later</button>
        </div>
      </div>

      <div className="max-w-[760px] mx-auto px-6 py-14">
        <div key={step} className="anim-pop">
          {step === 1 && <OnbResume parsed={parsed} onParsed={handleParsed} />}
          {step === 2 && <OnbAbout parsed={parsed} form={about} setForm={setAbout} />}
          {step === 3 && <OnbRoles />}
          {step === 4 && <OnbExperience />}
          {step === 5 && <OnbPreferences />}
          {step === 6 && <OnbVoice />}
          {step === 7 && <OnbGmail />}
        </div>

        <div className="mt-12 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 1}
            leading={<Icon name="chevron-right" size={14} className="rotate-180" />}
          >
            Back
          </Button>
          <div className="flex items-center gap-3">
            {!canContinue && (
              <span className="text-[12.5px] text-mute">
                {step === 1
                  ? "Upload your resume to continue"
                  : "Fill in the required fields to continue"}
              </span>
            )}
            <Button
              onClick={next}
              variant="primary"
              disabled={!canContinue}
              trailing={<Icon name="arrow-right" size={14} />}
            >
              {step === total ? "Finish & go to dashboard" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mb-9">
      <SectionLabel>{eyebrow}</SectionLabel>
      <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.02em]" style={{ lineHeight: 1.1 }}>
        {title}
      </h1>
      {body && <p className="mt-3 text-[15px] text-mute lh-body max-w-[560px]">{body}</p>}
    </div>
  );
}

/* ---------- Step 1: Resume upload (real Claude parse) ---------- */
function OnbResume({
  parsed,
  onParsed,
}: {
  parsed: ParsedResume | null;
  onParsed: (p: ParsedResume | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseMs, setParseMs] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    if (f.type !== "application/pdf") {
      setError("Only PDF resumes are supported for now.");
      return;
    }
    setFile(f);
    setLoading(true);
    setError(null);
    onParsed(null);
    setParseMs(null);
    const start = Date.now();
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/parse-resume", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Parse failed (${res.status})`);
      onParsed(data.parsed as ParsedResume);
      setParseMs(Date.now() - start);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse resume.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFile(null);
    onParsed(null);
    setError(null);
    setParseMs(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <StepHeader
        eyebrow="Step 1"
        title="Let's start with your resume."
        body="Drop in a PDF. We'll parse the structure and confirm the sections we found — you can edit anything that looks off."
      />

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {!file && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          className={`w-full rounded-md border-2 border-dashed bg-white transition-colors py-14 flex flex-col items-center gap-3 ${
            dragging ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-line hover:border-[var(--accent)]"
          }`}
        >
          <div
            className="w-12 h-12 rounded-md flex items-center justify-center"
            style={{ background: "var(--accent-soft)", color: "var(--accent-hi)" }}
          >
            <Icon name="upload" size={22} />
          </div>
          <div className="text-[15px] font-medium">Drop your resume here</div>
          <div className="text-[13px] text-mute">PDF, up to 10 MB</div>
        </button>
      )}

      {file && (
        <>
          <Card className="p-4 flex items-center gap-4">
            <div
              className="w-11 h-12 rounded-sm bg-[#FBE9E9] flex items-center justify-center"
              style={{ color: "#9C2222" }}
            >
              <Icon name="file" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium truncate">{file.name}</div>
              <div className="text-[12px] text-mute">
                {Math.max(1, Math.round(file.size / 1024))} KB ·{" "}
                {loading
                  ? "Parsing with Claude…"
                  : parseMs !== null
                    ? `Parsed in ${(parseMs / 1000).toFixed(1)}s`
                    : error
                      ? "Failed"
                      : ""}
              </div>
            </div>
            {loading && (
              <Icon name="loader-2" size={16} className="text-mute animate-spin" />
            )}
            {!loading && parsed && (
              <div
                className="flex items-center gap-1.5 text-[12.5px] font-medium"
                style={{ color: "var(--accent-hi)" }}
              >
                <Icon name="check-circle" size={14} /> Parsed
              </div>
            )}
            {!loading && error && (
              <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-error">
                <Icon name="alert-circle" size={14} /> Error
              </div>
            )}
            <button className="text-[12.5px] text-mute hover:text-ink" onClick={reset}>
              Replace
            </button>
          </Card>

          {error && (
            <Card className="mt-4 p-4 border-error/40 bg-[#FBF5F5]">
              <div className="flex items-start gap-3">
                <Icon name="alert-circle" size={16} className="text-error mt-0.5 shrink-0" />
                <div className="text-[13px] text-ink leading-relaxed">{error}</div>
              </div>
            </Card>
          )}

          {loading && <SectionsSkeleton />}
          {parsed && <SectionsGrid parsed={parsed} />}
        </>
      )}
    </div>
  );
}

function SectionsSkeleton() {
  return (
    <>
      <SectionLabel className="mt-10 mb-3">Reading your resume…</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="shimmer h-3 w-24 rounded" />
            <div className="shimmer h-3 w-full mt-3 rounded" />
            <div className="shimmer h-3 w-3/4 mt-2 rounded" />
          </Card>
        ))}
      </div>
    </>
  );
}

function SectionsGrid({ parsed }: { parsed: ParsedResume }) {
  const experience = parsed.sections.filter((s) => s.type === "experience");
  const education = parsed.sections.filter((s) => s.type === "education");
  const projects = parsed.sections.filter((s) => s.type === "projects");
  const certifications = parsed.sections.filter((s) => s.type === "certifications");

  const expExcerpt = experience
    .map((s) => s.organization ?? s.title)
    .filter((x): x is string => Boolean(x))
    .slice(0, 4)
    .join(", ");
  const eduExcerpt = education
    .map((s) => [s.title, s.organization].filter(Boolean).join(" · "))
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
  const projExcerpt = projects.map((s) => s.title).slice(0, 3).join(", ");
  const certExcerpt = certifications.map((s) => s.title).slice(0, 3).join(", ");
  const skillsExcerpt = parsed.skills.map((s) => s.skill).slice(0, 6).join(", ");

  const groups = [
    {
      t: "Summary",
      n: parsed.summary ? "1 entry" : "Not found",
      e: parsed.summary ?? "No summary section detected",
    },
    {
      t: "Experience",
      n: `${experience.length} ${experience.length === 1 ? "role" : "roles"}`,
      e: expExcerpt || "No experience section detected",
    },
    {
      t: "Education",
      n: `${education.length} ${education.length === 1 ? "entry" : "entries"}`,
      e: eduExcerpt || "No education section detected",
    },
    {
      t: "Skills",
      n: `${parsed.skills.length} ${parsed.skills.length === 1 ? "item" : "items"}`,
      e: skillsExcerpt || "No skills section detected",
    },
    {
      t: "Projects",
      n: `${projects.length} ${projects.length === 1 ? "entry" : "entries"}`,
      e: projExcerpt || "No projects section detected",
    },
    {
      t: "Certifications",
      n: certifications.length === 0 ? "None" : `${certifications.length} ${certifications.length === 1 ? "entry" : "entries"}`,
      e: certExcerpt || "No certifications detected",
    },
  ];

  const hasContact = Object.values(parsed.contact).some((v) => v);

  return (
    <>
      {hasContact && (
        <Card className="mt-6 p-4">
          <SectionLabel className="mb-2">Contact</SectionLabel>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
            {parsed.contact.name && <Row label="Name" value={parsed.contact.name} />}
            {parsed.contact.email && <Row label="Email" value={parsed.contact.email} />}
            {parsed.contact.phone && <Row label="Phone" value={parsed.contact.phone} />}
            {parsed.contact.location && <Row label="Location" value={parsed.contact.location} />}
            {parsed.contact.linkedin && <Row label="LinkedIn" value={parsed.contact.linkedin} />}
            {parsed.contact.github && <Row label="GitHub" value={parsed.contact.github} />}
            {parsed.contact.portfolio && <Row label="Portfolio" value={parsed.contact.portfolio} />}
          </div>
        </Card>
      )}

      <SectionLabel className="mt-8 mb-3">Sections we found</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        {groups.map((s) => (
          <Card key={s.t} className="p-4 flex items-start justify-between" hover>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-medium">{s.t}</span>
                <span className="text-[11px] text-mute">· {s.n}</span>
              </div>
              <div className="text-[12.5px] text-mute mt-1 lh-body line-clamp-2">{s.e}</div>
            </div>
            <button className="ml-3 text-mute hover:text-ink" aria-label={`Edit ${s.t}`}>
              <Icon name="edit" size={14} />
            </button>
          </Card>
        ))}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 min-w-0">
      <span className="text-mute w-[68px] shrink-0">{label}</span>
      <span className="text-ink truncate">{value}</span>
    </div>
  );
}

/* ---------- Step 2: About ---------- */
function OnbAbout({
  parsed,
  form,
  setForm,
}: {
  parsed: ParsedResume | null;
  form: AboutForm;
  setForm: React.Dispatch<React.SetStateAction<AboutForm>>;
}) {
  const c = parsed?.contact;
  const set =
    <K extends keyof AboutForm>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const fromResume = (v: string | null | undefined) => Boolean(v);

  return (
    <div>
      <StepHeader
        eyebrow="Step 2"
        title="A few details about you."
        body={
          parsed
            ? "We auto-filled what we found on your resume. Confirm and fill the rest — everything except pronouns is required."
            : "We use these in screener questions and to filter postings that won't sponsor or relocate. Everything except pronouns is required."
        }
      />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name" hint={fromResume(c?.name) ? "From your resume" : undefined}>
          <Input value={form.name} onChange={set("name")} required />
        </Field>
        <Field label="Pronouns (optional)">
          <Input value={form.pronouns} onChange={set("pronouns")} placeholder="e.g. she/her" />
        </Field>
        <Field label="Email" hint={fromResume(c?.email) ? "From your resume" : undefined}>
          <Input type="email" value={form.email} onChange={set("email")} required />
        </Field>
        <Field label="Phone" hint={fromResume(c?.phone) ? "From your resume" : undefined}>
          <Input type="tel" value={form.phone} onChange={set("phone")} required />
        </Field>
        <Field label="LinkedIn" hint={fromResume(c?.linkedin) ? "From your resume" : undefined}>
          <Input value={form.linkedin} onChange={set("linkedin")} required />
        </Field>
        <Field
          label="Personal site"
          hint={
            fromResume(c?.portfolio)
              ? "From your resume"
              : fromResume(c?.github)
                ? "Using your GitHub from your resume"
                : undefined
          }
        >
          <Input value={form.site} onChange={set("site")} required />
        </Field>
        <Field label="Location" hint={fromResume(c?.location) ? "From your resume" : undefined}>
          <Input value={form.location} onChange={set("location")} required />
        </Field>
        <Field label="Time zone">
          <Input
            value={form.timezone}
            onChange={set("timezone")}
            placeholder="e.g. Pacific (UTC-8)"
            required
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink block mb-1.5">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-mute block mt-1.5">{hint}</span>}
    </label>
  );
}

/* ---------- Step 3: Target roles ---------- */
function OnbRoles() {
  const [roles, setRoles] = useState<string[]>([...TARGET_ROLES]);
  const [input, setInput] = useState<string>("");
  const SUGGESTIONS = [
    "Senior Software Engineer",
    "Full-stack Engineer",
    "Engineering Manager",
    "Head of Engineering",
  ];
  const addChip = (v: string) => {
    const t = v.trim();
    if (t && !roles.includes(t)) setRoles([...roles, t]);
    setInput("");
  };
  return (
    <div>
      <StepHeader
        eyebrow="Step 3"
        title="What roles are you looking for?"
        body="Add 2–4 titles. We'll search exact and adjacent variants — e.g. 'Senior Product Engineer' will also match 'Senior PE' and 'Senior SWE, Product'."
      />
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          {roles.map((r) => (
            <Chip key={r} tone="accent" onRemove={() => setRoles(roles.filter((x) => x !== r))}>
              {r}
            </Chip>
          ))}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addChip(input);
              }
            }}
            placeholder="Add a role…"
            className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-mute py-1"
          />
        </div>
      </Card>
      <div className="mt-5">
        <SectionLabel className="mb-2.5">Try also</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.filter((s) => !roles.includes(s)).map((s) => (
            <button
              key={s}
              onClick={() => addChip(s)}
              className="h-7 px-2.5 text-[12.5px] rounded-sm border border-line bg-white hover:border-line-hi flex items-center gap-1.5"
            >
              <Icon name="plus" size={12} /> {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <SectionLabel className="mb-3">Seniority</SectionLabel>
        <Segmented value="Senior" options={["Junior", "Mid", "Senior", "Staff/Principal", "Manager"]} />
      </div>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange?: (v: string) => void;
}) {
  const [v, setV] = useState<string>(value);
  return (
    <div className="inline-flex border border-line bg-white rounded-sm p-0.5">
      {options.map((o) => {
        const active = o === v;
        return (
          <button
            key={o}
            onClick={() => {
              setV(o);
              onChange && onChange(o);
            }}
            className={`h-8 px-3 rounded-[4px] text-[12.5px] font-medium transition-colors ${
              active ? "text-white" : "text-mute hover:text-ink"
            }`}
            style={active ? { background: "var(--accent)" } : undefined}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Step 4: Experience ---------- */
function OnbExperience() {
  const [skills, setSkills] = useState<SkillYear[]>(SKILL_YEARS);
  return (
    <div>
      <StepHeader
        eyebrow="Step 4"
        title="How long have you been doing this?"
        body="We auto-extracted these from your resume. Tweak the years if anything's off — they go directly into screener answers."
      />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Total years of experience"><Input defaultValue="6 years" /></Field>
        <Field label="Years in current role"><Input defaultValue="2.5 years" /></Field>
      </div>

      <SectionLabel className="mt-10 mb-3">Per-skill experience · auto-extracted</SectionLabel>
      <Card className="divide-y divide-line">
        {skills.map((s, i) => (
          <SkillRow
            key={s.skill}
            skill={s}
            onChange={(updated) => {
              const next = [...skills];
              next[i] = updated;
              setSkills(next);
            }}
          />
        ))}
      </Card>
      <button className="mt-3 text-[12.5px] flex items-center gap-1.5" style={{ color: "var(--accent-hi)" }}>
        <Icon name="plus" size={13} /> Add another skill
      </button>
    </div>
  );
}

function SkillRow({ skill, onChange }: { skill: SkillYear; onChange: (s: SkillYear) => void }) {
  const dec = () => onChange({ ...skill, years: Math.max(0, skill.years - 1) });
  const inc = () => onChange({ ...skill, years: skill.years + 1 });
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1">
        <div className="text-[14px] font-medium">{skill.skill}</div>
        <div className="text-[12px] text-mute">{skill.level}</div>
      </div>
      <div className="flex items-center gap-1 border border-line rounded-sm bg-white">
        <button onClick={dec} className="w-8 h-8 flex items-center justify-center text-mute hover:text-ink">
          <Icon name="minus" size={13} />
        </button>
        <div className="w-12 text-center text-[13px] font-medium tabular-nums">{skill.years} yr</div>
        <button onClick={inc} className="w-8 h-8 flex items-center justify-center text-mute hover:text-ink">
          <Icon name="plus" size={13} />
        </button>
      </div>
    </div>
  );
}

/* ---------- Step 5: Preferences ---------- */
function OnbPreferences() {
  return (
    <div>
      <StepHeader
        eyebrow="Step 5"
        title="Your hard constraints."
        body="We'll never submit to anything outside these. You can also tell us companies to avoid entirely."
      />
      <div className="space-y-7">
        <div>
          <SectionLabel className="mb-3">Work authorization</SectionLabel>
          <Segmented
            value="US citizen / Permanent resident"
            options={["US citizen / Permanent resident", "Need sponsorship", "Other"]}
          />
        </div>
        <div>
          <SectionLabel className="mb-3">Remote preference</SectionLabel>
          <Segmented value="Remote OK or hybrid" options={["Remote only", "Remote OK or hybrid", "On-site only"]} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Minimum base salary" hint="We won't submit to postings below this.">
            <Input defaultValue="$170,000" />
          </Field>
          <Field label="Earliest start date">
            <Input defaultValue="June 24, 2026" />
          </Field>
        </div>
        <div>
          <SectionLabel className="mb-2.5">Acceptable locations</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {TARGET_LOCATIONS.map((l) => (
              <Chip key={l} tone="accent" onRemove={() => {}}>
                {l}
              </Chip>
            ))}
            <button className="h-7 px-2.5 text-[12.5px] rounded-sm border border-line bg-white hover:border-line-hi flex items-center gap-1.5">
              <Icon name="plus" size={12} /> Add location
            </button>
          </div>
        </div>
        <div>
          <SectionLabel className="mb-2.5">Exclude companies</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {EXCLUDE_COMPANIES.map((c) => (
              <Chip key={c} onRemove={() => {}}>
                {c}
              </Chip>
            ))}
            <button className="h-7 px-2.5 text-[12.5px] rounded-sm border border-line bg-white hover:border-line-hi flex items-center gap-1.5">
              <Icon name="plus" size={12} /> Add company
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Step 6: Voice sample ---------- */
function OnbVoice() {
  return (
    <div>
      <StepHeader
        eyebrow="Step 6"
        title="Two paragraphs in your own voice."
        body="Write like you're emailing a friend who runs a startup. We use this to keep tailored bullets and cover letters recognizably yours."
      />
      <Textarea
        rows={12}
        defaultValue={`Hey — I've been a product engineer at Brightlane for about three years. I tend to ship in tight loops, prefer working close to design, and care a lot about the small details — empty states, keyboard shortcuts, the copy on error toasts. I'd rather own one surface deeply than touch ten things at half-depth.

Most of my best work happens when there's no PM in the room and I get to talk directly to the designer and a couple of customers. I'm allergic to fake-formal cover-letter language and I write the way I talk.`}
        placeholder="Write a couple of paragraphs the way you'd actually talk…"
      />
      <div className="mt-3 flex items-center justify-between text-[12px] text-mute">
        <div className="flex items-center gap-1.5">
          <Icon name="sparkles" size={13} style={{ color: "var(--accent)" }} />
          We never copy your voice verbatim — we learn the rhythm and word choice.
        </div>
        <div className="tabular-nums">187 words · plenty</div>
      </div>
    </div>
  );
}

/* ---------- Step 7: Gmail connect ---------- */
type Privacy = { i: IconName; t: string; d: string };

function OnbGmail() {
  const [connected, setConnected] = useState<boolean>(false);
  const privacy: Privacy[] = [
    {
      i: "eye",
      t: "Read confirmation-pattern emails",
      d: "Only messages matching ATS sender domains (greenhouse.io, lever.co, ashbyhq.com, workday.com, and named-company patterns).",
    },
    {
      i: "lock",
      t: "Never write or send on your behalf",
      d: "We have read-only scope. We physically can't send mail from your account.",
    },
    {
      i: "shield",
      t: "Stored encrypted, deleted on cancel",
      d: "Messages are processed and tagged, never stored beyond 30 days. Cancel and everything's gone within 24h.",
    },
  ];
  return (
    <div>
      <StepHeader
        eyebrow="Step 7"
        title="One last thing — connect your inbox."
        body="So we can surface real confirmation emails as they arrive, and filter out the noise of recruiter spam."
      />
      <Card className="p-7">
        <div className="flex items-start gap-5">
          <div
            className="w-12 h-12 rounded-md flex items-center justify-center text-white"
            style={{ background: "var(--accent)" }}
          >
            <Icon name="mail" size={22} />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-semibold">Connect Gmail</div>
            <div className="text-[13.5px] text-mute mt-1 lh-body">
              We use read-only access scoped to messages with subjects matching the confirmation patterns we look for. We never read everything in your inbox.
            </div>
            {!connected ? (
              <Button
                className="mt-5"
                variant="primary"
                onClick={() => setConnected(true)}
                leading={<Icon name="g-mail" size={14} />}
              >
                Connect with Google
              </Button>
            ) : (
              <div className="mt-5 flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--accent-hi)" }}>
                <Icon name="check-circle" size={15} /> Connected as maya.chen@gmail.com
              </div>
            )}
          </div>
        </div>

        <div className="mt-7 pt-6 border-t border-line space-y-3">
          {privacy.map((p) => (
            <div key={p.t} className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center mt-0.5"
                style={{ background: "var(--accent-soft)", color: "var(--accent-hi)" }}
              >
                <Icon name={p.i} size={14} />
              </div>
              <div>
                <div className="text-[13.5px] font-medium">{p.t}</div>
                <div className="text-[12.5px] text-mute lh-body">{p.d}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
