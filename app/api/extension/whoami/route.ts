import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Lightweight auth probe for the Chrome extension's popup.
 *
 * The extension calls this on open with `credentials: 'include'`
 * so the user's Clerk session cookie rides along. If the cookie's
 * present + valid, we return { signedIn: true, email }. Otherwise
 * { signedIn: false } — popup shows the "Open Onbehalf" button.
 *
 * CORS: extensions on Chrome with declared host_permissions can
 * make credentialed cross-origin fetches without us explicitly
 * setting Access-Control-Allow-Credentials. We do still need to
 * answer OPTIONS preflight if any browser version requires it —
 * Next handles that automatically when no custom headers are
 * required.
 */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ signedIn: false });
  }
  return NextResponse.json({
    signedIn: true,
    email: user.email,
    userId: user.id,
  });
}
