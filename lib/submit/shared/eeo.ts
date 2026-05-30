/**
 * EEO answer-to-option translation.
 *
 * Users pick internal codes ("man", "asian", "yes_protected") in
 * Settings. Greenhouse / Lever / Ashby forms render the spelled-out
 * label ("Male", "Asian", "I identify as one or more of the
 * classifications of a protected veteran"). This catalog maps between
 * them so the fuzzy matcher and the resolver see a normalized answer.
 *
 * Pure module — no Node, no Playwright. Imported by both the server
 * (lib/submit/greenhouse.ts) and the Chrome extension content script.
 */

export type EeoKind =
  | "gender"
  | "hispanic"
  | "race"
  | "veteran"
  | "disability"
  | "sexual_orientation";

export function mapEeoToOption(value: string, kind: EeoKind): string {
  if (value === "decline") {
    if (kind === "disability") return "I do not wish to answer";
    if (kind === "veteran") return "I don't wish to answer";
    if (kind === "sexual_orientation") return "I don't wish to answer";
    return "Decline to self-identify";
  }
  if (kind === "sexual_orientation") {
    if (value === "straight") return "Heterosexual";
    if (value === "gay") return "Gay";
    if (value === "lesbian") return "Lesbian";
    if (value === "bisexual") return "Bisexual";
    if (value === "queer") return "Queer";
    if (value === "asexual") return "Asexual";
    if (value === "pansexual") return "Pansexual";
    if (value === "other") return "Other";
  }
  // Users pick "Man" / "Woman" in Settings. Forms use "Male" / "Female".
  // Translate so the matcher commits the right answer.
  if (kind === "gender") {
    if (value === "man") return "Male";
    if (value === "woman") return "Female";
    if (value === "non_binary") return "Non-binary";
    if (value === "other") return "Other";
  }
  if (kind === "hispanic") {
    if (value === "yes") return "Yes";
    if (value === "no") return "No";
  }
  if (kind === "race") {
    if (value === "asian") return "Asian";
    if (value === "black") return "Black or African American";
    if (value === "hispanic_latino") return "Hispanic or Latino";
    if (value === "native_american") return "American Indian or Alaska Native";
    if (value === "pacific_islander") return "Native Hawaiian or Other Pacific Islander";
    if (value === "white") return "White";
    if (value === "two_or_more") return "Two or More Races";
  }
  if (kind === "veteran") {
    if (value === "yes_protected")
      return "I identify as one or more of the classifications of a protected veteran";
    if (value === "no") return "I am not a protected veteran";
  }
  if (kind === "disability") {
    if (value === "yes") return "Yes, I have a disability";
    if (value === "no") return "No, I do not have a disability";
  }
  // Pass-through anything we don't recognize.
  return value;
}
