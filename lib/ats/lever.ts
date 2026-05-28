/**
 * Lever public job postings API.
 *
 * Docs: https://help.lever.co/hc/en-us/articles/360039311593
 * Endpoint: GET https://api.lever.co/v0/postings/{slug}?mode=json
 * No auth required.
 */

import type { ParsedJob } from "./types";

type LeverPosting = {
  id: string;
  text: string; // job title
  hostedUrl: string;
  applyUrl?: string;
  categories: {
    commitment?: string;
    location?: string;
    department?: string;
    team?: string;
  };
  description: string; // HTML
  descriptionPlain?: string;
  lists?: Array<{ text: string; content: string }>; // sections (responsibilities, requirements, etc.)
  additional?: string;
  additionalPlain?: string;
  createdAt: number; // unix millis
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: string; // "year" | "hour" | ...
  };
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

export async function fetchLeverJobs({
  slug,
  companyName,
}: {
  slug: string;
  companyName: string;
}): Promise<{ jobs: ParsedJob[]; error: string | null }> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
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

  const data = (await res.json()) as LeverPosting[];
  if (!Array.isArray(data)) {
    return { jobs: [], error: "response is not an array" };
  }

  const parsed: ParsedJob[] = data
    .filter((p) => p.text && p.hostedUrl)
    .map((p) => {
      const sections = [
        p.descriptionPlain ?? stripHtml(p.description ?? ""),
        ...(p.lists ?? []).map((l) => `${l.text}\n${stripHtml(l.content)}`),
        p.additionalPlain ?? stripHtml(p.additional ?? ""),
      ]
        .filter(Boolean)
        .join("\n\n");

      return {
        source: "lever" as const,
        sourceJobId: p.id,
        company: companyName,
        title: p.text,
        location: p.categories?.location ?? null,
        jdText: sections.slice(0, 12000),
        salaryMin: p.salaryRange?.min ?? null,
        salaryMax: p.salaryRange?.max ?? null,
        postedAt: p.createdAt ? new Date(p.createdAt) : null,
        applyUrl: p.applyUrl ?? p.hostedUrl,
      };
    });

  return { jobs: parsed, error: null };
}
