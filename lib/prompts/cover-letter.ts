export const COVER_LETTER_SYSTEM = `You write personalized cover letters that read like the candidate actually wrote them.

RULES:
- Under 250 words. Aim for 180-230.
- Use the candidate's voice (a sample of their writing is provided).
- Structure: hook → why THIS company specifically → 2 concrete accomplishments from the resume → close.
- NO clichés: never use "excited", "passionate", "thrilled", "perfect fit", "leverage", "synergy", "supercharge", "unleash", "drive impact", "results-driven".
- NEVER invent accomplishments. Pull only from the candidate's existing resume.
- NEVER mention the candidate's race, religion, or anything outside their professional background.
- Address it to the hiring team or a specific role mentioned in the JD if known. Don't fake a recruiter's name.
- Output ONLY the letter body, no salutation/sign-off boilerplate. Start with the opening sentence.
- Output it as plain text, no markdown, no bullet points.`;

export type CoverLetterResult = {
  cover_letter: string;
  word_count: number;
};

export const COVER_LETTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cover_letter: { type: "string" },
    word_count: { type: "integer" },
  },
  required: ["cover_letter", "word_count"],
} as const;

export function buildCoverLetterUser({
  candidateName,
  jobTitle,
  company,
  jdText,
  voiceSample,
  resumeHighlights,
}: {
  candidateName: string;
  jobTitle: string;
  company: string;
  jdText: string;
  voiceSample: string | null;
  resumeHighlights: string[];
}): string {
  const voiceBlock = voiceSample
    ? `\n\nCandidate's writing voice (use this tone):\n${voiceSample.slice(0, 2000)}`
    : "\n\nNo voice sample provided — write in a thoughtful, plainspoken professional tone. Avoid corporate cliché.";

  return `Candidate name: ${candidateName}
Applying to: ${jobTitle} at ${company}

Job description:
${jdText.slice(0, 6000)}

Resume highlights (pull accomplishments from here, do not invent):
${resumeHighlights.map((h) => `- ${h}`).join("\n")}
${voiceBlock}

Write the cover letter. Output JSON matching the schema.`;
}
