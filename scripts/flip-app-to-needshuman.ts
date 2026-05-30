/**
 * Dev utility — flip an application into `needsHuman` with sample
 * resolvedFields so the Phase 3 review UI renders fully populated.
 * Lets you verify the NeedsHumanCard without burning Browserbase
 * minutes on a real run.
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application } from "../lib/db/schema";

const id = process.argv[2] ?? "c2816db8-9cc3-4e92-ad10-04713958cc53";

const sampleResolvedFields = [
  // High confidence — these would auto-submit on their own.
  {
    label: "Name",
    value: "Mohammad Shafay Joyo",
    source: "profile",
    confidence: "high",
    reason: "profile.fullName",
  },
  {
    label: "Email",
    value: "shafay11august@gmail.com",
    source: "profile",
    confidence: "high",
    reason: "profile.email",
  },
  // The ones that stopped us.
  {
    label: "How did you hear about this role?",
    value: "Job board",
    source: "llm",
    confidence: "medium",
    reason: "LLM picked from 5 visible options",
  },
  {
    label: "What country are you based in?",
    value: "United States",
    source: "llm",
    confidence: "medium",
    reason: "LLM picked from country dropdown",
  },
  {
    label: "Why Linear?",
    value:
      "Linear's bet on AI-augmented planning lines up with how I want to build product — using the model to compress discovery and let engineers focus on the craftsmanship of shipping. The Solutions Engineering role looks like the right wedge for getting close to real customers on that.",
    source: "llm",
    confidence: "medium",
    reason: "smart-fill via Claude (Phase 2 will tighten this signal)",
  },
];

async function main() {
  const [existing] = await db.select().from(application).where(eq(application.id, id)).limit(1);
  if (!existing) {
    console.error("not found:", id);
    process.exit(1);
  }
  const existingMeta = (existing.customAnswersJson as Record<string, unknown> | null) ?? {};
  const merged = {
    ...existingMeta,
    needsHumanReason: "low_confidence",
    resolvedFields: sampleResolvedFields,
    submitSelector: "button:has-text('Submit Application'):visible",
  };
  await db
    .update(application)
    .set({
      status: "needsHuman",
      failureReason: "low_confidence",
      customAnswersJson: merged,
    })
    .where(eq(application.id, id));
  console.log(`flipped ${id} → needsHuman with ${sampleResolvedFields.length} sample resolved fields`);
  console.log(`  ${sampleResolvedFields.filter((f) => f.confidence !== "high").length} are non-high (would show in review card)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
