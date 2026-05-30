/**
 * For the top junior matches, surface the YOE language from each JD so
 * we can spot title-only filter misses (e.g. "Software Engineer, Data"
 * passes the junior title filter but the JD demands 3-8 YOE).
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db/client";
import { job } from "../lib/db/schema";

const TOP_IDS = [
  "f46637e3-8a5d-4de4-a972-5995d29f2754", // Anthropic Claude Design
  "9e1f4336-0853-4a1e-98e5-dc95bdcc658b", // Anthropic Full-Stack RL
  "634c570f-6cff-4131-ac9e-975c002748c5", // Airtable SE Data
  "71f39b27-4297-4c94-a6dd-eab3877a59ae", // Figma Full Stack
  "95a593d2-dd5d-4ebe-9138-8236f5184865", // Anthropic Cybersecurity
];

const YOE_PATTERNS = [
  /\b(\d+)\+?\s*(?:to\s*\d+\+?\s*)?years?\s*(?:of\s*)?(?:professional\s*)?experience/gi,
  /\b(?:minimum|min\.?)\s*(?:of\s*)?(\d+)\+?\s*years?/gi,
  /\b(\d+)\s*-\s*(\d+)\+?\s*years?\b/gi,
  /\b(?:entry|junior|new\s*grad|recent\s*grad)\b/gi,
];

async function main() {
  const rows = await db
    .select({ id: job.id, company: job.company, title: job.title, jdText: job.jdText })
    .from(job)
    .where(inArray(job.id, TOP_IDS));

  // Preserve TOP_IDS order
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const id of TOP_IDS) {
    const r = byId.get(id);
    if (!r) continue;
    console.log(`\n${r.company} — ${r.title}`);
    const matches: string[] = [];
    for (const pat of YOE_PATTERNS) {
      const found = r.jdText.match(pat);
      if (found) matches.push(...found.map((m) => m.trim()));
    }
    if (matches.length === 0) {
      console.log("  no YOE language found in JD");
    } else {
      const unique = [...new Set(matches)].slice(0, 5);
      for (const m of unique) console.log(`  • "${m}"`);
    }
  }
  process.exit(0);
}
main();
