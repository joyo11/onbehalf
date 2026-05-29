"use client";

import { Card, SectionLabel } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

export type SettingsHeader = {
  name: string;
  email: string;
  memberSince: string;
  plan: string;
  gmailConnectedAt: string | null;
};

export default function SettingsScreen({ header }: { header: SettingsHeader }) {
  return (
    <div className="px-10 py-9 max-w-[1100px] mx-auto">
      <div>
        <SectionLabel>Settings</SectionLabel>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.022em]">{header.name}</h1>
        <p className="mt-1 text-[13px] text-mute">
          {header.email} <Dot /> Member since {header.memberSince} <Dot /> {header.plan}
        </p>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 text-[12px] text-mute bg-[#FCFBF6] border border-line rounded-ctrl px-3 py-1.5">
        <Icon name="info" size={12} />
        Detailed editing for resume + experience + voice sample lives in onboarding for now. Re-run
        onboarding any time to update.
      </div>

      <div className="mt-8 max-w-[680px]">
        <SectionLabel className="mb-3">Gmail (optional)</SectionLabel>
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <div
              className="w-11 h-11 rounded-md flex items-center justify-center text-white shrink-0"
              style={{ background: "var(--accent)" }}
            >
              <Icon name="mail" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              {header.gmailConnectedAt ? (
                <>
                  <div
                    className="text-[14px] font-medium flex items-center gap-1.5"
                    style={{ color: "var(--accent-hi)" }}
                  >
                    <Icon name="check-circle" size={14} /> Connected
                  </div>
                  <p className="text-[12.5px] text-mute mt-1.5 lh-body">
                    Connected since {header.gmailConnectedAt}. We check daily for confirmation
                    emails and mark matched applications as ✓ Confirmed in the tracker.
                  </p>
                </>
              ) : (
                <>
                  <div className="text-[14px] font-medium">Track confirmation emails</div>
                  <p className="text-[12.5px] text-mute mt-1.5 lh-body">
                    Once connected, we&apos;ll watch your inbox (read-only, daily) for application
                    confirmations and auto-tag matching rows in the tracker. Without this,
                    applications stay in &ldquo;Submitted&rdquo; until you manually check.
                  </p>
                  <a
                    href="/api/auth/google/start"
                    className="mt-4 inline-flex items-center gap-2 h-9 px-3.5 text-[13px] rounded-ctrl text-white font-medium"
                    style={{ background: "var(--accent)" }}
                  >
                    <Icon name="g-mail" size={13} /> Connect Gmail
                  </a>
                </>
              )}
              <ul className="mt-4 space-y-1.5 text-[11.5px] text-mute">
                <li className="flex items-start gap-1.5">
                  <Icon name="eye" size={11} className="mt-0.5 shrink-0" />
                  Read-only access, scoped to ATS confirmation patterns
                </li>
                <li className="flex items-start gap-1.5">
                  <Icon name="lock" size={11} className="mt-0.5 shrink-0" />
                  We can&apos;t write or send mail on your behalf — read-only scope only
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="text-line-hi mx-1.5">·</span>;
}
