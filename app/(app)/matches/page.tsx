import { eq } from "drizzle-orm";
import { Ic } from "@/components/ob/icons";
import { Eyebrow } from "@/components/ob/primitives";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile } from "@/lib/db/schema";
import { findMatchingJobs } from "@/lib/jobs/queries";
import { MatchesList } from "./list";

type SearchParams = {
  roles?: string;
  locations?: string;
  salaryMin?: string;
  limit?: string;
  level?: string;
};

const VALID_LEVELS = ["junior", "mid", "senior", "staff", "principal"] as const;
type Level = (typeof VALID_LEVELS)[number];

export default async function MatchesScreen({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const roles = sp.roles ? sp.roles.split(",").filter(Boolean) : [];
  const locations = sp.locations ? sp.locations.split(",").filter(Boolean) : [];
  const salaryMin = sp.salaryMin ? Number(sp.salaryMin) : undefined;
  // Default batch from the user's persisted profile.batchSize (saved by
  // /search). URL ?limit= wins when present so the dashboard "Apply to
  // N" buttons still work, but plain /matches navigation now restores
  // the user's last choice instead of falling back to a hardcoded 50.
  const u = await getCurrentUser().catch(() => null);
  let savedBatch = 10;
  if (u) {
    const [p] = await db
      .select({ batchSize: profile.batchSize })
      .from(profile)
      .where(eq(profile.userId, u.id))
      .limit(1);
    if (p?.batchSize && p.batchSize >= 1 && p.batchSize <= 50) {
      savedBatch = p.batchSize;
    }
  }
  const requestedLimit = sp.limit ? Number(sp.limit) : savedBatch;
  const limit = Math.max(1, Math.min(50, requestedLimit));
  const level = (VALID_LEVELS as readonly string[]).includes(sp.level ?? "")
    ? (sp.level as Level)
    : null;

  const jobs = await findMatchingJobs({ roles, locations, salaryMin, limit, seniorityLevel: level });

  const strong = jobs.filter((j) => j.score >= 85).length;
  const good = jobs.filter((j) => j.score >= 70 && j.score < 85).length;
  const borderline = jobs.filter((j) => j.score < 70).length;

  if (jobs.length === 0) {
    return (
      <div className="max-w-[1180px] mx-auto px-5 sm:px-9 py-7 sm:py-9">
        <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-14 text-center">
          <div className="h-14 w-14 rounded-xl2 border border-sand-200 bg-sand-50 grid place-items-center mx-auto mb-4">
            <Ic.search className="h-6 w-6 text-ink-mute" />
          </div>
          <h2 className="font-display font-bold text-[20px] text-ink">No matches yet</h2>
          <p className="text-[14px] text-ink-mute mt-2 max-w-md mx-auto leading-relaxed">
            {roles.length > 0 || locations.length > 0
              ? "Try widening your role keywords or removing a location filter."
              : "We need to scrape jobs first. Run the scraper or wait for the next hourly cron."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1180px] mx-auto px-5 sm:px-9 py-7 sm:py-9">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <Eyebrow tone="teal" className="mb-3">
            Search results
          </Eyebrow>
          <h1
            className="font-display font-black text-ink"
            style={{ fontSize: "clamp(2rem, 3vw, 2.7rem)", lineHeight: 1.05, letterSpacing: "-0.03em" }}
          >
            I found {jobs.length} match{jobs.length === 1 ? "" : "es"}.
          </h1>
          {strong > 0 && (
            <p className="mt-2 text-[15px] text-ink-mute leading-relaxed max-w-[600px]">
              {strong} {strong === 1 ? "is" : "are"} unusually strong — those auto-submit when you
              hit Auto-apply.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="All" count={jobs.length} active />
          <FilterChip label="Strong (85+)" count={strong} />
          <FilterChip label="Good (70–84)" count={good} />
          <FilterChip label="Borderline" count={borderline} />
        </div>
        <div className="flex items-center gap-3 text-[13px] text-ink-mute">
          <span>Sort by</span>
          <button className="flex items-center gap-1 text-ink font-semibold">Match score</button>
        </div>
      </div>

      <MatchesList jobs={jobs} />
    </div>
  );
}

function FilterChip({ label, count, active }: { label: string; count?: number; active?: boolean }) {
  return (
    <button
      className={
        "h-8 px-3 text-[12.5px] font-semibold rounded-full transition-colors flex items-center gap-1.5 " +
        (active
          ? "bg-ink text-white"
          : "text-ink-mute hover:text-ink border border-sand-200 bg-white")
      }
    >
      {label}
      {count !== undefined && (
        <span className={"tabular " + (active ? "text-white/70" : "text-ink-faint")}>{count}</span>
      )}
    </button>
  );
}
