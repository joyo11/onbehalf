import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { oauthClient } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // OAuth errors → bounce to /settings (where the manual Connect button lives)
  // with a query param so we can show what went wrong. Never bounce back to a
  // page that would auto-retry, or we'll infinite-loop.
  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?gmail_error=${encodeURIComponent(error)}`, req.url),
    );
  }
  if (!code) {
    return NextResponse.redirect(new URL("/settings?gmail_error=no_code", req.url));
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const client = oauthClient(req);

  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/settings?gmail_error=no_refresh_token", req.url),
      );
    }

    await db
      .update(userTable)
      .set({
        gmailRefreshToken: tokens.refresh_token,
        gmailConnectedAt: new Date(),
      })
      .where(eq(userTable.id, user.id));

    // Success → /post-auth which decides where the user actually goes
    // (onboarding for new users, dashboard for returning ones).
    return NextResponse.redirect(new URL("/post-auth", req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth_failed";
    return NextResponse.redirect(
      new URL(`/settings?gmail_error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}
