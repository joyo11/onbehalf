import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile } from "@/lib/db/schema";
import SettingsScreen, { type SettingsHeader } from "./client";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  let name = "Your profile";
  let email = "";
  let memberSince = "";
  const plan = "Free";

  if (user) {
    email = user.email;
    memberSince = new Date(user.createdAt).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const [p] = await db.select().from(profile).where(eq(profile.userId, user.id)).limit(1);
    name = p?.fullName ?? email.split("@")[0];
  }

  const header: SettingsHeader = { name, email, memberSince, plan };

  return <SettingsScreen header={header} />;
}
