import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { profile, user as userTable } from "../lib/db/schema";

const EMAIL = "shafay11august@gmail.com";

async function main() {
  const [u] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, EMAIL)).limit(1);
  if (!u) {
    console.error("No user");
    process.exit(1);
  }
  await db
    .update(profile)
    .set({
      needsSponsorship: true, // F-1 OPT → will need H1B sponsorship
      workAuthorization: "needs_sponsorship",
      githubUrl: null, // was literal "GitHub" — clear it
    })
    .where(eq(profile.userId, u.id));
  console.log("Profile fixed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
