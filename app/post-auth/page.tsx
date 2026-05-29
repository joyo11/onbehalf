import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile, user as userTable } from "@/lib/db/schema";

/**
 * Central post-authentication router. Clerk redirects here after both
 * sign-in and sign-up. Decides where the user actually belongs.
 *
 * Priority:
 *   1. User signed in with Google AND Gmail readonly not granted yet
 *      → auto-trigger /api/auth/google/start (Option A: two consent screens
 *        in a row, no manual button)
 *   2. Profile incomplete (no fullName or no target roles)
 *      → /onboarding
 *   3. Otherwise → /dashboard
 */
export default async function PostAuthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // 1. Gmail auto-flow: did they sign in via Google? Do we already have their refresh token?
  const clerk = await currentUser();
  const signedInWithGoogle =
    clerk?.externalAccounts?.some((a) => a.provider === "oauth_google") ?? false;

  const [u] = await db
    .select({
      gmailRefreshToken: userTable.gmailRefreshToken,
    })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1);

  const hasGmail = Boolean(u?.gmailRefreshToken);
  const googleOAuthConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  if (signedInWithGoogle && !hasGmail && googleOAuthConfigured) {
    redirect("/api/auth/google/start");
  }

  // 2. Profile completeness gate
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
