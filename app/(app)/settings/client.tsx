"use client";

import { Ic } from "@/components/ob/icons";
import { Eyebrow } from "@/components/ob/primitives";

export type SettingsHeader = {
  name: string;
  email: string;
  memberSince: string;
  plan: string;
  gmailConnectedAt: string | null;
};

export default function SettingsScreen({ header }: { header: SettingsHeader }) {
  return (
    <div className="max-w-[1180px] mx-auto px-9 py-9">
      <div>
        <Eyebrow tone="teal" className="mb-3">
          Profile &amp; settings
        </Eyebrow>
        <h1
          className="font-display font-black text-ink"
          style={{ fontSize: "clamp(2rem, 3vw, 2.7rem)", lineHeight: 1.05, letterSpacing: "-0.03em" }}
        >
          {header.name}
        </h1>
        <p className="mt-2.5 text-[14px] text-ink-mute">
          {header.email} <Dot /> Member since {header.memberSince} <Dot /> {header.plan}
        </p>
      </div>

      <div className="mt-5 inline-flex items-center gap-2 text-[12.5px] text-ink-mute bg-sand-50 border border-sand-200 rounded-full px-3.5 py-1.5">
        <Ic.spark className="h-3 w-3" />
        Editing for resume + experience + voice sample lives in onboarding. Re-run any time.
      </div>

      <div className="mt-9 max-w-[680px]">
        <Eyebrow tone="teal" className="mb-3">
          Gmail (optional)
        </Eyebrow>
        <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-5">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl2 bg-teal-50 border border-teal-100 grid place-items-center shrink-0">
              <Ic.mail className="h-5 w-5 text-teal-600" />
            </div>
            <div className="flex-1 min-w-0">
              {header.gmailConnectedAt ? (
                <>
                  <div className="text-[14px] font-bold flex items-center gap-1.5 text-teal-700">
                    <Ic.checkCircle className="h-4 w-4" /> Connected
                  </div>
                  <p className="text-[13px] text-ink-mute mt-1.5 leading-relaxed">
                    Connected since {header.gmailConnectedAt}. We check daily for confirmation
                    emails and mark matched applications as Confirmed in the tracker.
                  </p>
                </>
              ) : (
                <>
                  <div className="text-[14px] font-bold text-ink">Track confirmation emails</div>
                  <p className="text-[13px] text-ink-mute mt-1.5 leading-relaxed">
                    Once connected, we&apos;ll watch your inbox (read-only, daily) for application
                    confirmations and auto-tag matching rows in the tracker. Without this,
                    applications stay in &ldquo;Submitted&rdquo; until you manually check.
                  </p>
                  <a
                    href="/api/auth/google/start"
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-teal-500 hover:bg-teal-600 text-white text-[14px] font-semibold px-4 py-2.5 transition-colors"
                  >
                    <Ic.mail className="h-4 w-4" /> Connect Gmail
                  </a>
                </>
              )}
              <ul className="mt-4 space-y-1.5 text-[12px] text-ink-faint">
                <li className="flex items-start gap-1.5">
                  <Ic.eye className="h-3 w-3 mt-0.5 shrink-0" />
                  Read-only access, scoped to ATS confirmation patterns
                </li>
                <li className="flex items-start gap-1.5">
                  <Ic.shield className="h-3 w-3 mt-0.5 shrink-0" />
                  We can&apos;t write or send mail on your behalf — read-only scope only
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="text-sand-300 mx-1.5">·</span>;
}
