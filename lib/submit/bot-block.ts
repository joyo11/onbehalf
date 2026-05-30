import type { Page } from "playwright-core";

export type BotBlockResult = {
  blocked: boolean;
  signal: string | null;
  detail: string | null;
};

/**
 * Visible-only bot-block probe. Flags pages that are showing a CHALLENGE
 * to the user right now — image-grid reCAPTCHA, Cloudflare interstitial,
 * Turnstile widget, or text patterns like "verify you are human".
 *
 * Important: invisible reCAPTCHA v3 (which Greenhouse and many friendly
 * forms wire up) does NOT count as a block. Its iframe has zero bounding
 * box, so Playwright's `:visible` excludes it.
 *
 * Per the 2026-05-30 sign-off, this is a one-way signal:
 * blocked → application becomes `needsHuman` with reason
 * `bot_blocked_pre_fill` → the user takes over. This signal is NEVER
 * used as input to job matching, ranking, or routing away from
 * defended boards. See memory project-onbehalf-bot-block-one-way.
 */
export async function detectVisibleChallenge(page: Page): Promise<BotBlockResult> {
  // 1. reCAPTCHA v2 active challenge. The "bframe" iframe only mounts
  //    when the image-grid puzzle is being shown. The "anchor" (checkbox)
  //    is always present when v2 is wired up — we intentionally ignore
  //    it, because lots of normal forms have it as a step you click
  //    through. Only the actual challenge matters.
  const reChallenge = await page
    .locator("iframe[src*='/recaptcha/api2/bframe']:visible")
    .count()
    .catch(() => 0);
  if (reChallenge > 0) {
    return {
      blocked: true,
      signal: "recaptcha_v2_challenge",
      detail: "image-grid challenge iframe is visible",
    };
  }

  // 2. Cloudflare browser-check / managed-challenge interstitial.
  const cf = await page
    .locator(
      "#challenge-stage:visible, #cf-challenge-running:visible, #challenge-running:visible, #cf-wrapper:visible",
    )
    .count()
    .catch(() => 0);
  if (cf > 0) {
    return {
      blocked: true,
      signal: "cloudflare_challenge",
      detail: "CF interstitial mounted",
    };
  }

  // 3. Cloudflare Turnstile widget visible.
  const turnstile = await page
    .locator("iframe[src*='challenges.cloudflare.com']:visible")
    .count()
    .catch(() => 0);
  if (turnstile > 0) {
    return {
      blocked: true,
      signal: "cloudflare_turnstile",
      detail: "turnstile widget visible",
    };
  }

  // 4. Text patterns in the rendered body. Scoped to the first ~8K chars
  //    so we don't scan transitively-loaded analytics blobs.
  const bodyText = (await page.locator("body").textContent().catch(() => "")) ?? "";
  const head = bodyText.slice(0, 8000);
  const textPatterns: Array<{ name: string; pattern: RegExp }> = [
    { name: "verify_human", pattern: /verify (?:you are )?(?:a )?human/i },
    { name: "complete_captcha", pattern: /please complete the captcha/i },
    { name: "checking_browser", pattern: /checking your browser before/i },
    { name: "unusual_traffic", pattern: /unusual traffic from your (?:computer )?network/i },
    { name: "security_check", pattern: /^.{0,200}security check (?:required|in progress)/im },
    { name: "are_you_robot", pattern: /are you (?:a )?robot\??/i },
    { name: "access_denied", pattern: /access denied.{0,80}(?:bot|automated)/i },
  ];
  for (const { name, pattern } of textPatterns) {
    if (pattern.test(head)) {
      return {
        blocked: true,
        signal: `text_pattern:${name}`,
        detail: head.match(pattern)?.[0]?.slice(0, 120) ?? null,
      };
    }
  }

  return { blocked: false, signal: null, detail: null };
}
