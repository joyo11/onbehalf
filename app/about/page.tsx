import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Wordmark } from "@/components/ui/wordmark";

export const metadata = {
  title: "About — Onbehalf",
  description: "A prototype job-application agent by Shafay Joyo.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-30 bg-sand/85 backdrop-blur border-b border-line/60">
        <div className="max-w-[760px] mx-auto h-16 px-6 flex items-center justify-between">
          <Link href="/">
            <Wordmark size={20} />
          </Link>
          <Link href="/sign-up">
            <Button variant="primary" size="sm" trailing={<Icon name="arrow-right" size={14} />}>
              Get started
            </Button>
          </Link>
        </div>
      </nav>

      <main className="flex-1 max-w-[680px] mx-auto px-6 py-20">
        <h1 className="text-[40px] font-semibold tracking-[-0.022em]" style={{ lineHeight: 1.1 }}>
          About this prototype.
        </h1>

        <p className="mt-6 text-[17px] text-ink/85 lh-body">
          Onbehalf is an autonomous AI agent that finds, tailors, and submits job applications on
          your behalf. Upload your resume, set your criteria, and the agent does the rest —
          Greenhouse, Lever, and Ashby boards are searched live; resumes are rewritten per JD with
          no fabrication; cover letters are drafted in your voice.
        </p>

        <p className="mt-5 text-[16px] text-ink/85 lh-body">
          It&apos;s a prototype. There&apos;s no team behind it yet, no enterprise customers, no
          changelog or roadmap to publish. What you see is what works today.
        </p>

        <div className="mt-10 border-t border-line pt-8">
          <div className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-mute">
            Built by
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-semibold"
              style={{ background: "var(--accent)" }}
            >
              SJ
            </div>
            <div>
              <div className="text-[15px] font-semibold">Shafay Joyo</div>
              <div className="text-[13px] text-mute">Founder &amp; engineer</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/joyo11/onbehalf"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 h-9 px-3.5 text-[13px] rounded-ctrl border border-line bg-white hover:border-ink/30 transition-colors"
            >
              <Icon name="github" size={14} /> Source on GitHub
            </a>
            <a
              href="https://github.com/joyo11"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 h-9 px-3.5 text-[13px] rounded-ctrl border border-line bg-white hover:border-ink/30 transition-colors"
            >
              <Icon name="user" size={14} /> joyo11
            </a>
            <a
              href="mailto:shafay11august@gmail.com"
              className="inline-flex items-center gap-2 h-9 px-3.5 text-[13px] rounded-ctrl border border-line bg-white hover:border-ink/30 transition-colors"
            >
              <Icon name="mail" size={14} /> Email
            </a>
          </div>
        </div>

        <div className="mt-12 text-[13px] text-mute lh-body">
          The stack: Next.js 16 + React 19 + Tailwind v4 on Vercel · Postgres + pgvector on
          Supabase · Drizzle ORM · Clerk for auth · Claude Opus 4.7 for resume parsing,
          tailoring, cover letters, and screener answers.
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="max-w-[760px] mx-auto px-6 py-6 flex items-center justify-between text-[12px] text-mute">
          <span>
            © 2026 Onbehalf — a prototype by{" "}
            <a
              href="https://github.com/joyo11"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink underline underline-offset-2"
            >
              @joyo11
            </a>
          </span>
          <Link href="/" className="hover:text-ink">
            ← Back to landing
          </Link>
        </div>
      </footer>
    </div>
  );
}
