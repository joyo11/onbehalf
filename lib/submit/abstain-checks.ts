/**
 * Pure helpers for the abstain checks added in Phase 2B (final batch):
 *   - parseCityForResolver: require state/country in profile.location
 *     before we attempt city autocomplete (canonical Brooklyn-IL bug)
 *   - isOtherStylePick: spot a generic catch-all ("Other", "Prefer not
 *     to say", etc.) that an LLM picked, so we abstain instead of
 *     committing without the follow-up text
 *   - classifyFileInput: tell our known resume/cover-letter slots
 *     apart from unknown ones (transcript, portfolio, work sample)
 *     so we never upload the resume into the wrong slot
 *
 * All three are pure functions on purpose: they're the unit test
 * surface for the Brooklyn / Other / unknown-file abstain cases,
 * and the snapshot test in scripts/snapshot-abstain.ts pins them
 * against checked-in JSON.
 */

export type CityResolverInput =
  | { ok: true; city: string; region: string }
  | { ok: false; reason: string };

/**
 * Parse profile.location into city + state/country. Refuses single-token
 * locations like "Brooklyn" — the autocomplete-pick-first-option bug
 * means we'd silently get Brooklyn, Illinois on some boards. The
 * canonical fix per the 2026-05-30 sign-off: abstain if there's no
 * disambiguation, let Phase 3's gate route to needsHuman.
 */
export function parseCityForResolver(location: string | null | undefined): CityResolverInput {
  if (!location || typeof location !== "string") {
    return { ok: false, reason: "no_location_on_profile" };
  }
  const parts = location.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { ok: false, reason: "no_location_on_profile" };
  }
  if (parts.length === 1) {
    return { ok: false, reason: "no_state_or_country_on_profile" };
  }
  const city = parts[0];
  const region = parts.slice(1).join(", ");
  if (!city) return { ok: false, reason: "no_city_in_location" };
  return { ok: true, city, region };
}

/**
 * True when an option an LLM picked is a generic catch-all that
 * almost always requires a follow-up free-text input we can't
 * reliably fill from the same call ("Other", "Prefer not to say",
 * "Rather not specify", "None of the above").
 */
export function isOtherStylePick(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return (
    /^other\b/.test(v) ||
    /^prefer not\b/.test(v) ||
    /^i('| a)?(d|m)?\s*rather not/.test(v) ||
    /^none of the (above|listed|options)/.test(v) ||
    /^something else/.test(v)
  );
}

export type FileInputKind = "resume" | "cover_letter" | "unknown";

/**
 * Classify a file input by its name/id/label so we never upload the
 * resume PDF into a "transcript" slot. Anything we don't explicitly
 * recognize is "unknown" — Phase 3 then routes to needsHuman with
 * reason `unknown_file_input` rather than guessing.
 */
export function classifyFileInput(meta: {
  name?: string | null;
  id?: string | null;
  label?: string | null;
}): FileInputKind {
  const fields = [meta.name, meta.id, meta.label]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.toLowerCase());
  const joined = fields.join(" ");

  if (/resume|cv\b|curriculum vitae/.test(joined)) return "resume";
  if (/cover\s*letter|coverletter/.test(joined)) return "cover_letter";
  return "unknown";
}
