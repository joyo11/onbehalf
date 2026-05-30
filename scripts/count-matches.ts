import { eq, sql, ilike, or, and, isNotNull } from "drizzle-orm";
import { db } from "../lib/db/client";
import { job, profile, user } from "../lib/db/schema";

async function main() {
  const [u] = await db.select().from(user).where(eq(user.email, "shafay11august@gmail.com")).limit(1);
  if (!u) { console.log("no user"); process.exit(1); }
  const [p] = await db.select().from(profile).where(eq(profile.userId, u.id)).limit(1);
  console.log("targetRoles:", p?.targetRoleTitles);
  console.log("preferredLocations:", p?.preferredLocations);
  console.log("seniorityLevel:", p?.seniorityLevel);
  console.log("desiredSalaryMin:", p?.desiredSalaryMin);

  const roles = (p?.targetRoleTitles ?? []) as string[];
  const locs = (p?.preferredLocations ?? []) as string[];

  // unfiltered active
  const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(job).where(eq(job.isActive, true));
  console.log("active:", a.n);

  // With role filter
  if (roles.length > 0) {
    const roleConds = roles.map((r) => ilike(job.title, `%${r}%`));
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(job)
      .where(and(eq(job.isActive, true), or(...roleConds)));
    console.log("active + role filter:", r.n);
  }

  // With role + location
  if (roles.length > 0 && locs.length > 0) {
    const roleConds = roles.map((r) => ilike(job.title, `%${r}%`));
    const locConds = locs.map((l) => ilike(job.location, `%${l}%`));
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(job)
      .where(and(eq(job.isActive, true), or(...roleConds), or(...locConds)));
    console.log("active + role + location:", r.n);
  }

  // active with embedding (pgvector path requires this)
  const [e] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(job)
    .where(and(eq(job.isActive, true), isNotNull(job.jdEmbedding)));
  console.log("active + has-embedding:", e.n);

  process.exit(0);
}
main();
