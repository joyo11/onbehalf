"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { MatchScore } from "@/components/ui/match-score";
import { Monogram } from "@/components/ui/monogram";
import { StatusPill } from "@/components/ui/status-pill";
import { Wordmark } from "@/components/ui/wordmark";
import type { Status } from "@/lib/types";

export default function LandingScreen() {
  return (
    <div className="w-full">
      <LandingNav />
      <LandingHero />
      <LandingHowItWorks />
      <LandingStats />
      <LandingPricing />
      <LandingFooter />
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

/* ---------- Top nav (marketing) ---------- */
function LandingNav() {
  return (
    <nav className="sticky top-0 z-30 bg-sand/85 backdrop-blur border-b border-line/60">
      <div className="max-w-[1120px] mx-auto h-16 px-6 flex items-center justify-between">
        <Wordmark size={20} />
        <div className="flex items-center gap-8 text-sm text-mute">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#pricing" className="hover:text-ink">Pricing</a>
          <SignedOut>
            <Link href="/sign-in" className="hover:text-ink">Sign in</Link>
            <Link href="/sign-up">
              <Button variant="primary" size="sm" trailing={<Icon name="arrow-right" size={14} />}>
                Get started
              </Button>
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard">
              <Button variant="primary" size="sm" trailing={<Icon name="arrow-right" size={14} />}>
                Open dashboard
              </Button>
            </Link>
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </nav>
  );
}

/* ---------- Hero ---------- */
function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-[0.55] pointer-events-none" aria-hidden />
      <div
        className="absolute -top-40 -left-32 w-[640px] h-[640px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(13,148,136,0.10) 0%, rgba(13,148,136,0) 60%)" }}
        aria-hidden
      />
      <div className="relative max-w-[1120px] mx-auto px-6 pt-20 pb-24 grid grid-cols-12 gap-12">
        <div className="col-span-7 flex flex-col justify-center">
          <h1 className="text-[64px] font-semibold tracking-[-0.025em]" style={{ lineHeight: 1.04 }}>
            AI that <span className="italic" style={{ color: "var(--accent-hi)", fontWeight: 500 }}>applies</span> to jobs
            <br /> on your behalf.
          </h1>
          <p className="mt-6 text-[18px] text-mute lh-body max-w-[520px]">
            Upload your resume. Tell us what you want. Wake up to confirmation emails.
            Onbehalf tailors every submission and only forwards the ones worth your time.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <SignedOut>
              <Link href="/sign-up">
                <Button size="lg" variant="primary" trailing={<Icon name="arrow-right" size={15} />}>
                  Get started — it&apos;s free
                </Button>
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard">
                <Button size="lg" variant="primary" trailing={<Icon name="arrow-right" size={15} />}>
                  Open your dashboard
                </Button>
              </Link>
            </SignedIn>
            <Button variant="secondary" size="lg" leading={<Icon name="play" size={14} />}>
              Watch 90-second demo
            </Button>
          </div>
          <div className="mt-8 flex items-center gap-6 text-[12.5px] text-mute">
            <span className="flex items-center gap-1.5"><Icon name="check" size={14} /> No card required</span>
            <span className="flex items-center gap-1.5"><Icon name="check" size={14} /> 5 applications free</span>
            <span className="flex items-center gap-1.5"><Icon name="check" size={14} /> Read-only Gmail access</span>
          </div>
        </div>

        <div className="col-span-5 flex items-center">
          <CyclingApplicationCard />
        </div>
      </div>
    </section>
  );
}

/* ---------- Cycling application card ----------
   One application card whose status cycles through the lifecycle.
   Demonstrates the agent loop without faking the whole product. */

type StageKey = "queued" | "tailoring" | "submitting" | "submitted" | "confirmed";

type Stage = {
  status: Status;
  note: string;
  noteIcon: IconName;
};

const STAGES: Stage[] = [
  { status: "queued",     note: "In queue · est. 2 min",       noteIcon: "clock" },
  { status: "tailoring",  note: "Rewriting 4 bullets · 12 sec", noteIcon: "sparkles" },
  { status: "submitting", note: "Filling 23-question form",     noteIcon: "paper-plane" },
  { status: "submitted",  note: "Awaiting confirmation email",  noteIcon: "mail" },
  { status: "confirmed",  note: "Confirmation #LIN-2148 received", noteIcon: "check-circle" },
];

function CyclingApplicationCard() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % STAGES.length), 2200);
    return () => clearInterval(id);
  }, []);

  const stage = STAGES[i];

  return (
    <div className="relative w-full">
      <Card className="overflow-hidden shadow-float p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Monogram name="Linear" size={40} />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-mute mb-1">
                Linear
              </div>
              <div className="text-[14.5px] font-semibold text-ink leading-snug truncate">
                Senior Product Engineer, Workflows
              </div>
              <div className="text-[12px] text-mute mt-0.5">
                Remote (US) · $185k – $230k
              </div>
            </div>
          </div>
          <MatchScore score={92} size={44} stroke={4} />
        </div>

        <div className="mt-5 pt-4 border-t border-line">
          <div className="flex items-center justify-between gap-3">
            <div key={stage.status} className="anim-slide-in">
              <StatusPill status={stage.status} />
            </div>
            <span className="text-[11px] tabular-nums text-mute">
              {String(i + 1).padStart(2, "0")} / {String(STAGES.length).padStart(2, "0")}
            </span>
          </div>
          <div
            key={`${stage.status}-note`}
            className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-soft anim-slide-in"
          >
            <Icon name={stage.noteIcon} size={13} style={{ color: "var(--accent)" }} />
            {stage.note}
          </div>
        </div>
      </Card>

      <div
        className="absolute -bottom-4 -left-4 z-10 hidden md:block pointer-events-none"
        style={{ animation: "pulseFloat 2.2s ease-in-out infinite" }}
      >
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10.5px] font-medium shadow-pop"
          style={{ background: "#FFFFFF", color: "var(--accent-hi)", border: "1px solid #E7E5E0" }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--accent)", animation: "pulse-dot 1.6s ease-in-out infinite" }}
          />
          live
        </div>
      </div>
      <style>{`@keyframes pulseFloat { 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-3px); } }`}</style>
    </div>
  );
}

/* ---------- How it works ---------- */
type Step = { n: string; icon: IconName; title: string; body: string };

function LandingHowItWorks() {
  const steps: Step[] = [
    {
      n: "01",
      icon: "file",
      title: "Upload your resume + voice sample",
      body: 'A two-paragraph "this is how I sound" is enough. We learn your tone, then keep every tailored bullet recognizably yours.',
    },
    {
      n: "02",
      icon: "sparkles",
      title: "Set your bar",
      body: "Pick roles, locations, salary, and what to skip. Auto-submit when match > 85, or review each one over coffee — your call.",
    },
    {
      n: "03",
      icon: "paper-plane",
      title: "Wake up to confirmations",
      body: "We tail your Gmail (read-only) and surface real confirmation emails — not bounced applications, not silence.",
    },
  ];
  return (
    <section id="how" className="relative max-w-[1120px] mx-auto px-6 pt-16 pb-24">
      <SectionLabel>How it works</SectionLabel>
      <h2 className="mt-3 text-[40px] font-semibold tracking-[-0.02em] max-w-[640px]" style={{ lineHeight: 1.08 }}>
        Three steps, then it runs while you sleep.
      </h2>
      <div className="mt-12 grid grid-cols-3 gap-6">
        {steps.map((s) => (
          <div key={s.n} className="relative">
            <div
              className="w-11 h-11 rounded-md flex items-center justify-center mb-5"
              style={{ background: "var(--accent-soft)", color: "var(--accent-hi)" }}
            >
              <Icon name={s.icon} size={20} />
            </div>
            <div className="font-mono text-[11px] text-mute tracking-wider">{s.n}</div>
            <h3 className="mt-1 text-[19px] font-semibold">{s.title}</h3>
            <p className="mt-2 text-[14.5px] text-mute lh-body">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Stats strip ---------- */
function LandingStats() {
  const stats = [
    { v: "4.2 min", l: "Average time to first confirmed application" },
    { v: "34%", l: "Of submissions get a recruiter reply within 7 days" },
    { v: "12,400", l: "Applications submitted by Onbehalf this week" },
    { v: "$0", l: "Charged until you upgrade past the free tier" },
  ];
  return (
    <section className="border-y border-line bg-white">
      <div className="max-w-[1120px] mx-auto px-6 py-10 grid grid-cols-4 gap-8">
        {stats.map((s) => (
          <div key={s.l}>
            <div className="text-[28px] font-semibold tracking-[-0.02em] tabular-nums">{s.v}</div>
            <div className="text-[12.5px] text-mute mt-1.5 lh-body">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Pricing ---------- */
type Plan = {
  name: string;
  price: string;
  sub: string;
  features: string[];
  cta: string;
  featured: boolean;
};

function LandingPricing() {
  const plans: Plan[] = [
    {
      name: "Free",
      price: "$0",
      sub: "forever",
      features: ["5 applications / month", "Review each before submit", "Gmail confirmation tracking", "1 voice sample"],
      cta: "Start free",
      featured: false,
    },
    {
      name: "Pro",
      price: "$5",
      sub: "/ month",
      features: ["100 applications / month", "Auto-submit when match > 85", "Unlimited screener answers", "Up to 3 voice samples"],
      cta: "Start 7-day trial",
      featured: true,
    },
    {
      name: "Unlimited",
      price: "$15",
      sub: "/ month",
      features: ["Unlimited applications", "Bulk tailoring (50 / batch)", "Priority queue", "Slack & email alerts"],
      cta: "Go unlimited",
      featured: false,
    },
  ];
  return (
    <section id="pricing" className="relative max-w-[1120px] mx-auto px-6 py-24">
      <SectionLabel>Pricing</SectionLabel>
      <h2 className="mt-3 text-[40px] font-semibold tracking-[-0.02em]" style={{ lineHeight: 1.08 }}>
        Free until it works for you.
      </h2>
      <p className="mt-3 text-[15px] text-mute max-w-[480px] lh-body">
        Cancel anytime. Pro and Unlimited refund the month if you don&apos;t get a single recruiter reply.
      </p>

      <div className="mt-12 grid grid-cols-3 gap-5">
        {plans.map((p) => {
          const featured = p.featured;
          return (
            <Card
              key={p.name}
              className={`p-7 relative ${featured ? "border-[1.5px]" : ""}`}
              style={featured ? { borderColor: "var(--accent)" } : undefined}
            >
              {featured && (
                <span
                  className="absolute -top-2.5 left-7 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] rounded-sm"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Most popular
                </span>
              )}
              <div className="text-[15px] font-semibold">{p.name}</div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-[40px] font-semibold tracking-[-0.02em]">{p.price}</span>
                <span className="text-[14px] text-mute">{p.sub}</span>
              </div>
              <ul className="mt-6 space-y-2.5 text-[13.5px] lh-body">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span style={{ color: "var(--accent)" }} className="mt-[3px]">
                      <Icon name="check" size={14} strokeWidth={2.25} />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <Link href="/onboarding" className="block">
                  <Button variant={featured ? "primary" : "secondary"} className="w-full">
                    {p.cta}
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function LandingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="max-w-[1120px] mx-auto px-6 py-12 flex flex-col md:flex-row items-start justify-between gap-8">
        <div className="max-w-[360px]">
          <Wordmark size={20} />
          <p className="mt-4 text-[13px] text-mute lh-body">
            Onbehalf is a job-application agent. We tailor every submission, track confirmations, and only wake you when there&apos;s good news.
          </p>
        </div>
        <nav className="flex items-center gap-7 text-[13px] text-mute">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#pricing" className="hover:text-ink">Pricing</a>
          <Link href="/about" className="hover:text-ink">About</Link>
        </nav>
      </div>
      <div className="max-w-[1120px] mx-auto px-6 py-4 border-t border-line text-[12px] text-mute">
        © 2026 Onbehalf — a prototype by{" "}
        <a
          href="https://github.com/joyo11"
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink underline underline-offset-2"
        >
          @joyo11
        </a>
      </div>
    </footer>
  );
}
