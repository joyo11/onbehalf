/**
 * Synthetic test for Phase A's detectVisibleChallenge.
 *
 * Opens a Browserbase session, navigates to each test URL, runs the
 * probe, prints the result. Use this to verify both:
 *   - Negative cases (healthy forms) return blocked=false
 *   - Positive cases (visible challenges) return blocked=true with a
 *     correct signal
 *
 * Adds a screenshot for each so you can eyeball the page state at
 * probe time.
 */
import { writeFileSync } from "node:fs";
import { startSession } from "../lib/submit/browserbase";
import { detectVisibleChallenge } from "../lib/submit/bot-block";

type Case = { name: string; url: string; expect: "blocked" | "ok" };

const CASES: Case[] = [
  // Negative — healthy Ashby form. Should return blocked=false. Linear's
  // applications use invisible reCAPTCHA v3 (the iframe has zero bbox),
  // which our :visible probe correctly excludes.
  {
    name: "linear-ashby-healthy",
    url: "https://jobs.ashbyhq.com/linear/d37b3d76-3080-47f9-8a19-60505573112c/application",
    expect: "ok",
  },
  // Positive — a known visible-reCAPTCHA test page. Google's own demo
  // for v2 with explicit challenge.
  {
    name: "google-recaptcha-v2-demo",
    url: "https://www.google.com/recaptcha/api2/demo",
    expect: "ok", // shows the anchor by default; clicking would render the bframe
  },
  // Positive — Cloudflare's own demo page that triggers a challenge.
  {
    name: "cloudflare-challenge-demo",
    url: "https://nowsecure.nl/",
    expect: "blocked",
  },
];

async function main() {
  for (const c of CASES) {
    console.log(`\n=== ${c.name} (expect=${c.expect}) ===`);
    console.log(`url: ${c.url}`);
    const session = await startSession();
    try {
      await session.page.goto(c.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await session.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      // Same 2s settle the orchestrator uses
      await session.page.waitForTimeout(2000);
      const result = await detectVisibleChallenge(session.page);
      console.log("result:", JSON.stringify(result));

      // Screenshot for eyeball verification
      const shot = await session.page.screenshot({ fullPage: true, type: "jpeg", quality: 70 });
      const path = `/tmp/botblock-${c.name}.jpg`;
      writeFileSync(path, shot);
      console.log("screenshot:", path);

      const pass =
        (c.expect === "blocked" && result.blocked) ||
        (c.expect === "ok" && !result.blocked);
      console.log("verdict:", pass ? "PASS" : "FAIL");
    } catch (e) {
      console.error("error:", e instanceof Error ? e.message : "unknown");
    } finally {
      await session.close();
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
