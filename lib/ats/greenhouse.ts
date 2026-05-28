/**
 * Greenhouse public job board API.
 *
 * Docs: https://developers.greenhouse.io/job-board.html
 * Endpoint: GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
 * No auth required — these are the same listings shown publicly on
 * boards.greenhouse.io/{slug}.
 */

import type { ParsedJob } from "./types";

type GhJob = {
  id: number;
  internal_job_id: number;
  title: string;
  updated_at: string;
  requisition_id: string | null;
  location: { name: string } | null;
  absolute_url: string;
  content: string; // HTML
  metadata?: Array<{ name: string; value: unknown }> | null;
  offices?: Array<{ name: string }> | null;
  departments?: Array<{ name: string }> | null;
  first_published?: string | null;
};

type GhResponse = {
  jobs: GhJob[];
  meta?: { total?: number };
};

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchGreenhouseJobs({
  slug,
  companyName,
}: {
  slug: string;
  companyName: string;
}): Promise<{ jobs: ParsedJob[]; error: string | null }> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "onbehalf-scraper/1.0" },
      next: { revalidate: 0 },
    });
  } catch (e) {
    return { jobs: [], error: e instanceof Error ? e.message : "fetch failed" };
  }

  if (!res.ok) {
    return { jobs: [], error: `HTTP ${res.status}` };
  }

  const data = (await res.json()) as GhResponse;
  if (!Array.isArray(data.jobs)) {
    return { jobs: [], error: "no jobs array in response" };
  }

  const parsed: ParsedJob[] = data.jobs
    .filter((j) => j.title && j.absolute_url)
    .map((j) => ({
      source: "greenhouse" as const,
      sourceJobId: String(j.id),
      company: companyName,
      title: j.title,
      location: j.location?.name ?? j.offices?.[0]?.name ?? null,
      jdText: stripHtml(j.content ?? "").slice(0, 12000),
      salaryMin: null,
      salaryMax: null,
      postedAt: j.first_published
        ? new Date(j.first_published)
        : j.updated_at
          ? new Date(j.updated_at)
          : null,
      applyUrl: j.absolute_url,
    }));

  return { jobs: parsed, error: null };
}
