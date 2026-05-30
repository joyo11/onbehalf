"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Ic } from "@/components/ob/icons";
import {
  BRAND,
  CompanyTile,
  Eyebrow,
  ObLogo,
  StatusPill,
  type Status,
} from "@/components/ob/primitives";

export default function LandingScreen() {
  return (
    <div className="min-h-screen bg-cream">
      <TopNav />
      <Hero />
      <HowItWorks />
      <Footer />
    </div>
  );
}

function SignedIn({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded || !isSignedIn) return null;
  return <>{children}</>;
}

function SignedOut({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded || isSignedIn) return null;
  return <>{children}</>;
}

/* ───────────────────────── Top Nav ───────────────────────── */
function TopNav() {
  const { user } = useUser();
  const initials =
    (user?.firstName?.[0] ?? user?.primaryEmailAddress?.emailAddress?.[0] ?? "S")
      .toUpperCase() +
    (user?.lastName?.[0] ?? "").toUpperCase();
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-cream/80 border-b border-sand-200/70">
      <div className="max-w-[1180px] mx-auto px-7 h-[74px] flex items-center justify-between">
        <Link href="/">
          <ObLogo />
        </Link>
        <nav className="hidden md:flex items-center gap-9 text-[15px] font-semibold text-ink-mute">
          <a href="#how" className="hover:text-ink transition-colors">
            How it works
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <SignedOut>
            <Link
              href="/sign-in"
              className="text-[15px] font-semibold text-ink-mute hover:text-ink transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[15px] pl-5 pr-4 py-2.5 transition-colors"
            >
              Get started
              <Ic.arrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[15px] pl-5 pr-4 py-2.5 transition-colors"
            >
              Open dashboard
              <Ic.arrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <div className="h-9 w-9 rounded-full bg-teal-500 text-white grid place-items-center font-bold text-[13px]">
              {initials || "SJ"}
            </div>
          </SignedIn>
        </div>
      </div>
    </header>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function Cascade({
  text,
  className = "",
  base = 0,
  step = 50,
  italic = false,
  color,
}: {
  text: string;
  className?: string;
  base?: number;
  step?: number;
  italic?: boolean;
  color?: string;
}) {
  let i = 0;
  const words = text.split(" ");
  return (
    <span className={className} style={color ? { color } : undefined}>
      {words.map((word, wi) => (
        <span key={wi}>
          {word && (
            <span style={{ whiteSpace: "nowrap", display: "inline-block" }}>
              {word.split("").map((ch, ci) => {
                const d = base + i * step;
                i++;
                return (
                  <span
                    key={ci}
                    className="ob-letter"
                    style={{
                      transitionDelay: d + "ms",
                      fontStyle: italic ? "italic" : "normal",
                    }}
                  >
                    {ch}
                  </span>
                );
              })}
            </span>
          )}
          {wi < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

function LiveCard() {
  const seq: Status[] = ["matching", "tailoring", "submitting", "submitted", "confirmed"];
  const [i, setI] = useState(0);
  const meta: Record<string, { note: string; idx: string; pct: number }> = {
    matching: { note: "Scanning 40 open roles", idx: "01 / 05", pct: 14 },
    tailoring: { note: "Rewriting 4 bullets · 12s", idx: "02 / 05", pct: 44 },
    submitting: { note: "Filling the application form", idx: "03 / 05", pct: 72 },
    submitted: { note: "Sent · confirmation pending", idx: "04 / 05", pct: 92 },
    confirmed: { note: "Recruiter replied — you're in", idx: "05 / 05", pct: 100 },
  };
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % seq.length), 1900);
    return () => clearInterval(t);
  }, [seq.length]);
  const status = seq[i];
  const m = meta[status];
  const pct = m.pct;
  const barColor = status === "confirmed" ? "#7A8B3F" : "#0D9488";
  return (
    <div className="relative ob-fade-up" style={{ transitionDelay: "650ms" }}>
      <div className="absolute -top-6 left-1 z-10">
        <Eyebrow tone="teal" className="whitespace-nowrap">
          Live preview
        </Eyebrow>
      </div>
      <div className="relative bg-white rounded-xl3 ob-card-shadow-lg border border-sand-200 p-6 w-[400px] max-w-full">
        <div className="absolute -bottom-3 left-6 flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 ob-card-shadow border border-sand-200">
          <span className="h-2 w-2 rounded-full bg-teal-500 ob-blink" />
          <span className="text-[12px] font-bold text-teal-700 tracking-wide">LIVE</span>
        </div>
        <div className="flex items-start gap-3.5">
          <CompanyTile letter="L" color={BRAND.Linear.color} size={46} radius={13} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[0.14em] text-ink-faint uppercase">Linear</p>
            <p className="font-display font-bold text-ink text-[18px] leading-tight mt-0.5">
              Senior Product Engineer, Workflows
            </p>
            <p className="text-[13px] text-ink-mute mt-1">Remote (US) · $185k – $230k</p>
          </div>
          <div className="relative h-12 w-12 shrink-0 grid place-items-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="#EDE7D6" strokeWidth="4" />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="#0D9488"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 20}
                strokeDashoffset={2 * Math.PI * 20 * (1 - 0.92)}
              />
            </svg>
            <span className="font-display font-bold text-teal-700 text-[15px]">92</span>
          </div>
        </div>
        <div className="my-5 h-px bg-sand-200" />
        <div className="flex items-center justify-between">
          <StatusPill status={status} />
          <span className="font-mono text-[12px] text-ink-faint">{m.idx}</span>
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-sand-100 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: pct + "%",
              background: barColor,
              transition:
                "width 700ms cubic-bezier(0.22,1,0.36,1), background-color 600ms ease",
            }}
          />
        </div>
        <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-mute">
          {status === "confirmed" ? (
            <Ic.checkCircle className="h-3.5 w-3.5" style={{ color: "#7A8B3F" }} />
          ) : (
            <Ic.spark className="h-3.5 w-3.5 text-teal-500" />
          )}
          {m.note}
        </p>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="max-w-[1180px] mx-auto px-7 pt-16 pb-24 grid lg:grid-cols-[1.12fr_0.88fr] gap-12 items-center">
      <div>
        <h1
          className="font-display font-black text-ink"
          style={{ fontSize: "clamp(2rem, 5vw, 4.6rem)", lineHeight: 0.98, letterSpacing: "-0.035em" }}
        >
          <span className="block">
            <Cascade text="AI that " base={120} />
            <Cascade text="applies" base={460} italic color="#0D9488" />
          </span>
          <span className="block">
            <Cascade text="for you." base={820} />
          </span>
        </h1>

        <p
          className="mt-7 text-[18px] text-ink-mute leading-relaxed max-w-[30rem] ob-fade-up"
          style={{ transitionDelay: "1100ms" }}
        >
          Upload your resume, set your bar, and wake up to confirmation emails. Onbehalf tailors every
          submission and forwards only the ones worth your time.
        </p>

        <div
          className="mt-8 flex flex-wrap items-center gap-3 ob-fade-up"
          style={{ transitionDelay: "1250ms" }}
        >
          <SignedOut>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2.5 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[16px] pl-7 pr-6 py-3.5 transition-colors ob-card-shadow"
            >
              Get started
              <Ic.arrow className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2.5 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[16px] pl-7 pr-6 py-3.5 transition-colors ob-card-shadow"
            >
              Open your dashboard
              <Ic.arrow className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1" />
            </Link>
          </SignedIn>
          <a
            href="#how"
            className="inline-flex items-center gap-2.5 rounded-full bg-white hover:bg-sand-50 border border-sand-200 text-ink font-semibold text-[16px] px-6 py-3.5 transition-colors"
          >
            <Ic.play className="h-4 w-4 text-teal-600" />
            See how it works
          </a>
        </div>

        <div
          className="mt-9 flex flex-wrap gap-x-7 gap-y-2 text-[14px] text-ink-mute ob-fade-up"
          style={{ transitionDelay: "1400ms" }}
        >
          {["No card required", "Tailored per role", "Real Gmail confirmations"].map((t) => (
            <span key={t} className="inline-flex items-center gap-2">
              <Ic.check className="h-4 w-4 text-teal-500" />
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-center lg:justify-end">
        <LiveCard />
      </div>
    </section>
  );
}

/* ───────────────────────── How it works ───────────────────────── */
function Step({
  n,
  title,
  body,
  icon,
  delay,
}: {
  n: number;
  title: string;
  body: string;
  icon: (p: { className?: string }) => React.JSX.Element;
  delay: number;
}) {
  const Icon = icon;
  return (
    <div className="ob-fade-up" style={{ transitionDelay: delay + "ms" }}>
      <div className="h-12 w-12 rounded-xl2 bg-teal-50 border border-teal-100 grid place-items-center text-teal-600 mb-5">
        <Icon className="h-[22px] w-[22px]" />
      </div>
      <p className="font-mono text-[13px] text-ink-faint mb-1">0{n}</p>
      <h3 className="font-display font-bold text-ink text-[22px] leading-snug mb-2.5">{title}</h3>
      <p className="text-[15px] text-ink-mute leading-relaxed">{body}</p>
    </div>
  );
}

function HowItWorks() {
  return (
    <section
      id="how"
      className="max-w-[1180px] mx-auto px-7 py-20 border-t border-sand-200"
    >
      <Eyebrow tone="teal" className="mb-4">
        How it works
      </Eyebrow>
      <h2
        className="font-display font-black text-ink max-w-[20ch]"
        style={{ fontSize: "clamp(2.2rem, 4vw, 3.4rem)", lineHeight: 1.02, letterSpacing: "-0.03em" }}
      >
        Three steps, then it runs on its own.
      </h2>
      <div className="mt-14 grid md:grid-cols-3 gap-12">
        <Step
          n={1}
          icon={Ic.doc}
          delay={0}
          title="Upload your resume + voice sample"
          body='A two-paragraph "this is how I sound" is enough. It learns your tone, then keeps every tailored bullet recognizably yours.'
        />
        <Step
          n={2}
          icon={Ic.spark}
          delay={90}
          title="Set your bar"
          body="Pick roles, locations, salary, and what to skip. Auto-submit when match > 85, or review each one over coffee — your call."
        />
        <Step
          n={3}
          icon={Ic.mail}
          delay={180}
          title="Wake up to confirmations"
          body="It tails your Gmail (read-only) and surfaces real confirmation emails — not bounced applications, not silence."
        />
      </div>
    </section>
  );
}

/* ───────────────────────── Footer ───────────────────────── */
function Footer() {
  return (
    <footer className="max-w-[1180px] mx-auto px-7 py-16 border-t border-sand-200">
      <div className="flex flex-col md:flex-row justify-between gap-8">
        <div className="max-w-[34ch]">
          <ObLogo />
          <p className="mt-4 text-[14px] text-ink-mute leading-relaxed">
            Onbehalf is a job-application agent. It tailors every submission, tracks confirmations,
            and only wakes you when there&apos;s good news.
          </p>
        </div>
        <div className="flex gap-12 text-[15px] font-semibold text-ink-mute">
          <a href="#how" className="hover:text-ink">
            How it works
          </a>
          <Link href="/sign-in" className="hover:text-ink">
            Sign in
          </Link>
        </div>
      </div>
      <p className="mt-10 text-[13px] text-ink-faint">© 2026 Onbehalf.</p>
    </footer>
  );
}
