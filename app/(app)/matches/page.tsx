import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { findMatchingJobs } from "@/lib/jobs/queries";
import { MatchesList } from "./list";

type SearchParams = {
  roles?: string;
  locations?: string;
  salaryMin?: string;
};

export default async function MatchesScreen({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const roles = sp.roles ? sp.roles.split(",").filter(Boolean) : [];
  const locations = sp.locations ? sp.locations.split(",").filter(Boolean) : [];
  const salaryMin = sp.salaryMin ? Number(sp.salaryMin) : undefined;

  const jobs = await findMatchingJobs({ roles, locations, salaryMin, limit: 50 });

  const strong = jobs.filter((j) => j.score >= 85).length;
  const good = jobs.filter((j) => j.score >= 70 && j.score < 85).length;
  const borderline = jobs.filter((j) => j.score < 70).length;

  if (jobs.length === 0) {
    return (
      <div className="px-10 py-9 max-w-[1100px] mx-auto">
        <Card className="p-12 text-center">
          <div className="h-14 w-14 rounded-card border border-line bg-[#FCFBF6] flex items-center justify-center mx-auto mb-4">
            <Icon name="search" size={22} className="text-ink-soft" />
          </div>
          <h2 className="text-[18px] font-semibold">No matches yet</h2>
          <p className="text-[13.5px] text-mute mt-2 max-w-md mx-auto">
            {roles.length > 0 || locations.length > 0
              ? "Try widening your role keywords or removing a location filter."
              : "We need to scrape jobs first. Run the scraper or wait for the next hourly cron."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-10 py-9 max-w-[1100px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <SectionLabel>Run #{Math.floor(Math.random() * 999) + 100} · just now</SectionLabel>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.022em]">
            I found {jobs.length} match{jobs.length === 1 ? "" : "es"}.{" "}
            {strong > 0 && (
              <span className="text-mute font-normal">
                {strong} {strong === 1 ? "is" : "are"} unusually strong.
              </span>
            )}
          </h1>
          <p className="mt-2 text-[14px] text-mute lh-body max-w-[600px]">
            Ranked by overall match. Click a card to read the JD and approve tailoring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" leading={<Icon name="cards" size={14} />}>
            Compact view
          </Button>
          {strong > 0 && (
            <Button variant="primary" leading={<Icon name="bolt" size={14} />}>
              Auto-apply top {Math.min(strong, 4)}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between text-[12.5px] text-mute">
        <div className="flex items-center gap-2">
          <FilterChip label="All" count={jobs.length} active />
          <FilterChip label="Strong (85+)" count={strong} />
          <FilterChip label="Good (70–84)" count={good} />
          <FilterChip label="Borderline" count={borderline} />
        </div>
        <div className="flex items-center gap-3">
          <span>Sort by</span>
          <button className="flex items-center gap-1 text-ink font-medium hover:underline">
            Match score <Icon name="chevron-down" size={12} />
          </button>
        </div>
      </div>

      <MatchesList jobs={jobs} />
    </div>
  );
}

function FilterChip({ label, count, active }: { label: string; count?: number; active?: boolean }) {
  return (
    <button
      className={`h-7 px-2.5 text-[12px] font-medium rounded-sm transition-colors flex items-center gap-1.5 ${
        active ? "bg-ink text-white" : "text-mute hover:text-ink border border-line bg-white"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`tabular-nums ${active ? "text-white/70" : "text-mute"}`}>{count}</span>
      )}
    </button>
  );
}
