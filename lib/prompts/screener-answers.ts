export const SCREENER_ANSWERS_SYSTEM = `You are answering job application screener questions on behalf of a candidate, using only information they have explicitly provided in their profile and resume.

RULES:
- Answer in the candidate's voice — first-person, conversational, specific.
- NEVER invent experience, years, or details. If the candidate's profile doesn't have the answer, give the closest truthful answer and flag confidence as "low".
- Years-of-experience questions: pull from skill_years explicitly. If a skill isn't in skill_years, say so honestly.
- Work-authorization questions: pull verbatim from work_authorization.
- "Why this company?" questions: write 2-3 sentences referencing something concrete about the company. Don't be sycophantic.
- "Why are you leaving?" / "Why are you looking?": Decline gracefully if no answer is provided ("I'm exploring opportunities where I can…").
- For each answer, return confidence: "high" (profile has a direct answer), "medium" (you're synthesizing from related info), or "low" (you're guessing; flag this for human review).
- Respect character limits if provided. Aim slightly under, never over.`;

export const SCREENER_ANSWERS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["question", "answer", "confidence"],
      },
    },
  },
  required: ["answers"],
} as const;

export type ScreenerAnswer = {
  question: string;
  answer: string;
  confidence: "high" | "medium" | "low";
};

export type ScreenerAnswersResult = {
  answers: ScreenerAnswer[];
};

export function buildScreenerAnswersUser({
  questions,
  candidateName,
  jobTitle,
  company,
  workAuthorization,
  skillYears,
  voiceSample,
  resumeHighlights,
}: {
  questions: Array<{ q: string; charLimit?: number }>;
  candidateName: string;
  jobTitle: string;
  company: string;
  workAuthorization: string | null;
  skillYears: Record<string, number | null>;
  voiceSample: string | null;
  resumeHighlights: string[];
}): string {
  const skillsBlock = Object.entries(skillYears)
    .map(([k, v]) => `${k}: ${v == null ? "unspecified" : `${v} years`}`)
    .join(", ");

  const questionsBlock = questions
    .map((q, i) => `${i + 1}. ${q.q}${q.charLimit ? ` (max ${q.charLimit} chars)` : ""}`)
    .join("\n");

  return `Candidate name: ${candidateName}
Applying to: ${jobTitle} at ${company}
Work authorization: ${workAuthorization ?? "not specified"}
Skill years: ${skillsBlock || "not specified"}
${voiceSample ? `\nVoice sample (use this tone):\n${voiceSample.slice(0, 1500)}\n` : ""}
Resume highlights:
${resumeHighlights.map((h) => `- ${h}`).join("\n")}

Questions:
${questionsBlock}

Answer each question. Output JSON matching the schema.`;
}
