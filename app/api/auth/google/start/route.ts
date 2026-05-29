import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { GMAIL_SCOPES, oauthClient } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const client = oauthClient(req);

  const url = client.generateAuthUrl({
    access_type: "offline", // get a refresh token
    prompt: "consent", // force refresh-token issuance even on re-auth
    scope: GMAIL_SCOPES,
    // Pass the Clerk userId through state so we can tie the callback to the right user.
    state: user.clerkId,
  });

  return NextResponse.redirect(url);
}
