import { NextResponse } from "next/server";
import { scrapeAll } from "@/lib/ats/scrape";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — covers all 50ish companies

async function authorized(req: Request): Promise<boolean> {
  // Vercel Cron sends a Bearer token equal to process.env.CRON_SECRET
  // (auto-set by Vercel) on the Authorization header.
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (process.env.CRON_SECRET && auth === process.env.CRON_SECRET) return true;
  if (process.env.SCRAPE_TOKEN && auth === process.env.SCRAPE_TOKEN) return true;
  return false;
}

async function runScrape() {
  const start = Date.now();
  const results = await scrapeAll();
  const elapsedMs = Date.now() - start;

  const totals = results.reduce(
    (acc, r) => ({
      found: acc.found + r.found,
      upserted: acc.upserted + r.upserted,
      errors: acc.errors + (r.error ? 1 : 0),
    }),
    { found: 0, upserted: 0, errors: 0 },
  );
  return { elapsedMs, totals, results };
}

// Vercel Cron uses GET. Manual runs (curl) can use either.
export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return NextResponse.json(await runScrape());
}

export async function POST(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json(await runScrape());
}
