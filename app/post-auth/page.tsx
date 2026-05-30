import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile } from "@/lib/db/schema";

/**
 * Central post-authentication router. Clerk redirects here after sign-in /
 * sign-up. Decides where the user actually belongs.
 *
 * Gmail readonly is now OPTIONAL — we no longer auto-redirect Google
 * sign-ins to the Gmail consent step. Reason: Gmail readonly is a Google-
 * restricted scope (test users only until verification), which blocks
 * public sign-up entirely. The agent works fine without it; users can opt
 * in from Settings any time to enable auto-confirmation tracking.
 *
 * Priority:
 *   1. Profile incomplete (no fullName or no target roles) → /onboarding
 *   2. Otherwise → /dashboard
 */
export default async function PostAuthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const [p] = await db
    .select({
      fullName: profile.fullName,
      targetRoleTitles: profile.targetRoleTitles,
    })
    .from(profile)
    .where(eq(profile.userId, user.id))
    .limit(1);

  const profileComplete = Boolean(p?.fullName && (p.targetRoleTitles?.length ?? 0) > 0);
  if (!profileComplete) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
