import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../lib/db/client.js");
  const { job } = await import("../lib/db/schema.js");
  const { embedBatch } = await import("../lib/embeddings.js");
  const { sql, isNull } = await import("drizzle-orm");

  const start = Date.now();

  // Fetch jobs missing embeddings
  const rows = await db
    .select({
      id: job.id,
      title: job.title,
      location: job.location,
      jdText: job.jdText,
    })
    .from(job)
    .where(isNull(job.jdEmbedding))
    .limit(5000);

  console.log(`Found ${rows.length} jobs without embeddings`);
  if (rows.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  const BATCH = 64;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const texts = slice.map(
      (r) => `${r.title}${r.location ? ` · ${r.location}` : ""}\n\n${r.jdText.slice(0, 6000)}`,
    );
    const embeddings = await embedBatch(texts);

    // Update each row's embedding. Could be CASE WHEN for one SQL — but
    // per-row is simpler and the rate-limit bottleneck is OpenAI, not PG.
    for (let k = 0; k < slice.length; k++) {
      await db
        .update(job)
        .set({ jdEmbedding: embeddings[k] })
        .where(sql`${job.id} = ${slice[k].id}`);
    }
    done += slice.length;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    process.stdout.write(`\r  embedded ${done}/${rows.length}  (${elapsed}s)`);
  }
  console.log(`\n──── Done in ${((Date.now() - start) / 1000).toFixed(1)}s ────`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
