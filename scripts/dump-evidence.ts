import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, applicationEvent } from "../lib/db/schema";

async function main() {
  const id = process.argv[2] ?? "82733bf0-06d7-4d8a-8149-b13c3ae34382";
  const [a] = await db.select().from(application).where(eq(application.id, id)).limit(1);
  if (!a) { console.log("not found"); process.exit(1); }

  console.log("=== APPLICATION ===");
  console.log("id:", a.id);
  console.log("status:", a.status);
  console.log("failureReason:", a.failureReason);

  const meta = a.customAnswersJson as Record<string, unknown> | null;
  console.log("\n=== customAnswersJson keys ===");
  if (meta) {
    for (const k of Object.keys(meta)) {
      const v = meta[k];
      if (Array.isArray(v)) console.log(` ${k}: [${v.length} items]`);
      else if (typeof v === "string") console.log(` ${k}: ${v.slice(0, 80)}`);
      else console.log(` ${k}: ${JSON.stringify(v).slice(0, 100)}`);
    }
  }

  console.log("\n=== resolvedFields ===");
  const rf = (meta?.resolvedFields as Array<Record<string, unknown>>) ?? [];
  for (const f of rf) {
    const conf = String(f.confidence);
    const flag = conf === "high" ? "✓" : conf === "abstain" ? "✗" : "?";
    console.log(`${flag} [${conf}/${f.source}] ${f.label}`);
    console.log(`     → ${String(f.value).slice(0, 100)}`);
    if (f.reason) console.log(`     reason: ${String(f.reason).slice(0, 100)}`);
  }

  // Key gate-decision payload
  const gateEvent = await db
    .select()
    .from(applicationEvent)
    .where(eq(applicationEvent.applicationId, id))
    .orderBy(applicationEvent.createdAt);
  const gate = gateEvent.find((e) => e.step === "submit_gate_decision");
  const stopped = gateEvent.find((e) => e.step === "stopped_at_submit");
  console.log("\n=== submit_gate_decision ===");
  console.log(JSON.stringify(gate?.payloadJson, null, 2));
  console.log("\n=== stopped_at_submit ===");
  console.log(JSON.stringify(stopped?.payloadJson, null, 2));

  process.exit(0);
}
main();
