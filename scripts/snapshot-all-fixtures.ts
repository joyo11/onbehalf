/**
 * Run the snapshot detector against every fixture URL. For each:
 *   - Capture detected[] / missed[]
 *   - Save to tests/snapshots/<slug>.json (or diff against existing)
 *   - Print a summary table
 *
 * Pass --update to overwrite existing snapshots.
 *
 * The fixture set covers all three supported ATSes plus a couple of
 * shape variants per ATS, so a regression on any ATS markup will diff
 * at least one snapshot.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

type Fixture = { slug: string; ats: string; url: string };

const FIXTURES: Fixture[] = [
  { slug: "figma-fullstack", ats: "greenhouse", url: "https://job-boards.greenhouse.io/figma/jobs/5691911004" },
  // Stripe + Notion both either 404 or 302-redirect off the direct
  // Greenhouse URL, so we swap them for Mercury + Airtable — same ATS,
  // similar form shape, but the apply URL actually serves the form.
  { slug: "mercury-backend", ats: "greenhouse", url: "https://job-boards.greenhouse.io/mercury/jobs/5520964004" },
  { slug: "airtable-engineer", ats: "greenhouse", url: "https://boards.greenhouse.io/airtable/jobs/8124953002" },
  { slug: "mistral-deployment", ats: "lever", url: "https://jobs.lever.co/mistral/0004f890-99d5-47c5-bb67-8f3f76a1e08f/apply" },
  { slug: "linear-fullstack", ats: "ashby", url: "https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff/application" },
  // Notion (Ashby) replaces PostHog — same ATS, but PostHog's Ashby
  // boards don't mount their form in our Browserbase session within
  // the 20s window. Notion's do.
  { slug: "notion-engineer", ats: "ashby", url: "https://jobs.ashbyhq.com/notion/91156750-4050-4621-aa45-0fb068308d2c/application" },
];

type Summary = { slug: string; ats: string; detected: number; missed: number; status: string };

async function main() {
  const update = process.argv.includes("--update");
  const results: Summary[] = [];

  for (const f of FIXTURES) {
    console.log(`\n──── ${f.slug} (${f.ats}) ────`);
    const args = ["scripts/snapshot-fill.ts", f.slug, f.url];
    if (update) args.push("--update");
    const out = spawnSync("npx", ["tsx", ...args], {
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = out.stdout ?? "";
    const stderr = out.stderr ?? "";
    process.stdout.write(stdout);
    if (out.status !== 0) {
      process.stderr.write(stderr);
    }
    // Parse the saved snapshot for the summary
    const path = `tests/snapshots/${f.slug}.json`;
    let detected = -1;
    let missed = -1;
    if (existsSync(path)) {
      const s = JSON.parse(readFileSync(path, "utf8")) as { detectedCount?: number; missedCount?: number };
      detected = s.detectedCount ?? -1;
      missed = s.missedCount ?? -1;
    }
    results.push({
      slug: f.slug,
      ats: f.ats,
      detected,
      missed,
      status:
        out.status === 0
          ? stdout.includes("snapshot MATCHES")
            ? "match"
            : stdout.includes("snapshot CREATED")
              ? "created"
              : stdout.includes("snapshot UPDATED")
                ? "updated"
                : "ok"
          : stdout.includes("snapshot CHANGED")
            ? "changed"
            : "error",
    });
  }

  console.log("\n\n=========== summary ===========");
  console.log("slug                     ats         detected  missed  status");
  for (const r of results) {
    console.log(
      `${r.slug.padEnd(25)}${r.ats.padEnd(12)}${String(r.detected).padEnd(10)}${String(r.missed).padEnd(8)}${r.status}`,
    );
  }
  const errCount = results.filter((r) => r.status === "error" || r.status === "changed").length;
  process.exit(errCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
