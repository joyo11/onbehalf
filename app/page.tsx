"use client";

/*  Landing screen — demo-video hero.
    Living mini-dashboard on the right shows job cards cycling through statuses. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { Monogram } from "@/components/ui/monogram";
import { Wordmark } from "@/components/ui/wordmark";

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

/* ---------- Top nav (marketing) ---------- */
function LandingNav() {
  return (
    <nav className="sticky top-0 z-30 bg-sand/85 backdrop-blur border-b border-line/60">
      <div className="max-w-[1120px] mx-auto h-16 px-6 flex items-center justify-between">
        <Wordmark size={20} />
        <div className="flex items-center gap-8 text-sm text-mute">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#pricing" className="hover:text-ink">Pricing</a>
          <a href="#" className="hover:text-ink">Changelog</a>
          <a href="#" className="hover:text-ink">Sign in</a>
          <Link href="/onboarding">
            <Button variant="primary" size="sm" trailing={<Icon name="arrow-right" size={14} />}>
              Get started
            </Button>
          </Link>
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
            <Link href="/onboarding">
              <Button size="lg" trailing={<Icon name="arrow-right" size={15} />}>
                Get started — it&apos;s free
              </Button>
            </Link>
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
          <LivingDashboard />
        </div>
      </div>
    </section>
  );
}

/* ---------- Living hero: an inbox waking up to confirmations ----------
   Replaces the previous mini-dashboard. Lines up with the subhead:
   "Wake up to confirmation emails." Emails arrive one at a time. */

type Email = {
  sender: string;
  domain: string;
  subject: string;
  time: string;
};

function LivingDashboard() {
  const EMAILS: Email[] = [
    { sender: "Linear Recruiting", domain: "linear.app", subject: "We received your application", time: "8:16 AM" },
    { sender: "Vercel Careers", domain: "vercel.com", subject: "Application confirmation — Edge Runtime", time: "8:24 AM" },
    { sender: "Anthropic Talent", domain: "anthropic.com", subject: "Thanks for applying", time: "8:42 AM" },
    { sender: "Mercury Talent", domain: "mercury.com", subject: "Application received", time: "7:50 AM" },
    { sender: "Vanta Recruiting", domain: "vanta.com", subject: "Application confirmation", time: "8:01 AM" },
  ];

  // How many emails to have arrived. Tick one in every ~2s.
  const [count, setCount] = useState<number>(2);
  useEffect(() => {
    const id = setInterval(() => {
      setCount((c) => (c >= EMAILS.length ? 2 : c + 1));
    }, 2200);
    return () => clearInterval(id);
  }, [EMAILS.length]);

  const visible = EMAILS.slice(0, count);

  return (
    <div className="relative w-full">
      <Card className="overflow-hidden shadow-float">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-white"
              style={{ background: "var(--accent)" }}
            >
              <Icon name="mail" size={13} />
            </div>
            <div className="leading-tight">
              <div className="text-[12.5px] font-semibold">Inbox</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: "var(--accent-hi)" }}>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--accent)", animation: "pulse 1.6s ease-in-out infinite" }}
            />
            <span className="tabular-nums">{count}</span> new today
          </div>
        </div>

        <ul className="divide-y divide-line">
          {visible.map((e, i) => (
            <li
              key={e.sender}
              className={`px-4 py-3.5 flex items-start gap-3 ${i === visible.length - 1 ? "anim-slide-in" : ""}`}
              style={{ background: i === visible.length - 1 ? "rgba(13,148,136,0.04)" : "transparent" }}
            >
              <Monogram name={e.sender} size={32} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[12.5px] font-semibold truncate">{e.sender}</span>
                    {i === visible.length - 1 && (
                      <span
                        className="text-[9.5px] uppercase tracking-[0.06em] font-semibold px-1 py-px rounded-[3px]"
                        style={{ background: "var(--accent)", color: "#fff" }}
                      >
                        New
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-mute shrink-0 tabular-nums">{e.time}</span>
                </div>
                <div className="text-[12.5px] mt-0.5 truncate">{e.subject}</div>
                <div className="text-[11px] text-mute mt-0.5 truncate">jobs@{e.domain}</div>
              </div>
              <Icon name="check-circle" size={14} className="shrink-0 mt-1" style={{ color: "var(--accent)" }} />
            </li>
          ))}
        </ul>

        <div className="px-4 py-2.5 border-t border-line flex items-center justify-between text-[11.5px]">
          <span className="text-mute flex items-center gap-1.5">
            <Icon name="sparkles" size={11} style={{ color: "var(--accent)" }} />
            All from Onbehalf submissions
          </span>
          <span className="font-medium tabular-nums" style={{ color: "var(--accent-hi)" }}>
            12 sent today
          </span>
        </div>
      </Card>

      {/* subtle floating chip — keeps the original 'something just arrived' beat */}
      <div
        className="absolute -bottom-5 -right-4 z-10 hidden md:block"
        style={{ animation: "pulseFloat 2.2s ease-in-out infinite" }}
      >
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10.5px] font-medium shadow-pop"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Icon name="check" size={12} />
          Just delivered
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
      <div className="max-w-[1120px] mx-auto px-6 py-12 grid grid-cols-12 gap-8">
        <div className="col-span-5">
          <Wordmark size={20} />
          <p className="mt-4 text-[13px] text-mute lh-body max-w-[320px]">
            Onbehalf is a job-application agent. We tailor every submission, track confirmations, and only wake you when there&apos;s good news.
          </p>
        </div>
        <FooterCol title="Product" items={["Features", "Pricing", "Changelog", "Roadmap"]} />
        <FooterCol title="Company" items={["About", "Careers", "Press kit", "Contact"]} />
        <FooterCol title="Trust" items={["Privacy", "Security", "Terms", "DPA"]} />
      </div>
      <div className="max-w-[1120px] mx-auto px-6 py-4 border-t border-line flex items-center justify-between text-[12px] text-mute">
        <span>© 2026 Onbehalf, Inc.</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" /> All systems normal
        </span>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="col-span-2">
      <div className="text-[12px] font-semibold mb-3">{title}</div>
      <ul className="space-y-2 text-[13px] text-mute">
        {items.map((i) => (
          <li key={i}>
            <a href="#" className="hover:text-ink">{i}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
