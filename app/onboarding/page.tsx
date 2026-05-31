"use client";

/*  Onboarding — 7 steps, sticky progress bar. */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
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
import { COUNTRIES, US_STATES, guessCountryStateFrom } from "@/lib/locations";
import type { ParsedResume, SkillYear } from "@/lib/types";

// All IANA time zones (resolved at module load). Browser + Node 18+
// both support Intl.supportedValuesOf — falls back to a tiny shortlist
// only if the runtime is too old.
const TIMEZONES: string[] = (() => {
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (f) return f("timeZone");
  } catch {
    /* fall through */
  }
  return [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
    "UTC",
  ];
})();

function isValidLinkedIn(url: string): boolean {
  return url.trim().toLowerCase().includes("linkedin.com");
}

/**
 * Block only OBVIOUS keyboard mash. Real writing — even repetitive,
 * even informal, even with the same idea phrased three different ways
 * — should sail through. We are not a writing tutor.
 *
 * Flags as gibberish only when ANY of:
 *   - 6+ same chars in a row ("aaaaaa", "kkkkkk")
 *   - 8+ chars from the same keyboard row run together with no space
 *     ("qwertyuiop", "asdfghjkl")
 *   - avg word length under 1.5 chars (genuine single-letter spam)
 */
function looksLikeGibberish(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (/([a-z])\1{5,}/.test(t)) return true;
  if (/[qwertyuiop]{8,}/.test(t)) return true;
  if (/[asdfghjkl]{8,}/.test(t)) return true;
  if (/[zxcvbnm]{8,}/.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 15) {
    const avgLen = words.reduce((n, w) => n + w.length, 0) / words.length;
    if (avgLen < 1.5) return true;
  }
  return false;
}

function isValidGitHub(url: string): boolean {
  return url.trim().toLowerCase().includes("github.com");
}

// Keywords that signal a real job title. "Suha" doesn't contain any → rejected.
// "Software Engineer" contains "engineer" → accepted.
const ROLE_KEYWORDS = [
  "engineer", "engineering", "developer", "programmer", "coder", "architect",
  "designer", "design", "ux", "ui",
  "manager", "management", "lead", "director", "vp", "head", "chief", "officer",
  "principal", "staff", "senior", "junior", "associate",
  "founder", "founding", "cofounder",
  "scientist", "analyst", "researcher", "research",
  "product", "data", "ml", "ai", "platform", "infrastructure", "infra", "security",
  "marketing", "sales", "growth", "operations", "ops", "finance",
  "intern", "internship", "specialist", "consultant", "advocate",
  "swe", "sre", "devops", "qa", "tester", "tester",
  "pm", "tpm", "epm",
  "writer", "editor", "content",
  "recruiter", "recruiting",
  "support", "success",
  "accountant", "lawyer", "doctor", "nurse", "teacher", "professor",
];

function isValidRole(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (t.length < 3) return false;
  return ROLE_KEYWORDS.some((kw) => t.includes(kw));
}

const ONBOARDING_STEPS = [
  { id: 1, label: "Resume" },
  { id: 2, label: "About you" },
  { id: 3, label: "Target roles" },
  { id: 4, label: "Experience" },
  { id: 5, label: "Preferences" },
  { id: 6, label: "Voice sample" },
];

export type AboutForm = {
  name: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  pronouns: string;
  email: string;
  phone: string;
  linkedin: string;
  site: string;
  github: string;
  country: string;
  state: string;
  city: string;
  timezone: string;
};

export type PrefsForm = {
  workAuth: "us_citizen_pr" | "needs_sponsorship" | "other" | "";
  workAuthOther: string; // free text when workAuth === "other" (e.g. "OPT", "OPT STEM")
  futureSponsorship: "yes" | "no" | ""; // separate from current auth — common form question
  willingToRelocate: "no" | "within_country" | "anywhere" | "";
  workPreference: { remote: boolean; hybrid: boolean; onsite: boolean };
  salaryMin: number; // in thousands USD
  earliestStartDate: string; // YYYY-MM-DD or ""
  locations: string[];
};

const EMPTY_PREFS: PrefsForm = {
  workAuth: "",
  workAuthOther: "",
  futureSponsorship: "",
  willingToRelocate: "",
  workPreference: { remote: true, hybrid: true, onsite: false },
  salaryMin: 50,
  earliestStartDate: "",
  locations: ["Remote (US)", "New York", "San Francisco"],
};

const EMPTY_ABOUT: AboutForm = {
  name: "",
  firstName: "",
  lastName: "",
  preferredName: "",
  pronouns: "",
  email: "",
  phone: "",
  linkedin: "",
  site: "",
  github: "",
  country: "",
  state: "",
  city: "",
  timezone: "",
};

export default function OnboardingScreen() {
  return (
    <Suspense fallback={null}>
      <OnboardingInner />
    </Suspense>
  );
}

function OnboardingInner() {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [about, setAbout] = useState<AboutForm>(EMPTY_ABOUT);
  const [roles, setRoles] = useState<string[]>([...TARGET_ROLES]);
  const [prefs, setPrefs] = useState<PrefsForm>(EMPTY_PREFS);
  const [voice, setVoice] = useState<string>("");
  const [gmailConnected, setGmailConnected] = useState<boolean>(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<boolean>(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [yoe, setYoe] = useState<string>("");
  const [yoeAfterGrad, setYoeAfterGrad] = useState<string>("");

  // Pick up the result of the Google OAuth round-trip on /onboarding?gmail=...
  const sp = useSearchParams();
  useEffect(() => {
    if (sp.get("gmail") === "connected") {
      setGmailConnected(true);
      setStep(7);
      router.replace("/onboarding");
    }
    const err = sp.get("gmail_error");
    if (err) {
      setGmailError(err);
      setStep(7);
      router.replace("/onboarding");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const total = ONBOARDING_STEPS.length;

  // When a resume parses, seed any About fields that are still blank.
  // Don't overwrite anything the user has typed.
  function handleParsed(p: ParsedResume | null) {
    setParsed(p);
    if (!p) return;
    const c = p.contact;
    const loc = guessCountryStateFrom(c.location);
    // Split the parsed full name into first / last so step 1 can show
    // them as editable fields. preferredName defaults to firstName.
    const fullName = (c.name ?? "").trim();
    const parts = fullName.split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
    setAbout((prev) => ({
      ...prev,
      name: prev.name || c.name || "",
      firstName: prev.firstName || first,
      lastName: prev.lastName || last,
      preferredName: prev.preferredName || first,
      email: prev.email || c.email || "",
      phone: prev.phone || c.phone || "",
      linkedin: prev.linkedin || c.linkedin || "",
      site: prev.site || c.portfolio || "",
      github: prev.github || c.github || "",
      country: prev.country || loc.country || "",
      state: prev.state || loc.state || "",
      city: prev.city || loc.city || "",
    }));
  }

  const canContinue = (() => {
    if (step === 1) return parsed !== null;
    if (step === 2) {
      const baseReq: (keyof AboutForm)[] = [
        "name",
        "email",
        "phone",
        "linkedin",
        "country",
        "timezone",
      ];
      if (!baseReq.every((k) => about[k].trim() !== "")) return false;
      if (!isValidLinkedIn(about.linkedin)) return false;
      if (!about.city.trim()) return false;
      if (about.country === "US" && !about.state.trim()) return false;
      if (about.github.trim() && !isValidGitHub(about.github)) return false;
      return true;
    }
    if (step === 3) return roles.length >= 1;
    if (step === 5) {
      if (!prefs.workAuth) return false;
      if (prefs.workAuth === "other" && prefs.workAuthOther.trim().length < 2) {
        return false;
      }
      if (!prefs.futureSponsorship) return false;
      if (!prefs.willingToRelocate) return false;
      const wp = prefs.workPreference;
      if (!wp.remote && !wp.hybrid && !wp.onsite) return false;
      if (prefs.locations.length === 0) return false;
      if (!prefs.earliestStartDate) return false;
      return true;
    }
    if (step === 6) return voice.trim().split(/\s+/).filter(Boolean).length >= 30;
    return true;
  })();

  async function finish() {
    setFinishing(true);
    setFinishError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          about,
          roles,
          prefs,
          voice,
          gmailConnected,
          totalYearsExperience: yoe || null,
          yearsExperienceAfterGraduation: yoeAfterGrad || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      router.push("/go");
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : "Failed to save profile.");
      setFinishing(false);
    }
  }

  const next = () => {
    if (!canContinue || finishing) return;
    if (step < total) setStep(step + 1);
    else void finish();
  };
  const back = () => step > 1 && setStep(step - 1);

  return (
    <div className="min-h-full bg-sand">
      {/* Sticky progress */}
      <div className="sticky top-0 z-20 bg-sand/90 backdrop-blur border-b border-line">
        <div className="max-w-[760px] mx-auto px-6 h-16 flex items-center gap-6">
          <Link href="/" className="focus-ring rounded-ctrl">
            <Wordmark size={18} />
          </Link>
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
          {step === 1 && (
            <OnbResume
              parsed={parsed}
              onParsed={handleParsed}
              about={about}
              setAbout={setAbout}
            />
          )}
          {step === 2 && <OnbAbout parsed={parsed} form={about} setForm={setAbout} />}
          {step === 3 && <OnbRoles roles={roles} setRoles={setRoles} />}
          {step === 4 && (
            <OnbExperience
              parsed={parsed}
              yoe={yoe}
              setYoe={setYoe}
              yoeAfterGrad={yoeAfterGrad}
              setYoeAfterGrad={setYoeAfterGrad}
            />
          )}
          {step === 5 && <OnbPreferences prefs={prefs} setPrefs={setPrefs} />}
          {step === 6 && <OnbVoice value={voice} onChange={setVoice} />}
        </div>

        {/* Spacer so the sticky action bar never overlaps the last form field */}
        <div className="h-24" aria-hidden />
      </div>

      <div className="sticky bottom-0 z-30 border-t border-line bg-paper shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.08)]">
        <div className="max-w-[760px] mx-auto px-6 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 1}
            leading={<Icon name="chevron-right" size={14} className="rotate-180" />}
          >
            Back
          </Button>
          <div className="flex items-center gap-3">
            {finishError && (
              <span className="text-[12.5px] text-error">{finishError}</span>
            )}
            {!canContinue && !finishing && !finishError && (
              <span className="text-[12.5px] text-mute">
                {step === 1
                  ? "Upload your resume to continue"
                  : step === 6
                    ? "Write at least 30 words to continue"
                    : "Fill in the required fields to continue"}
              </span>
            )}
            <Button
              onClick={next}
              variant="ghost"
              disabled={!canContinue || finishing}
              loading={finishing}
              trailing={!finishing && <Icon name="arrow-right" size={14} />}
            >
              {step === total
                ? finishing
                  ? "Saving…"
                  : "Finish & go to dashboard"
                : "Continue"}
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
  about,
  setAbout,
}: {
  parsed: ParsedResume | null;
  onParsed: (p: ParsedResume | null) => void;
  about: AboutForm;
  setAbout: React.Dispatch<React.SetStateAction<AboutForm>>;
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
                  ? "Parsing…"
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
          {parsed && (
            <>
              <Card className="mt-5 p-4">
                <SectionLabel className="mb-2">Confirm your name</SectionLabel>
                <p className="text-[12.5px] text-mute mb-3">
                  We auto-split your full name. Fix anything that looks off — these go straight
                  into application forms.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="First name">
                    <Input
                      value={about.firstName}
                      onChange={(e) =>
                        setAbout((p) => ({ ...p, firstName: e.target.value }))
                      }
                      placeholder="First"
                    />
                  </Field>
                  <Field label="Last name">
                    <Input
                      value={about.lastName}
                      onChange={(e) =>
                        setAbout((p) => ({ ...p, lastName: e.target.value }))
                      }
                      placeholder="Last"
                    />
                  </Field>
                  <Field label="Preferred name" hint="What people call you day-to-day.">
                    <Input
                      value={about.preferredName}
                      onChange={(e) =>
                        setAbout((p) => ({ ...p, preferredName: e.target.value }))
                      }
                      placeholder="e.g. Shafay"
                    />
                  </Field>
                </div>
              </Card>
              <SectionsGrid parsed={parsed} />
            </>
          )}
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
  const setText =
    <K extends keyof AboutForm>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSelect =
    <K extends keyof AboutForm>(k: K) =>
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const fromResume = (v: string | null | undefined) => Boolean(v);
  const linkedinInvalid = form.linkedin.trim().length > 0 && !isValidLinkedIn(form.linkedin);
  const githubInvalid = form.github.trim().length > 0 && !isValidGitHub(form.github);

  return (
    <div>
      <StepHeader
        eyebrow="Step 2"
        title="A few details about you."
        body={
          parsed
            ? "We auto-filled what we found on your resume. Confirm and fill the rest."
            : "We use these in screener questions and to filter postings that won't sponsor or relocate."
        }
      />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name" hint={fromResume(c?.name) ? "From your resume" : undefined}>
          <Input value={form.name} onChange={setText("name")} required />
        </Field>
        <Field label="Pronouns (optional)">
          <Input value={form.pronouns} onChange={setText("pronouns")} placeholder="e.g. she/her" />
        </Field>
        <Field label="Email" hint={fromResume(c?.email) ? "From your resume" : undefined}>
          <Input type="email" value={form.email} onChange={setText("email")} required />
        </Field>
        <Field label="Phone" hint={fromResume(c?.phone) ? "From your resume" : undefined}>
          <Input type="tel" value={form.phone} onChange={setText("phone")} required />
        </Field>
        <Field
          label="LinkedIn URL"
          hint={
            linkedinInvalid
              ? "Must be a LinkedIn URL (e.g. linkedin.com/in/yourname)"
              : fromResume(c?.linkedin)
                ? "From your resume"
                : undefined
          }
          hintTone={linkedinInvalid ? "error" : "neutral"}
        >
          <Input
            value={form.linkedin}
            onChange={setText("linkedin")}
            placeholder="linkedin.com/in/yourname"
            required
          />
        </Field>
        <Field
          label="GitHub (optional)"
          hint={
            githubInvalid
              ? "Must be a GitHub URL (e.g. github.com/yourname)"
              : fromResume(c?.github)
                ? "From your resume"
                : undefined
          }
          hintTone={githubInvalid ? "error" : "neutral"}
        >
          <Input
            value={form.github}
            onChange={setText("github")}
            placeholder="github.com/yourname"
          />
        </Field>
        <Field
          label="Personal site (optional)"
          hint={fromResume(c?.portfolio) ? "From your resume" : undefined}
        >
          <Input
            value={form.site}
            onChange={setText("site")}
            placeholder="yourdomain.com"
          />
        </Field>
        <Field label="Time zone">
          <Select value={form.timezone} onChange={setSelect("timezone")} required>
            <option value="" disabled>
              Pick your time zone…
            </option>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country">
          <Select value={form.country} onChange={setSelect("country")} required>
            <option value="" disabled>
              Select a country…
            </option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {form.country === "US" && (
          <Field label="State">
            <Select value={form.state} onChange={setSelect("state")} required>
              <option value="" disabled>
                Select a state…
              </option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {form.country && (
          <Field label="City">
            <Input
              value={form.city}
              onChange={setText("city")}
              placeholder={form.country === "US" ? "e.g. San Francisco" : "e.g. Karachi"}
              required
            />
          </Field>
        )}
        {!form.country && (
          <Field label="State / City">
            <div className="h-10 px-3 rounded-ctrl border border-line bg-[#FBFAF6] flex items-center text-[12.5px] text-mute">
              Pick a country first
            </div>
          </Field>
        )}
      </div>
    </div>
  );
}

function Select({
  children,
  className = "",
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-10 w-full px-3 pr-8 rounded-ctrl border border-line bg-white text-sm text-ink focus-ring transition-shadow appearance-none cursor-pointer ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6B6B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

function Field({
  label,
  children,
  hint,
  hintTone = "neutral",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  hintTone?: "neutral" | "error";
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink block mb-1.5">{label}</span>
      {children}
      {hint && (
        <span
          className={`text-[12px] block mt-1.5 ${hintTone === "error" ? "text-error" : "text-mute"}`}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

/* ---------- Step 3: Target roles ---------- */
function OnbRoles({
  roles,
  setRoles,
}: {
  roles: string[];
  setRoles: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [input, setInput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const SUGGESTIONS = [
    "Senior Software Engineer",
    "Full-stack Engineer",
    "Engineering Manager",
    "Head of Engineering",
  ];
  const addChip = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (roles.includes(t)) {
      setError(`"${t}" is already in your list.`);
      return;
    }
    if (!isValidRole(t)) {
      setError(
        `"${t}" doesn't look like a job title. Try something like "Software Engineer", "Product Designer", or "Marketing Manager".`,
      );
      return;
    }
    setRoles([...roles, t]);
    setInput("");
    setError(null);
  };
  return (
    <div>
      <StepHeader
        eyebrow="Step 3"
        title="What roles are you looking for?"
        body="Add 2–4 titles. We'll search exact and adjacent variants — e.g. 'Senior Product Engineer' will also match 'Senior PE' and 'Senior SWE, Product'."
      />
      <Card className={`p-3 ${error ? "border-error/40" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          {roles.map((r) => (
            <Chip
              key={r}
              tone="accent"
              onRemove={() => {
                setRoles(roles.filter((x) => x !== r));
                setError(null);
              }}
            >
              {r}
            </Chip>
          ))}
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addChip(input);
              }
            }}
            placeholder={roles.length === 0 ? "Type a role and press Enter…" : "Add a role…"}
            className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-mute py-1"
          />
        </div>
      </Card>
      {error && (
        <div className="mt-2 flex items-start gap-2 text-[12.5px] text-error">
          <Icon name="alert-circle" size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
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
              active
                ? "bg-[#EDE7D6] text-ink ring-1 ring-ink/70"
                : "text-mute hover:text-ink"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Step 4: Experience ---------- */
const YOE_BUCKETS = [
  "Under 1 year",
  "1-2 years",
  "3-5 years",
  "5-7 years",
  "8-10 years",
  "10+ years",
];

function OnbExperience({
  parsed,
  yoe,
  setYoe,
  yoeAfterGrad,
  setYoeAfterGrad,
}: {
  parsed: ParsedResume | null;
  yoe: string;
  setYoe: (v: string) => void;
  yoeAfterGrad: string;
  setYoeAfterGrad: (v: string) => void;
}) {
  // Build the initial skills list from the parsed resume. If the resume parse
  // didn't return any skills, start empty and let the user add manually.
  const seeded: SkillYear[] = (parsed?.skills ?? []).map((s) => ({
    skill: s.skill,
    years: s.years ?? 0,
    level:
      s.level && ["Beginner", "Intermediate", "Advanced", "Expert"].includes(s.level)
        ? (s.level as SkillYear["level"])
        : "Intermediate",
  }));
  const [skills, setSkills] = useState<SkillYear[]>(seeded);
  const [newSkill, setNewSkill] = useState("");

  function addSkill() {
    const t = newSkill.trim();
    if (!t) return;
    if (skills.some((s) => s.skill.toLowerCase() === t.toLowerCase())) {
      setNewSkill("");
      return;
    }
    setSkills([...skills, { skill: t, years: 0, level: "Intermediate" }]);
    setNewSkill("");
  }

  return (
    <div>
      <StepHeader
        eyebrow="Step 4"
        title="How long have you been doing this?"
        body={
          parsed
            ? "We auto-extracted these from your resume. Tweak the years if anything's off — they go directly into screener answers."
            : "Upload your resume in step 1 to auto-fill, or add skills manually below."
        }
      />

      <SectionLabel className="mb-2">Total full-time work experience</SectionLabel>
      <Card className="p-4 mb-5">
        <p className="text-[12.5px] text-mute mb-3">
          For when a form asks "How many years of experience do you have?"
        </p>
        <div className="flex flex-wrap gap-2">
          {YOE_BUCKETS.map((bucket) => {
            const selected = yoe === bucket;
            return (
              <button
                key={bucket}
                type="button"
                onClick={() => setYoe(bucket)}
                className={`px-3 py-1.5 rounded-ctrl text-[13px] border transition-colors ${
                  selected
                    ? "border-ink/70 bg-[#EDE7D6] text-ink font-semibold"
                    : "border-line bg-white text-ink hover:border-ink/30"
                }`}
              >
                {bucket}
              </button>
            );
          })}
        </div>
      </Card>

      <SectionLabel className="mb-2">Years of experience after graduation</SectionLabel>
      <Card className="p-4 mb-8">
        <p className="text-[12.5px] text-mute mb-3">
          A different bucket — many forms ask this specifically (excludes internships and pre-grad
          work). Airtable, Stripe, others. Set this even if it overlaps your total above.
        </p>
        <div className="flex flex-wrap gap-2">
          {YOE_BUCKETS.map((bucket) => {
            const selected = yoeAfterGrad === bucket;
            return (
              <button
                key={`grad-${bucket}`}
                type="button"
                onClick={() => setYoeAfterGrad(bucket)}
                className={`px-3 py-1.5 rounded-ctrl text-[13px] border transition-colors ${
                  selected
                    ? "border-ink/70 bg-[#EDE7D6] text-ink font-semibold"
                    : "border-line bg-white text-ink hover:border-ink/30"
                }`}
              >
                {bucket}
              </button>
            );
          })}
        </div>
      </Card>

      {skills.length === 0 ? (
        <Card className="p-8 text-center">
          <Icon name="sparkles" size={20} className="text-mute mx-auto" />
          <p className="text-[13.5px] text-mute mt-3 max-w-md mx-auto">
            No skills detected from your resume yet. Add them below or skip — you can always edit
            later.
          </p>
        </Card>
      ) : (
        <>
          <SectionLabel className="mb-3">Per-skill experience · from your resume</SectionLabel>
          <Card className="divide-y divide-line">
            {skills.map((s, i) => (
              <SkillRow
                key={`${s.skill}-${i}`}
                skill={s}
                onChange={(updated) => {
                  const next = [...skills];
                  next[i] = updated;
                  setSkills(next);
                }}
                onRemove={() => setSkills(skills.filter((_, j) => j !== i))}
              />
            ))}
          </Card>
        </>
      )}

      <div className="mt-4 flex items-center gap-2">
        <input
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSkill();
            }
          }}
          placeholder="Add a skill (e.g. Python, AWS, SQL)…"
          className="h-9 flex-1 px-3 rounded-ctrl border border-line bg-white text-[13px] focus-ring"
        />
        <Button variant="secondary" size="sm" onClick={addSkill} leading={<Icon name="plus" size={12} />}>
          Add
        </Button>
      </div>
    </div>
  );
}

function SkillRow({
  skill,
  onRemove,
}: {
  skill: SkillYear;
  onChange: (s: SkillYear) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1">
        <div className="text-[14px] font-medium">{skill.skill}</div>
      </div>
      <button
        onClick={onRemove}
        className="text-mute hover:text-error text-[14px] -ml-1"
        aria-label="Remove"
      >
        ×
      </button>
    </div>
  );
}

/* ---------- Step 5: Preferences ---------- */
function OnbPreferences({
  prefs,
  setPrefs,
}: {
  prefs: PrefsForm;
  setPrefs: React.Dispatch<React.SetStateAction<PrefsForm>>;
}) {
  const [locInput, setLocInput] = useState("");
  const addLocation = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (prefs.locations.includes(t)) {
      setLocInput("");
      return;
    }
    setPrefs((p) => ({ ...p, locations: [...p.locations, t] }));
    setLocInput("");
  };
  const removeLocation = (l: string) =>
    setPrefs((p) => ({ ...p, locations: p.locations.filter((x) => x !== l) }));

  const togglePref = (k: keyof PrefsForm["workPreference"]) =>
    setPrefs((p) => ({ ...p, workPreference: { ...p.workPreference, [k]: !p.workPreference[k] } }));

  return (
    <div>
      <StepHeader
        eyebrow="Step 5"
        title="Your hard constraints."
        body="We'll never submit to anything outside these."
      />
      <div className="space-y-7">
        <div>
          <SectionLabel className="mb-3">Work authorization</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { v: "us_citizen_pr", label: "US citizen / Permanent resident" },
                { v: "needs_sponsorship", label: "Need sponsorship" },
                { v: "other", label: "Other" },
              ] as const
            ).map((o) => (
              <PrefPill
                key={o.v}
                active={prefs.workAuth === o.v}
                onClick={() => setPrefs((p) => ({ ...p, workAuth: o.v }))}
              >
                {o.label}
              </PrefPill>
            ))}
          </div>
          {prefs.workAuth === "other" && (
            <div className="mt-3">
              <Input
                value={prefs.workAuthOther}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, workAuthOther: e.target.value }))
                }
                placeholder="Describe — e.g. OPT, OPT STEM, TN visa, J-1 …"
              />
              <p className="text-[12px] text-mute mt-1.5">
                We send this verbatim when an application asks "describe your work
                authorization."
              </p>
            </div>
          )}
        </div>

        <div>
          <SectionLabel className="mb-3">
            Will you require sponsorship in the future?
          </SectionLabel>
          <p className="text-[12.5px] text-mute mb-3">
            Most forms ask this separately from current status. Even if you're authorized
            now, some employers want to know about future visa needs.
          </p>
          <div className="flex flex-wrap gap-2">
            <PrefPill
              active={prefs.futureSponsorship === "no"}
              onClick={() => setPrefs((p) => ({ ...p, futureSponsorship: "no" }))}
            >
              No
            </PrefPill>
            <PrefPill
              active={prefs.futureSponsorship === "yes"}
              onClick={() => setPrefs((p) => ({ ...p, futureSponsorship: "yes" }))}
            >
              Yes, eventually
            </PrefPill>
          </div>
        </div>

        <div>
          <SectionLabel className="mb-3">Willing to relocate?</SectionLabel>
          <p className="text-[12.5px] text-mute mb-3">
            Forms commonly ask "are you willing to relocate?" — independent of remote/hybrid
            preference.
          </p>
          <div className="flex flex-wrap gap-2">
            <PrefPill
              active={prefs.willingToRelocate === "no"}
              onClick={() => setPrefs((p) => ({ ...p, willingToRelocate: "no" }))}
            >
              No
            </PrefPill>
            <PrefPill
              active={prefs.willingToRelocate === "within_country"}
              onClick={() => setPrefs((p) => ({ ...p, willingToRelocate: "within_country" }))}
            >
              Yes, within my country
            </PrefPill>
            <PrefPill
              active={prefs.willingToRelocate === "anywhere"}
              onClick={() => setPrefs((p) => ({ ...p, willingToRelocate: "anywhere" }))}
            >
              Yes, anywhere
            </PrefPill>
          </div>
        </div>

        <div>
          <SectionLabel className="mb-3">Work preference</SectionLabel>
          <p className="text-[12.5px] text-mute mb-3">Pick any that work for you.</p>
          <div className="flex flex-wrap gap-2">
            <PrefPill active={prefs.workPreference.remote} onClick={() => togglePref("remote")}>
              <Icon name="globe" size={13} /> Remote
            </PrefPill>
            <PrefPill active={prefs.workPreference.hybrid} onClick={() => togglePref("hybrid")}>
              <Icon name="briefcase" size={13} /> Hybrid
            </PrefPill>
            <PrefPill active={prefs.workPreference.onsite} onClick={() => togglePref("onsite")}>
              <Icon name="home" size={13} /> On-site
            </PrefPill>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Minimum base salary" hint="We won't submit to postings below this.">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-mute pointer-events-none">
                $
              </span>
              <Input
                type="number"
                min={0}
                step={5}
                value={prefs.salaryMin}
                onChange={(e) => setPrefs((p) => ({ ...p, salaryMin: +e.target.value || 0 }))}
                className="!pl-7"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-mute pointer-events-none">
                k
              </span>
            </div>
          </Field>
          <Field label="Earliest start date">
            <Input
              type="date"
              value={prefs.earliestStartDate}
              onChange={(e) => setPrefs((p) => ({ ...p, earliestStartDate: e.target.value }))}
              required
            />
          </Field>
        </div>

        <div>
          <SectionLabel className="mb-2.5">Acceptable locations</SectionLabel>
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              {prefs.locations.map((l) => (
                <Chip key={l} tone="accent" onRemove={() => removeLocation(l)}>
                  {l}
                </Chip>
              ))}
              <input
                value={locInput}
                onChange={(e) => setLocInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLocation(locInput);
                  }
                }}
                placeholder={
                  prefs.locations.length === 0
                    ? "Type a location and press Enter (e.g. Remote (US), New York)…"
                    : "Add a location…"
                }
                className="flex-1 min-w-[200px] bg-transparent text-sm outline-none placeholder:text-mute py-1"
              />
            </div>
          </Card>
          <p className="text-[12px] text-mute mt-2">
            Examples: <span className="text-ink">Remote (US)</span>,{" "}
            <span className="text-ink">New York</span>,{" "}
            <span className="text-ink">San Francisco</span>,{" "}
            <span className="text-ink">London</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function PrefPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 px-3.5 text-[13px] rounded-ctrl border transition-colors focus-ring flex items-center gap-1.5 ${
        active
          ? "bg-accent-soft border-accent/40 text-accent-hover font-medium"
          : "bg-white border-line text-ink-soft hover:text-ink hover:border-line-hi"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- Step 6: Voice sample ---------- */
function OnbVoice({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  const status =
    words < 30
      ? `${words} words · keep going — at least 30`
      : words < 80
        ? `${words} words · ok, more helps`
        : `${words} words · plenty`;
  return (
    <div>
      <StepHeader
        eyebrow="Step 6"
        title="Two paragraphs in your own voice."
        body="Write like you're emailing a friend who runs a startup. We use this to keep tailored bullets and cover letters recognizably yours."
      />
      <Textarea
        rows={12}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a couple of paragraphs the way you'd actually talk…"
      />
      <div className="mt-3 flex items-center justify-between text-[12px] text-mute">
        <div className="flex items-center gap-1.5">
          <Icon name="sparkles" size={13} style={{ color: "var(--accent)" }} />
          We never copy your voice verbatim — we learn the rhythm and word choice.
        </div>
        <div className="tabular-nums">{status}</div>
      </div>
    </div>
  );
}

/* ---------- Step 7: Gmail connect ---------- */
type Privacy = { i: IconName; t: string; d: string };

function OnbGmail({
  connected,
  error,
}: {
  connected: boolean;
  error: string | null;
}) {
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
              <>
                <a href="/api/auth/google/start">
                  <Button
                    className="mt-5"
                    variant="primary"
                    leading={<Icon name="g-mail" size={14} />}
                  >
                    Connect with Google
                  </Button>
                </a>
                {error && (
                  <div className="mt-3 flex items-start gap-1.5 text-[12.5px] text-error">
                    <Icon name="alert-circle" size={13} className="mt-0.5 shrink-0" />
                    Couldn&apos;t connect: {error}
                  </div>
                )}
              </>
            ) : (
              <div
                className="mt-5 flex items-center gap-2 text-[13px] font-medium"
                style={{ color: "var(--accent-hi)" }}
              >
                <Icon name="check-circle" size={15} /> Connected
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
