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

  // 3. Cloudflare Turnstile. Two signals:
  //    (a) the host element on the parent page (Cloudflare's recommended
  //        wiring puts a <div class="cf-turnstile"> on the page; we use
  //        that specific class only — generic [data-sitekey] is shared
  //        by reCAPTCHA and would false-positive on every Google demo)
  //    (b) any frame on the page (including nested iframes) whose URL
  //        points at challenges.cloudflare.com / turnstile.
  const turnstileHost = await page
    .locator(".cf-turnstile:visible")
    .count()
    .catch(() => 0);
  if (turnstileHost > 0) {
    return {
      blocked: true,
      signal: "cloudflare_turnstile_host",
      detail: "cf-turnstile host element on parent page",
    };
  }
  for (const frame of page.frames()) {
    const fu = frame.url();
    if (/challenges?\.cloudflare\.com|turnstile/i.test(fu)) {
      return {
        blocked: true,
        signal: "cloudflare_turnstile_frame",
        detail: fu.slice(0, 200),
      };
    }
  }

  // 4. Text patterns. The hardest case: a Cloudflare Turnstile renders
  //    "Verify you are human" *inside* the iframe, which isn't in the
  //    main document's body.textContent(). So we scan every frame's
  //    body, not just the main page's.
  const textPatterns: Array<{ name: string; pattern: RegExp }> = [
    { name: "verify_human", pattern: /verify (?:you are )?(?:a )?human/i },
    { name: "complete_captcha", pattern: /please complete the captcha/i },
    { name: "checking_browser", pattern: /checking your browser before/i },
    { name: "unusual_traffic", pattern: /unusual traffic from your (?:computer )?network/i },
    { name: "security_check", pattern: /^.{0,200}security check (?:required|in progress)/im },
    { name: "are_you_robot", pattern: /are you (?:a )?robot\??/i },
    { name: "access_denied", pattern: /access denied.{0,80}(?:bot|automated)/i },
  ];
  for (const frame of page.frames()) {
    const bodyText = (await frame.locator("body").textContent().catch(() => "")) ?? "";
    const head = bodyText.slice(0, 8000);
    if (!head) continue;
    for (const { name, pattern } of textPatterns) {
      if (pattern.test(head)) {
        return {
          blocked: true,
          signal: `text_pattern:${name}`,
          detail: (head.match(pattern)?.[0] ?? "").slice(0, 120),
        };
      }
    }
  }

  return { blocked: false, signal: null, detail: null };
}
