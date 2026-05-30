import Anthropic from "@anthropic-ai/sdk";
import { isOtherStylePick } from "./abstain-checks";
import type { ResolvedField, SubmissionProfile } from "./types";

/**
 * Phase 2 — resolve a single form field's answer with a confidence signal.
 *
 * Today this handles the SELECT case: given a question and the form's
 * actual visible options, an LLM picks one or returns __ABSTAIN__.
 * Text/textarea answers continue to live in smart-fill.ts (which Phase 2A
 * leaves untouched); they'll come through here in Phase 2B.
 *
 * The whole point of the confidence signal is Phase 3's stop-at-submit
 * gate: anything that isn't `high` routes to needsHuman. Per the
 * 2026-05-30 sign-off (see memory feedback-relax-with-evidence), the
 * strict default is "submit only on high" and we loosen later with
 * evidence.
 */

export type Confidence = "high" | "medium" | "low" | "abstain";

export type FieldResolution = {
  value: string | null;
  confidence: Confidence;
  source: "profile" | "deterministic" | "llm" | "abstain";
  reason: string;
};

export type ResolveSelectInput = {
  label: string;
  helperText?: string;
  availableOptions: string[];
  profile: SubmissionProfile;
  jobCtx: { company: string; title: string; jdSummary: string };
};

const ABSTAIN_SENTINEL = "__ABSTAIN__";
const ANTHROPIC_TIMEOUT_MS = 8_000;

const SYSTEM_PROMPT = `You are filling in a job application on behalf of a real candidate. The form-filler has run out of deterministic mappings for one of the fields, so you're picking from the actual visible options.

You will be given:
- A question (the field's label, exactly as the candidate sees it)
- A list of options the form actually offers
- A small slice of the candidate's profile and the job context

Your job: pick the SINGLE option that best fits the candidate. If no option fits — for example the question is "Are you US-authorized?" and the only options are unrelated countries — respond with the literal string ${ABSTAIN_SENTINEL}.

Hard rules:
- Output ONLY the chosen option's text verbatim, exactly as it appears in the list, OR the literal ${ABSTAIN_SENTINEL}.
- No quotes, no explanation, no JSON, no extra whitespace.
- NEVER invent an option that isn't in the list.
- For referral-source questions ("How did you hear about us?"), prefer LinkedIn if available; otherwise pick the closest channel actually offered (Job board / Company website / Other). If only "Employee referral" types are listed and no general option exists, abstain.
- For yes/no questions where the candidate is genuinely unsure, abstain rather than guess.
- For agreement / privacy / "I agree" dropdowns where the affirmative option clearly exists ("I agree", "Yes", "I consent"), pick it.`;

function slimProfile(profile: SubmissionProfile): Record<string, unknown> {
  return {
    fullName: profile.fullName,
    location: profile.location,
    currentCompany: profile.currentCompany,
    currentJobTitle: profile.currentJobTitle,
    linkedinUrl: profile.linkedinUrl,
    portfolioUrl: profile.portfolioUrl,
    githubUrl: profile.githubUrl,
    workAuthorization: profile.workAuthorization,
    needsSponsorship: profile.needsSponsorship,
    currentlyAuthorizedUS: profile.currentlyAuthorizedUS,
    countryOfResidence: profile.countryOfResidence,
    countryOfWork: profile.countryOfWork,
    skillYears: profile.skillYears,
  };
}

function buildUserPrompt(input: ResolveSelectInput): string {
  const slim = slimProfile(input.profile);
  const optionsBlock = input.availableOptions
    .map((opt, i) => `  ${i + 1}. ${opt}`)
    .join("\n");
  const jdSummary =
    input.jobCtx.jdSummary.trim().length > 0
      ? input.jobCtx.jdSummary
      : "(no JD summary available — work from company + title)";
  return [
    "QUESTION",
    input.label,
    input.helperText ? `Helper text: ${input.helperText}` : "",
    "",
    "OPTIONS",
    optionsBlock,
    "",
    "JOB CONTEXT",
    `Company: ${input.jobCtx.company}`,
    `Title: ${input.jobCtx.title}`,
    `JD summary: ${jdSummary}`,
    "",
    "CANDIDATE PROFILE",
    JSON.stringify(slim, null, 2),
    "",
    `Respond with exactly one option from the list above (verbatim) or ${ABSTAIN_SENTINEL}.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Ask Claude to pick one option from a real list. Returns the picked
 * option string or null (with confidence=abstain).
 *
 * Strict server-side validation: the model's output must match one of
 * the options the form actually offers. A model that hallucinates an
 * option is treated as abstain — Phase 3's gate will route this to
 * needsHuman, the right outcome.
 */
export async function resolveSelectField(
  input: ResolveSelectInput,
): Promise<FieldResolution> {
  if (input.availableOptions.length === 0) {
    return {
      value: null,
      confidence: "abstain",
      source: "abstain",
      reason: "no options visible — likely a closed React-Select menu",
    };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      value: null,
      confidence: "abstain",
      source: "abstain",
      reason: "ANTHROPIC_API_KEY missing — no LLM available",
    };
  }

  const client = new Anthropic();
  const userPrompt = buildUserPrompt(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

  try {
    const tryModels: string[] = ["claude-haiku-4-5", "claude-sonnet-4-6"];
    let pickedRaw: string | null = null;

    for (const model of tryModels) {
      try {
        const response = await client.messages.create(
          {
            model,
            max_tokens: 200,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userPrompt }],
          },
          { signal: controller.signal },
        );
        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") continue;
        pickedRaw = textBlock.text.trim();
        break;
      } catch {
        if (controller.signal.aborted) break;
      }
    }

    if (!pickedRaw) {
      return {
        value: null,
        confidence: "abstain",
        source: "abstain",
        reason: "LLM returned no text or call timed out",
      };
    }

    // Strip accidental quotes or trailing punctuation.
    const cleaned = pickedRaw.replace(/^["'`]+|["'`]+$/g, "").trim();

    if (cleaned === ABSTAIN_SENTINEL) {
      return {
        value: null,
        confidence: "abstain",
        source: "llm",
        reason: "LLM explicitly abstained — no good option in the list",
      };
    }

    // Strict server-side validation: must be EXACTLY one of the options.
    // Case-insensitive comparison so trivial casing differences don't
    // force an abstain, but the value we return is the form's canonical
    // text (so the click matches).
    const lower = cleaned.toLowerCase();
    const match = input.availableOptions.find(
      (opt) => opt.trim().toLowerCase() === lower,
    );
    if (!match) {
      return {
        value: null,
        confidence: "abstain",
        source: "abstain",
        reason: `LLM picked "${cleaned.slice(0, 40)}" which isn't in the option list — treated as abstain`,
      };
    }

    // Phase 2B abstain check — refuse "Other"-style picks. These almost
    // always come with a follow-up free-text field we can't reliably
    // commit to from the same LLM call, so picking "Other" without the
    // text is just a wrong answer in disguise. Abstain instead; Phase 3
    // gates to needsHuman.
    if (isOtherStylePick(match)) {
      return {
        value: null,
        confidence: "abstain",
        source: "abstain",
        reason: `LLM picked "${match}" — Other-style picks need a follow-up text input we can't commit to from one call`,
      };
    }

    return {
      value: match,
      confidence: "medium",
      source: "llm",
      reason: `LLM picked from ${input.availableOptions.length} visible option${input.availableOptions.length === 1 ? "" : "s"}`,
    };
  } catch {
    return {
      value: null,
      confidence: "abstain",
      source: "abstain",
      reason: "LLM call threw",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience constructor — assemble a ResolvedField from a resolution + the label. */
export function toResolvedField(
  label: string,
  resolution: FieldResolution,
): ResolvedField {
  return {
    label,
    value: resolution.value,
    source: resolution.source,
    confidence: resolution.confidence,
    reason: resolution.reason,
  };
}
