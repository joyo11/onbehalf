import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { profile, user as userTable } from "../lib/db/schema";

const EMAIL = "shafay11august@gmail.com";

async function main() {
  const [u] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, EMAIL)).limit(1);
  if (!u) {
    console.error(`No user`);
    process.exit(1);
  }
  const [p] = await db
    .select({
      location: profile.location,
      countryOfResidence: profile.countryOfResidence,
      countryOfWork: profile.countryOfWork,
      workAuthorization: profile.workAuthorization,
      needsSponsorship: profile.needsSponsorship,
      githubUrl: profile.githubUrl,
      portfolioUrl: profile.portfolioUrl,
      linkedinUrl: profile.linkedinUrl,
    })
    .from(profile)
    .where(eq(profile.userId, u.id))
    .limit(1);
  console.log(JSON.stringify(p, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
