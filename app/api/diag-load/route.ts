import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Diagnostic endpoint: tries to load each module that's been suspected of
 * failing at runtime, and reports the exact error message + stack for the
 * one that breaks. Public (no auth) because it carries no secrets and is
 * temporary scaffolding for the queue debug.
 */
export async function GET() {
  const results: Array<{ module: string; ok: boolean; error?: string }> = [];

  const trials = [
    { module: "@browserbasehq/sdk", load: () => import("@browserbasehq/sdk") },
    { module: "playwright-core", load: () => import("playwright-core") },
    { module: "@/lib/submit/browserbase", load: () => import("@/lib/submit/browserbase") },
    { module: "@/lib/submit/greenhouse", load: () => import("@/lib/submit/greenhouse") },
    { module: "@/lib/submit/orchestrate", load: () => import("@/lib/submit/orchestrate") },
    { module: "@/lib/tailor", load: () => import("@/lib/tailor") },
  ];

  for (const t of trials) {
    try {
      await t.load();
      results.push({ module: t.module, ok: true });
    } catch (e) {
      results.push({
        module: t.module,
        ok: false,
        error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e),
      });
    }
  }

  return NextResponse.json({ results }, { status: 200 });
}
