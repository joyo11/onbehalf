import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile, user as userTable } from "@/lib/db/schema";
import SettingsScreen, { type SettingsHeader } from "./client";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  let name = "Your profile";
  let email = "";
  let memberSince = "";
  const plan = "Free";
  let gmailConnectedAt: string | null = null;

  if (user) {
    email = user.email;
    memberSince = new Date(user.createdAt).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const [[p], [u]] = await Promise.all([
      db
        .select({ fullName: profile.fullName })
        .from(profile)
        .where(eq(profile.userId, user.id))
        .limit(1),
      db
        .select({ gmailConnectedAt: userTable.gmailConnectedAt })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1),
    ]);
    name = p?.fullName ?? email.split("@")[0];
    gmailConnectedAt = u?.gmailConnectedAt
      ? new Date(u.gmailConnectedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;
  }

  const header: SettingsHeader = { name, email, memberSince, plan, gmailConnectedAt };

  return <SettingsScreen header={header} />;
}
