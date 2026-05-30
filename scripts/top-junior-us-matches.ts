/**
 * Query Shafay's top junior US Greenhouse matches using the same
 * pgvector + filter pipeline /matches uses, then print the top 5
 * candidates so we can pick one for the evidence run.
 */
import { and, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { job, profile, user } from "../lib/db/schema";

async function main() {
  const [u] = await db
    .select()
    .from(user)
    .where(eq(user.email, "shafay11august@gmail.com"))
    .limit(1);
  if (!u) {
    console.error("user not found");
    process.exit(1);
  }
  const [p] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, u.id))
    .limit(1);
  if (!p?.resumeEmbedding) {
    console.error("no resume embedding");
    process.exit(1);
  }
  console.log("profile filters:");
  console.log("  targetRoles:", p.targetRoleTitles);
  console.log("  preferredLocations:", p.preferredLocations);
  console.log("  seniorityLevel:", p.seniorityLevel);
  console.log("  desiredSalaryMin:", p.desiredSalaryMin);
  console.log();

  const vec = `[${p.resumeEmbedding.join(",")}]`;
  const roles = (p.targetRoleTitles ?? []) as string[];
  const locations = (p.preferredLocations ?? []) as string[];

  // Build the same filter set findMatchingJobs builds. Hard-restrict to
  // greenhouse + active + has-embedding.
  const conds: ReturnType<typeof ilike>[] = [
    sql`${job.is_active ?? job.isActive} = true` as ReturnType<typeof ilike>,
    eq(job.source, "greenhouse"),
    isNotNull(job.jdEmbedding),
  ];

  // Role keyword OR
  if (roles.length > 0) {
    const roleConds = roles
      .filter((r) => r.trim().length > 1)
      .map((r) => ilike(job.title, `%${r.trim()}%`));
    const combined = or(...roleConds);
    if (combined) conds.push(combined as ReturnType<typeof ilike>);
  }

  // Location keyword OR
  if (locations.length > 0) {
    const locConds = locations
      .filter((l) => l.trim().length > 1)
      .map((l) => ilike(job.location, `%${l.trim()}%`));
    const combined = or(...locConds);
    if (combined) conds.push(combined as ReturnType<typeof ilike>);
  }

  // Seniority exclusions for junior
  const exclusions = ["%senior%", "%staff%", "%principal%", "%director%", "% vp %", "%head of%", "% lead %", "% ii%", "% iii%"];
  for (const pattern of exclusions) {
    conds.push(sql`${job.title} NOT ILIKE ${pattern}` as ReturnType<typeof ilike>);
  }

  // Run with hnsw.ef_search bumped (same as queries.ts)
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql.raw("SET LOCAL hnsw.ef_search = 200"));
    return tx
      .select({
        id: job.id,
        company: job.company,
        title: job.title,
        location: job.location,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        applyUrl: job.applyUrl,
        sim: sql<number>`1 - (${job.jdEmbedding} <=> ${vec}::vector)`,
      })
      .from(job)
      .where(sql.join(conds, sql` AND `))
      .orderBy(sql`${job.jdEmbedding} <=> ${vec}::vector`)
      .limit(15);
  });

  console.log(`top ${rows.length} junior US Greenhouse matches:\n`);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const sim = Number(r.sim).toFixed(3);
    const salary =
      r.salaryMin && r.salaryMax
        ? `$${(r.salaryMin / 1000).toFixed(0)}k–$${(r.salaryMax / 1000).toFixed(0)}k`
        : "salary not listed";
    console.log(`${(i + 1).toString().padStart(2)}. [${sim}] ${r.company} — ${r.title}`);
    console.log(`     ${r.location ?? "(no location)"} · ${salary}`);
    console.log(`     ${r.applyUrl}`);
    console.log(`     id: ${r.id}\n`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
