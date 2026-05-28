export type AtsSource = "greenhouse" | "lever" | "ashby";

export type SeedCompany = {
  name: string;
  source: AtsSource;
  slug: string; // the ATS board slug (NOT the company website)
};

/**
 * Hand-curated seed list of well-known companies whose careers pages are
 * publicly accessible via the corresponding ATS API. Most slugs are the
 * lowercase company name, with a few exceptions confirmed by hitting each
 * board's public URL.
 *
 * Greenhouse: https://boards.greenhouse.io/{slug}
 * Lever: https://jobs.lever.co/{slug}
 */
export const SEED_COMPANIES: SeedCompany[] = [
  // ── Greenhouse ──────────────────────────────
  { name: "Anthropic", source: "greenhouse", slug: "anthropic" },
  { name: "Stripe", source: "greenhouse", slug: "stripe" },
  { name: "Airbnb", source: "greenhouse", slug: "airbnb" },
  { name: "Vercel", source: "greenhouse", slug: "vercel" },
  { name: "Linear", source: "greenhouse", slug: "linear" },
  { name: "Notion", source: "greenhouse", slug: "notion" },
  { name: "Figma", source: "greenhouse", slug: "figma" },
  { name: "Ramp", source: "greenhouse", slug: "ramp" },
  { name: "Mercury", source: "greenhouse", slug: "mercury" },
  { name: "Plaid", source: "greenhouse", slug: "plaid" },
  { name: "Retool", source: "greenhouse", slug: "retool" },
  { name: "Vanta", source: "greenhouse", slug: "vanta" },
  { name: "Datadog", source: "greenhouse", slug: "datadog" },
  { name: "Brex", source: "greenhouse", slug: "brex" },
  { name: "Loom", source: "greenhouse", slug: "loom" },
  { name: "Replit", source: "greenhouse", slug: "replit" },
  { name: "Substack", source: "greenhouse", slug: "substackinc" },
  { name: "Airtable", source: "greenhouse", slug: "airtable" },
  { name: "Webflow", source: "greenhouse", slug: "webflow" },
  { name: "Cloudflare", source: "greenhouse", slug: "cloudflare" },
  { name: "Reddit", source: "greenhouse", slug: "reddit" },
  { name: "Discord", source: "greenhouse", slug: "discord" },
  { name: "Pinterest", source: "greenhouse", slug: "pinterest" },
  { name: "Robinhood", source: "greenhouse", slug: "robinhood" },
  { name: "DoorDash", source: "greenhouse", slug: "doordash" },
  { name: "Instacart", source: "greenhouse", slug: "instacart" },
  { name: "Coinbase", source: "greenhouse", slug: "coinbase65" },
  { name: "Affirm", source: "greenhouse", slug: "affirm" },
  { name: "Dropbox", source: "greenhouse", slug: "dropbox" },
  { name: "Twilio", source: "greenhouse", slug: "twilio" },
  { name: "Asana", source: "greenhouse", slug: "asana" },
  { name: "GitLab", source: "greenhouse", slug: "gitlab" },
  { name: "Sentry", source: "greenhouse", slug: "sentry" },
  { name: "PostHog", source: "greenhouse", slug: "posthog" },
  { name: "Modal Labs", source: "greenhouse", slug: "modallabs" },
  { name: "Perplexity", source: "greenhouse", slug: "perplexity" },
  { name: "Hugging Face", source: "greenhouse", slug: "huggingface" },

  // ── Lever ───────────────────────────────────
  { name: "Netflix", source: "lever", slug: "netflix" },
  { name: "Cursor", source: "lever", slug: "anysphere" },
  { name: "Spotify", source: "lever", slug: "spotify" },
  { name: "Box", source: "lever", slug: "box" },
  { name: "Eventbrite", source: "lever", slug: "eventbrite" },
  { name: "Lyft", source: "lever", slug: "lyft" },
  { name: "Twitch", source: "lever", slug: "twitch" },
  { name: "KeepTruckin", source: "lever", slug: "keeptruckin" },
  { name: "Mistral AI", source: "lever", slug: "mistral" },
  { name: "Mux", source: "lever", slug: "mux" },
  { name: "Census", source: "lever", slug: "census" },
];
