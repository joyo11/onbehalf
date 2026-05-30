"use client";

import { useState, type ReactNode } from "react";
import { Ic } from "@/components/ob/icons";
import { Eyebrow } from "@/components/ob/primitives";

export type SettingsData = {
  email: string;
  memberSince: string;
  plan: string;
  gmailConnectedAt: string | null;
  profile: {
    fullName: string;
    preferredName: string;
    phone: string;
    location: string;
    linkedinUrl: string;
    githubUrl: string;
    portfolioUrl: string;
    targetRoleTitles: string[];
    preferredLocations: string[];
    excludedCompanies: string[];
    desiredSalaryMin: number | null;
    totalYearsExperience: string | null;
    seniorityLevel: string | null;
    workAuthorization: string | null;
    needsSponsorship: boolean | null;
    employmentRestrictions: boolean;
    previouslyWorkedHere: boolean;
    countryOfResidence: string;
    countryOfWork: string;
    accommodationsNeeded: string;
    voiceSample: string;
    eeoGender: string;
    eeoHispanicLatino: string;
    eeoRaceEthnicity: string;
    eeoVeteranStatus: string;
    eeoDisabilityStatus: string;
    resumeFileName: string | null;
  };
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

async function saveSection(patch: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/profile/section", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.ok;
}

export default function SettingsScreen({ data }: { data: SettingsData }) {
  const p = data.profile;

  return (
    <div className="max-w-[1180px] mx-auto px-5 sm:px-9 py-7 sm:py-9 pb-32">
      <Eyebrow tone="teal" className="mb-3">
        Profile &amp; settings
      </Eyebrow>
      <h1
        className="font-display font-black text-ink break-words"
        style={{ fontSize: "clamp(1.75rem, 4vw, 2.7rem)", lineHeight: 1.05, letterSpacing: "-0.03em" }}
      >
        {p.fullName || data.email.split("@")[0]}
      </h1>
      <p className="mt-2.5 text-[14px] text-ink-mute break-words">
        {data.email} <Dot /> Member since {data.memberSince} <Dot /> {data.plan}
      </p>

      <div className="mt-7 sm:mt-9 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 sm:gap-7">
        <div className="space-y-5 sm:space-y-7">
          <IdentitySection initial={p} />
          <CareerSection initial={p} />
          <EligibilitySection initial={p} />
          <VoiceSection initial={p} />
          <EEOSection initial={p} />
          <ResumeSection resumeFileName={p.resumeFileName} />
        </div>

        <div className="space-y-5 lg:sticky lg:top-9 self-start">
          <GmailCard connectedAt={data.gmailConnectedAt} />
          <RerunOnboardingCard />
        </div>
      </div>
    </div>
  );
}

/* ─── Identity ─────────────────────────────────────────────── */
function IdentitySection({ initial }: { initial: SettingsData["profile"] }) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [preferredName, setPreferredName] = useState(initial.preferredName);
  const [phone, setPhone] = useState(initial.phone);
  const [location, setLocation] = useState(initial.location);
  const [linkedinUrl, setLinkedinUrl] = useState(initial.linkedinUrl);
  const [githubUrl, setGithubUrl] = useState(initial.githubUrl);
  const [portfolioUrl, setPortfolioUrl] = useState(initial.portfolioUrl);

  return (
    <Section
      title="About you"
      onSave={() =>
        saveSection({ fullName, preferredName, phone, location, linkedinUrl, githubUrl, portfolioUrl })
      }
    >
      <Grid2>
        <Field label="Full name" value={fullName} onChange={setFullName} />
        <Field
          label="Preferred name for interviews"
          value={preferredName}
          onChange={setPreferredName}
          placeholder={fullName.split(/\s+/)[0]}
        />
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 555 123 4567" />
        <Field label="Location" value={location} onChange={setLocation} placeholder="Brooklyn, NY" />
      </Grid2>
      <Grid2>
        <Field label="LinkedIn URL" value={linkedinUrl} onChange={setLinkedinUrl} placeholder="https://linkedin.com/in/…" />
        <Field label="GitHub URL" value={githubUrl} onChange={setGithubUrl} placeholder="https://github.com/…" />
      </Grid2>
      <Field label="Portfolio / Website" value={portfolioUrl} onChange={setPortfolioUrl} placeholder="https://" />
    </Section>
  );
}

/* ─── Career preferences ────────────────────────────────────── */
const YOE_OPTIONS = ["0-2", "3-5", "6-8", "9-12", "13+"];
const LEVEL_OPTIONS = ["junior", "mid", "senior", "staff", "principal"] as const;
const LEVEL_LABEL: Record<(typeof LEVEL_OPTIONS)[number], string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal+",
};

function CareerSection({ initial }: { initial: SettingsData["profile"] }) {
  const [roles, setRoles] = useState<string[]>(initial.targetRoleTitles);
  const [locations, setLocations] = useState<string[]>(initial.preferredLocations);
  const [excluded, setExcluded] = useState<string[]>(initial.excludedCompanies);
  const [salary, setSalary] = useState<number>(
    initial.desiredSalaryMin ? Math.round(initial.desiredSalaryMin / 1000) : 150,
  );
  const [yoe, setYoe] = useState<string | null>(initial.totalYearsExperience);
  const [level, setLevel] = useState<string | null>(initial.seniorityLevel);

  return (
    <Section
      title="Career preferences"
      onSave={() =>
        saveSection({
          targetRoleTitles: roles,
          preferredLocations: locations,
          excludedCompanies: excluded,
          desiredSalaryMin: salary * 1000,
          totalYearsExperience: yoe,
          seniorityLevel: level,
        })
      }
    >
      <Stack>
        <FieldLabel>Target roles</FieldLabel>
        <ChipInput chips={roles} onChange={setRoles} placeholder="Add a role…" tone="accent" />

        <FieldLabel>Preferred locations</FieldLabel>
        <ChipInput chips={locations} onChange={setLocations} placeholder="Add a city or Remote (Region)…" />

        <FieldLabel>Companies to exclude</FieldLabel>
        <ChipInput chips={excluded} onChange={setExcluded} placeholder="Add a company…" />

        <FieldLabel>Minimum base salary</FieldLabel>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={80}
            max={400}
            step={5}
            value={salary}
            onChange={(e) => setSalary(+e.target.value)}
            className="flex-1 h-1.5 rounded-full"
            style={{
              backgroundImage: `linear-gradient(to right, #0D9488 0%, #0D9488 ${
                ((salary - 80) / 320) * 100
              }%, #EDE7D6 ${((salary - 80) / 320) * 100}%, #EDE7D6 100%)`,
            }}
          />
          <span className="font-display font-black text-ink text-[22px] tabular w-[100px] text-right">
            ${salary}k
          </span>
        </div>

        <FieldLabel>Years of experience</FieldLabel>
        <PillRow
          options={YOE_OPTIONS.map((v) => ({ value: v, label: `${v} yrs` }))}
          value={yoe}
          onChange={setYoe}
        />

        <FieldLabel>Seniority level</FieldLabel>
        <PillRow
          options={LEVEL_OPTIONS.map((v) => ({ value: v, label: LEVEL_LABEL[v] }))}
          value={level}
          onChange={setLevel}
        />
      </Stack>
    </Section>
  );
}

/* ─── Work eligibility ──────────────────────────────────────── */
function EligibilitySection({ initial }: { initial: SettingsData["profile"] }) {
  const [workAuth, setWorkAuth] = useState<string | null>(initial.workAuthorization);
  const [needsSponsorship, setNeedsSponsorship] = useState<boolean>(initial.needsSponsorship ?? false);
  const [restrictions, setRestrictions] = useState<boolean>(initial.employmentRestrictions);
  const [previouslyWorked, setPreviouslyWorked] = useState<boolean>(initial.previouslyWorkedHere);
  const [residence, setResidence] = useState(initial.countryOfResidence);
  const [work, setWork] = useState(initial.countryOfWork);
  const [accommodations, setAccommodations] = useState(initial.accommodationsNeeded);

  return (
    <Section
      title="Work eligibility"
      onSave={() =>
        saveSection({
          workAuthorization: workAuth,
          needsSponsorship,
          employmentRestrictions: restrictions,
          previouslyWorkedHere: previouslyWorked,
          countryOfResidence: residence,
          countryOfWork: work,
          accommodationsNeeded: accommodations,
        })
      }
    >
      <Stack>
        <FieldLabel>Work authorization</FieldLabel>
        <PillRow
          options={[
            { value: "us_citizen_pr", label: "US Citizen / Permanent Resident" },
            { value: "needs_sponsorship", label: "Need sponsorship" },
            { value: "other", label: "Other" },
          ]}
          value={workAuth}
          onChange={(v) => {
            setWorkAuth(v);
            setNeedsSponsorship(v === "needs_sponsorship");
          }}
        />

        <Toggle
          label="Will need visa sponsorship now or in the future"
          value={needsSponsorship}
          onChange={setNeedsSponsorship}
        />
        <Toggle
          label="Subject to non-compete or post-employment restrictions"
          value={restrictions}
          onChange={setRestrictions}
        />
        <Toggle
          label="Previously worked at or consulted for any of my target companies"
          value={previouslyWorked}
          onChange={setPreviouslyWorked}
        />

        <Grid2>
          <Field label="Country of residence" value={residence} onChange={setResidence} placeholder="United States" />
          <Field label="Country you'd work from" value={work} onChange={setWork} placeholder="United States" />
        </Grid2>

        <FieldLabel>Interview accommodations (optional)</FieldLabel>
        <textarea
          value={accommodations}
          onChange={(e) => setAccommodations(e.target.value)}
          rows={3}
          placeholder="None at this time."
          className="w-full text-[14px] text-ink leading-relaxed bg-white border border-sand-200 rounded-xl2 px-3.5 py-2.5 outline-none focus:border-teal-500 placeholder:text-ink-faint"
        />
      </Stack>
    </Section>
  );
}

/* ─── Voice ─────────────────────────────────────────────────── */
function VoiceSection({ initial }: { initial: SettingsData["profile"] }) {
  const [voice, setVoice] = useState(initial.voiceSample);
  return (
    <Section
      title="Your voice"
      hint="Two paragraphs in your own words. Claude tailors cover letters to sound like this."
      onSave={() => saveSection({ voiceSample: voice })}
    >
      <textarea
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
        rows={8}
        placeholder="Write 2 short paragraphs in your real voice…"
        className="w-full text-[14px] text-ink leading-relaxed bg-white border border-sand-200 rounded-xl2 px-3.5 py-2.5 outline-none focus:border-teal-500 placeholder:text-ink-faint"
      />
    </Section>
  );
}

/* ─── EEO ───────────────────────────────────────────────────── */
const EEO_DECLINE = "decline";
const GENDER_OPTIONS = [
  { value: "decline", label: "Decline to answer" },
  { value: "man", label: "Man" },
  { value: "woman", label: "Woman" },
  { value: "non_binary", label: "Non-binary" },
  { value: "other", label: "Other" },
];
const YESNO_OPTIONS = [
  { value: "decline", label: "Decline to answer" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const RACE_OPTIONS = [
  { value: "decline", label: "Decline to answer" },
  { value: "asian", label: "Asian" },
  { value: "black", label: "Black or African American" },
  { value: "hispanic_latino", label: "Hispanic / Latino" },
  { value: "native_american", label: "Native American / Alaska Native" },
  { value: "pacific_islander", label: "Native Hawaiian / Pacific Islander" },
  { value: "white", label: "White" },
  { value: "two_or_more", label: "Two or more races" },
];
const VETERAN_OPTIONS = [
  { value: "decline", label: "Decline to answer" },
  { value: "yes_protected", label: "Yes, I am a protected veteran" },
  { value: "no", label: "No, I am not a veteran" },
];
const DISABILITY_OPTIONS = [
  { value: "decline", label: "Decline to answer" },
  { value: "yes", label: "Yes, I have a disability" },
  { value: "no", label: "No, I don't have a disability" },
];

function EEOSection({ initial }: { initial: SettingsData["profile"] }) {
  const [gender, setGender] = useState(initial.eeoGender || EEO_DECLINE);
  const [hispanic, setHispanic] = useState(initial.eeoHispanicLatino || EEO_DECLINE);
  const [race, setRace] = useState(initial.eeoRaceEthnicity || EEO_DECLINE);
  const [veteran, setVeteran] = useState(initial.eeoVeteranStatus || EEO_DECLINE);
  const [disability, setDisability] = useState(initial.eeoDisabilityStatus || EEO_DECLINE);

  return (
    <Section
      title="Demographic defaults (EEO)"
      hint="Greenhouse forms ask these on every application. We fill what you pick — 'Decline' is the default."
      onSave={() =>
        saveSection({
          eeoGender: gender,
          eeoHispanicLatino: hispanic,
          eeoRaceEthnicity: race,
          eeoVeteranStatus: veteran,
          eeoDisabilityStatus: disability,
        })
      }
    >
      <Stack>
        <SelectField label="Gender" options={GENDER_OPTIONS} value={gender} onChange={setGender} />
        <SelectField label="Hispanic or Latino" options={YESNO_OPTIONS} value={hispanic} onChange={setHispanic} />
        <SelectField label="Race / Ethnicity" options={RACE_OPTIONS} value={race} onChange={setRace} />
        <SelectField label="Veteran status" options={VETERAN_OPTIONS} value={veteran} onChange={setVeteran} />
        <SelectField label="Disability status" options={DISABILITY_OPTIONS} value={disability} onChange={setDisability} />
      </Stack>
    </Section>
  );
}

/* ─── Resume ───────────────────────────────────────────────── */
function ResumeSection({ resumeFileName }: { resumeFileName: string | null }) {
  return (
    <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="font-display font-bold text-ink text-[19px]">Resume</p>
      </div>
      <div className="bg-sand-50 border border-sand-200 rounded-xl2 p-4 flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl2 bg-white border border-sand-200 flex items-center justify-center shrink-0">
          <Ic.doc className="h-5 w-5 text-ink-mute" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink text-[14px] truncate">
            {resumeFileName ?? "No resume on file"}
          </p>
          <p className="text-[12.5px] text-ink-mute mt-0.5">
            Master resume used as the base before tailoring each application.
          </p>
        </div>
        {resumeFileName && (
          <a
            href="/api/profile/resume-pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white border border-sand-200 text-[13px] font-semibold text-ink hover:border-ink/30 transition-colors"
          >
            <Ic.download className="h-3.5 w-3.5" /> Download
          </a>
        )}
      </div>
      <a
        href="/onboarding"
        className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-700 hover:text-teal-800"
      >
        Replace resume <Ic.arrow className="h-3 w-3" />
      </a>
    </div>
  );
}

/* ─── Right rail ────────────────────────────────────────────── */
function GmailCard({ connectedAt }: { connectedAt: string | null }) {
  return (
    <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-5">
      <div className="flex items-center justify-between mb-2.5">
        <Eyebrow>Gmail</Eyebrow>
        <Ic.mail className="h-[17px] w-[17px] text-ink-faint" />
      </div>
      {connectedAt ? (
        <>
          <p className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-teal-700">
            <Ic.checkCircle className="h-4 w-4" /> Connected
          </p>
          <p className="text-[13px] text-ink-mute mt-2 leading-relaxed">
            Since {connectedAt}. We check daily for confirmation emails.
          </p>
        </>
      ) : (
        <>
          <p className="text-[13px] text-ink-mute leading-relaxed">
            Optional — connect to auto-mark applications as Confirmed.
          </p>
          <a
            href="/api/auth/google/start"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-700 hover:text-teal-800"
          >
            Connect Gmail <Ic.arrow className="h-3 w-3" />
          </a>
        </>
      )}
    </div>
  );
}

function RerunOnboardingCard() {
  return (
    <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-5">
      <Eyebrow className="mb-2.5">Onboarding</Eyebrow>
      <p className="text-[13px] text-ink-mute leading-relaxed">
        Re-upload your resume or rewrite your voice sample from scratch.
      </p>
      <a
        href="/onboarding"
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-700 hover:text-teal-800"
      >
        Run onboarding <Ic.arrow className="h-3 w-3" />
      </a>
    </div>
  );
}

/* ═══════════════ Building blocks ═══════════════ */
function Section({
  title,
  hint,
  children,
  onSave,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  onSave: () => Promise<boolean>;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  return (
    <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="font-display font-bold text-ink text-[19px]">{title}</p>
          {hint && <p className="text-[12.5px] text-ink-mute mt-1 max-w-[40rem]">{hint}</p>}
        </div>
        <button
          onClick={async () => {
            setStatus("saving");
            const ok = await onSave().catch(() => false);
            setStatus(ok ? "saved" : "error");
            if (ok) setTimeout(() => setStatus("idle"), 1800);
          }}
          disabled={status === "saving"}
          className={
            "inline-flex items-center gap-1.5 rounded-full text-[13px] font-semibold px-4 py-2 transition-colors " +
            (status === "saved"
              ? "bg-sage-100 text-sage-700"
              : status === "error"
                ? "bg-coral-100 text-coral-700"
                : "bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-60")
          }
        >
          {status === "saving" ? (
            "Saving…"
          ) : status === "saved" ? (
            <>
              <Ic.check className="h-3.5 w-3.5" /> Saved
            </>
          ) : status === "error" ? (
            "Retry"
          ) : (
            "Save"
          )}
        </button>
      </div>
      {children}
    </div>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

function Grid2({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-semibold text-ink-mute uppercase tracking-[0.05em]">{children}</p>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-ink-mute uppercase tracking-[0.05em] mb-1.5">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-[14px] text-ink bg-white border border-sand-200 rounded-xl2 px-3.5 py-2.5 outline-none focus:border-teal-500 placeholder:text-ink-faint"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-ink-mute uppercase tracking-[0.05em] mb-1.5">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[14px] text-ink bg-white border border-sand-200 rounded-xl2 px-3.5 py-2.5 outline-none focus:border-teal-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PillRow({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}
          className={
            "h-9 px-3.5 rounded-full border text-[13px] font-semibold transition-colors " +
            (value === o.value
              ? "bg-teal-500 border-teal-500 text-white"
              : "bg-white border-sand-200 text-ink hover:border-ink/30")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
      <span className="text-[14px] text-ink-soft">{label}</span>
      <button
        onClick={(e) => {
          e.preventDefault();
          onChange(!value);
        }}
        className={
          "relative w-11 h-6 rounded-full transition-colors shrink-0 " +
          (value ? "bg-teal-500" : "bg-sand-200")
        }
      >
        <span
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: value ? "translateX(20px)" : "translateX(0)" }}
        />
      </button>
    </label>
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
  const [input, setInput] = useState("");
  const add = (v: string) => {
    const t = v.trim();
    if (t && !chips.includes(t)) onChange([...chips, t]);
    setInput("");
  };
  return (
    <div className="bg-white border border-sand-200 rounded-xl2 px-3.5 py-2.5 flex flex-wrap items-center gap-2 min-h-[44px]">
      {chips.map((c) => (
        <span
          key={c}
          className={
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium " +
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

function Dot() {
  return <span className="text-sand-300 mx-1.5">·</span>;
}
