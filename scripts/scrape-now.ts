import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { scrapeAll } = await import("../lib/ats/scrape.js");

  const start = Date.now();
  const results = await scrapeAll();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const totals = results.reduce(
    (a, r) => ({
      found: a.found + r.found,
      upserted: a.upserted + r.upserted,
      errors: a.errors + (r.error ? 1 : 0),
    }),
    { found: 0, upserted: 0, errors: 0 },
  );

  console.log(`\n──── Scrape done in ${elapsed}s ────`);
  console.log(`Found ${totals.found} jobs across ${results.length} companies`);
  console.log(`Upserted ${totals.upserted} rows into the job table`);
  console.log(`${totals.errors} errors\n`);

  const errors = results.filter((r) => r.error);
  if (errors.length) {
    console.log("Errors:");
    for (const e of errors) console.log(`  ${e.company} (${e.source}): ${e.error}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
