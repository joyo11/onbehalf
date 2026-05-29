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

  if (error) {
    return NextResponse.redirect(
      new URL(`/onboarding?gmail_error=${encodeURIComponent(error)}`, req.url),
    );
  }
  if (!code) {
    return NextResponse.redirect(new URL("/onboarding?gmail_error=no_code", req.url));
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const client = oauthClient(req);

  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      // Google only issues a refresh token on first consent. If the user has
      // connected before and is re-connecting, we may not get one — tell them
      // to revoke access at myaccount.google.com and try again.
      return NextResponse.redirect(
        new URL("/onboarding?gmail_error=no_refresh_token", req.url),
      );
    }

    await db
      .update(userTable)
      .set({
        gmailRefreshToken: tokens.refresh_token,
        gmailConnectedAt: new Date(),
      })
      .where(eq(userTable.id, user.id));

    return NextResponse.redirect(new URL("/onboarding?gmail=connected", req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth_failed";
    return NextResponse.redirect(
      new URL(`/onboarding?gmail_error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}
