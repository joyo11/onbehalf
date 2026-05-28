import type { AtsSource } from "./companies";

/**
 * Normalized job shape every scraper returns. Matches the columns we'll
 * insert into the `job` table.
 */
export type ParsedJob = {
  source: AtsSource;
  sourceJobId: string;
  company: string;
  title: string;
  location: string | null;
  jdText: string;
  salaryMin: number | null;
  salaryMax: number | null;
  postedAt: Date | null;
  applyUrl: string;
};
