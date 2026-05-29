import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { GMAIL_SCOPES, oauthClient } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(
      new URL("/onboarding?gmail_error=google_oauth_not_configured", req.url),
    );
  }

  try {
    const client = oauthClient(req);
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES,
      state: user.clerkId,
    });
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth_init_failed";
    return NextResponse.redirect(
      new URL(`/onboarding?gmail_error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}
