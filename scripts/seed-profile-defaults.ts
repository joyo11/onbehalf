/**
 * Set US-based defaults on the test user's profile so dry-run fills US
 * country dropdowns + 'decline' on EEO without needing the UI yet.
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { profile, user as userTable } from "../lib/db/schema";

const EMAIL = "shafay11august@gmail.com";

async function main() {
  const [u] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, EMAIL))
    .limit(1);
  if (!u) {
    console.error(`No user ${EMAIL}`);
    process.exit(1);
  }
  await db
    .update(profile)
    .set({
      preferredName: "Shafay",
      countryOfResidence: "United States",
      countryOfWork: "United States",
      employmentRestrictions: false,
      previouslyWorkedHere: false,
      accommodationsNeeded: "None at this time.",
      // EEO already default 'decline' on insert; explicit for clarity.
      eeoGender: "decline",
      eeoHispanicLatino: "decline",
      eeoRaceEthnicity: "decline",
      eeoVeteranStatus: "decline",
      eeoDisabilityStatus: "decline",
    })
    .where(eq(profile.userId, u.id));
  console.log("Defaults seeded.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
