import { NextResponse } from "next/server";
import { scrapeAll } from "@/lib/ats/scrape";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — covers all 50ish companies

export async function POST(req: Request) {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "SCRAPE_TOKEN is not configured on the server." },
      { status: 500 },
    );
  }
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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

  return NextResponse.json({
    elapsedMs,
    totals,
    results,
  });
}
