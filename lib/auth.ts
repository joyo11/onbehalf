import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "./db/client";
import { user, type User } from "./db/schema";

/**
 * Get the current Clerk user's row from our `user` table. Creates one on first
 * request if it doesn't exist yet. Returns null if the user is not signed in.
 *
 * Cached per server request so we only hit the DB once per render.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const [existing] = await db.select().from(user).where(eq(user.clerkId, clerkId)).limit(1);
  if (existing) return existing;

  // First request from this Clerk user — provision a row.
  const clerk = await currentUser();
  const email = clerk?.emailAddresses?.[0]?.emailAddress;
  if (!email) {
    throw new Error(`Clerk user ${clerkId} has no primary email — cannot provision DB row.`);
  }

  const [created] = await db
    .insert(user)
    .values({ clerkId, email })
    .returning();
  return created;
});

/**
 * Same as getCurrentUser but throws if there's no signed-in user. Use this in
 * server components/routes where the route is already protected by middleware
 * and an unauthenticated request would be a programming error.
 */
export async function requireCurrentUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new Error("requireCurrentUser called without a signed-in user");
  return u;
}
