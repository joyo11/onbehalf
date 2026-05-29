import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile } from "@/lib/db/schema";
import SearchScreen, { type SearchDefaults } from "./client";

export default async function SearchPage() {
  const user = await getCurrentUser();

  let defaults: SearchDefaults = {
    targetRoles: [],
    preferredLocations: [],
    excludedCompanies: [],
    desiredSalaryMin: null,
  };

  if (user) {
    const [p] = await db
      .select({
        targetRoleTitles: profile.targetRoleTitles,
        preferredLocations: profile.preferredLocations,
        excludedCompanies: profile.excludedCompanies,
        desiredSalaryMin: profile.desiredSalaryMin,
      })
      .from(profile)
      .where(eq(profile.userId, user.id))
      .limit(1);
    if (p) {
      defaults = {
        targetRoles: p.targetRoleTitles ?? [],
        preferredLocations: p.preferredLocations ?? [],
        excludedCompanies: p.excludedCompanies ?? [],
        desiredSalaryMin: p.desiredSalaryMin,
      };
    }
  }

  return <SearchScreen defaults={defaults} />;
}
