export const TAILOR_RESUME_SYSTEM = `You are an expert resume editor. Your job is to rewrite an existing resume's bullet points to maximize relevance to a specific job description.

HARD RULES — these are non-negotiable:
- NEVER invent experience, employers, dates, technologies, or metrics that aren't already in the resume.
- NEVER change job titles, employers, or dates.
- NEVER claim skills the candidate didn't claim.
- You may REORDER bullets, REPHRASE them to match the JD's language, EMPHASIZE relevant work, or DROP a bullet that's not relevant to this role.
- The candidate's voice must remain recognizably theirs — don't replace concrete details with generic marketing language.

For each experience role provided, output a list of rewritten bullets. Each bullet has:
- original: the original text (verbatim) OR null if this is a new bullet you wrote from existing details
- rewritten: the new text (or null if you're recommending dropping the original)
- reasoning: one short sentence explaining the change ("Mirrors the JD phrase 'tight 1–2 week loops'", "Reordered to lead with Kubernetes — JD mentions it 4 times", "Dropped — not relevant to this role")

Also output a "summary" — ONE sentence describing the overall change, for the Application Tracker. Examples:
- "Reordered to lead with Python; added Kubernetes emphasis; dropped React bullet."
- "Surfaced design-system leadership; swapped infra bullet for craft-focused one."

If the candidate has no relevant experience for this role, return all bullets as-is and set summary to "No tailoring — JD matched candidate's experience as-is."`;

export const TAILOR_RESUME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section_id: { type: "string" },
          bullets: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                original: { type: ["string", "null"] },
                rewritten: { type: ["string", "null"] },
                reasoning: { type: "string" },
              },
              required: ["original", "rewritten", "reasoning"],
            },
          },
        },
        required: ["section_id", "bullets"],
      },
    },
    summary: { type: "string" },
  },
  required: ["sections", "summary"],
} as const;

export type TailoredBullet = {
  original: string | null;
  rewritten: string | null;
  reasoning: string;
};

export type TailoredSection = {
  section_id: string;
  bullets: TailoredBullet[];
};

export type TailoringResult = {
  sections: TailoredSection[];
  summary: string;
};

export function buildTailorResumeUser({
  jobTitle,
  company,
  jdText,
  resumeSections,
}: {
  jobTitle: string;
  company: string;
  jdText: string;
  resumeSections: Array<{
    id: string;
    title: string;
    organization: string | null;
    startDate: string | null;
    endDate: string | null;
    bullets: string[];
  }>;
}): string {
  const sectionsBlock = resumeSections
    .map(
      (s) => `[section_id: ${s.id}]
${s.title}${s.organization ? ` · ${s.organization}` : ""}${s.startDate || s.endDate ? ` (${[s.startDate, s.endDate].filter(Boolean).join(" — ")})` : ""}
Bullets:
${s.bullets.map((b, i) => `  ${i + 1}. ${b}`).join("\n")}`,
    )
    .join("\n\n");

  return `Job title: ${jobTitle}
Company: ${company}

Job description:
${jdText.slice(0, 8000)}

Candidate's current experience:
${sectionsBlock}

Rewrite the bullets to maximize relevance to this job. Follow all rules in the system prompt. Output JSON matching the schema.`;
}
