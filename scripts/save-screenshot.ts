import { and, desc, eq } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { db } from "../lib/db/client";
import { applicationEvent } from "../lib/db/schema";

async function main() {
  const appId = process.argv[2];
  const phase = process.argv[3] ?? "pre";
  const outPath = process.argv[4] ?? "/tmp/screenshot.jpg";

  if (!appId) {
    console.error("Usage: tsx scripts/save-screenshot.ts <appId> [pre|post] [outPath]");
    process.exit(1);
  }

  const step = phase === "pre" ? "screenshot_pre_submit" : "screenshot_post_submit";

  const [ev] = await db
    .select({ payload: applicationEvent.payloadJson })
    .from(applicationEvent)
    .where(and(eq(applicationEvent.applicationId, appId), eq(applicationEvent.step, step)))
    .orderBy(desc(applicationEvent.createdAt))
    .limit(1);

  if (!ev) {
    console.error("No screenshot event found");
    process.exit(1);
  }

  const payload = ev.payload as { imageBase64?: string };
  if (!payload?.imageBase64) {
    console.error("No imageBase64 in payload");
    process.exit(1);
  }
  writeFileSync(outPath, Buffer.from(payload.imageBase64, "base64"));
  console.log(`Wrote ${outPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
