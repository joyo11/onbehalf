import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { getOrCreateProfile } from "./db/profile";
import { job, resumeSection, type User } from "./db/schema";
import {
  buildCoverLetterUser,
  COVER_LETTER_SCHEMA,
  COVER_LETTER_SYSTEM,
  type CoverLetterResult,
} from "./prompts/cover-letter";
import {
  buildScreenerAnswersUser,
  SCREENER_ANSWERS_SCHEMA,
  SCREENER_ANSWERS_SYSTEM,
  type ScreenerAnswersResult,
} from "./prompts/screener-answers";
import {
  buildTailorResumeUser,
  TAILOR_RESUME_SCHEMA,
  TAILOR_RESUME_SYSTEM,
  type TailoringResult,
} from "./prompts/tailor-resume";

const DEFAULT_SCREENERS = [
  { q: "Why are you interested in this role?" },
  { q: "Are you authorized to work in this country without sponsorship?" },
  { q: "What's your experience with the primary technologies in this role?" },
  { q: "When could you start?" },
];

/**
 * Wrap Claude's body output in the formal business-letter format we ship:
 *
 *   Full Name
 *   Location
 *   Phone Email
 *
 *   Month Day, Year
 *
 *   Hiring Manager
 *   {Company}
 *
 *   Dear Hiring Manager,
 *
 *   {body}
 *
 *   Sincerely,
 *   Full Name
 */
function formatCoverLetter(opts: {
  body: string;
  fullName: string;
  location: string | null;
  phone: string | null;
  email: string;
  companyName: string;
}): string {
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const contactLine = [opts.phone, opts.email].filter(Boolean).join(" ").trim();

  const header = [
    opts.fullName,
    opts.location ?? "",
    contactLine,
    "",
    dateStr,
    "",
    "Hiring Manager",
    opts.companyName,
    "",
    "Dear Hiring Manager,",
  ]
    .filter((line) => line !== "" || true) // keep empty lines as spacing
    .join("\n");

  const body = opts.body.trim();
  const footer = `\n\nSincerely,\n${opts.fullName}`;

  return `${header}\n\n${body}${footer}`;
}

export type TailorPayload = {
  job: {
    id: string;
    company: string;
    title: string;
    location: string | null;
    applyUrl: string;
  };
  tailoring: TailoringResult;
  coverLetter: CoverLetterResult;
  screeners: ScreenerAnswersResult;
};

function callClaudeStructured<T>(
  client: Anthropic,
  system: string,
  user: string,
  schema: Record<string, unknown>,
  maxTokens = 8000,
): Promise<T> {
  return client.messages
    .create({
      model: "claude-opus-4-7",
      max_tokens: maxTokens,
      system,
      output_config: {
        format: {
          type: "json_schema",
          schema,
        },
      },
      messages: [{ role: "user", content: user }],
    })
    .then((response) => {
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error(`Claude returned no text content (stop_reason=${response.stop_reason})`);
      }
      try {
        return JSON.parse(textBlock.text) as T;
      } catch {
        throw new Error("Claude output was not valid JSON.");
      }
    });
}

export async function tailorForJob(user: User, jobId: string): Promise<TailorPayload> {
  // Fetch job
  const [jobRow] = await db.select().from(job).where(eq(job.id, jobId)).limit(1);
  if (!jobRow) throw new Error("Job not found");

  // Fetch user's resume + profile
  const [sections, profileRow] = await Promise.all([
    db.select().from(resumeSection).where(eq(resumeSection.userId, user.id)),
    getOrCreateProfile(user),
  ]);

  const experienceSections = sections
    .filter((s) => s.type === "experience" || s.type === "projects")
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));

  if (experienceSections.length === 0) {
    throw new Error(
      "You haven't uploaded a resume yet — go to onboarding Step 1 and upload your PDF.",
    );
  }

  const resumeHighlights: string[] = sections.flatMap((s) => s.bullets).slice(0, 12);
  const candidateName = profileRow.fullName ?? user.email.split("@")[0];
  const skillYears = (profileRow.skillYears as Record<string, number | null>) ?? {};
  const voiceSample = profileRow.voiceSample;
  const workAuthorization = profileRow.workAuthorization;

  const client = new Anthropic();

  // Run the 3 Claude calls in parallel
  const [tailoring, coverLetter, screeners] = await Promise.all([
    callClaudeStructured<TailoringResult>(
      client,
      TAILOR_RESUME_SYSTEM,
      buildTailorResumeUser({
        jobTitle: jobRow.title,
        company: jobRow.company,
        jdText: jobRow.jdText,
        resumeSections: experienceSections.map((s) => ({
          id: s.id,
          title: s.title,
          organization: s.organization,
          startDate: s.startDate,
          endDate: s.endDate,
          bullets: s.bullets,
        })),
      }),
      TAILOR_RESUME_SCHEMA as unknown as Record<string, unknown>,
    ),
    callClaudeStructured<CoverLetterResult>(
      client,
      COVER_LETTER_SYSTEM,
      buildCoverLetterUser({
        candidateName,
        jobTitle: jobRow.title,
        company: jobRow.company,
        jdText: jobRow.jdText,
        voiceSample,
        resumeHighlights,
      }),
      COVER_LETTER_SCHEMA as unknown as Record<string, unknown>,
      2000,
    ),
    callClaudeStructured<ScreenerAnswersResult>(
      client,
      SCREENER_ANSWERS_SYSTEM,
      buildScreenerAnswersUser({
        questions: DEFAULT_SCREENERS,
        candidateName,
        jobTitle: jobRow.title,
        company: jobRow.company,
        workAuthorization,
        skillYears,
        voiceSample,
        resumeHighlights,
      }),
      SCREENER_ANSWERS_SCHEMA as unknown as Record<string, unknown>,
      4000,
    ),
  ]);

  // Wrap Claude's body in the formal letter format. We override the model's
  // raw output rather than asking Claude to produce headers/dates itself
  // (cheaper, deterministic, and uses real profile data).
  const formattedBody = coverLetter.cover_letter;
  const formatted = formatCoverLetter({
    body: formattedBody,
    fullName: candidateName,
    location: profileRow.location,
    phone: profileRow.phone,
    email: user.email,
    companyName: jobRow.company,
  });

  return {
    job: {
      id: jobRow.id,
      company: jobRow.company,
      title: jobRow.title,
      location: jobRow.location,
      applyUrl: jobRow.applyUrl,
    },
    tailoring,
    coverLetter: {
      ...coverLetter,
      cover_letter: formatted,
      word_count: formatted.split(/\s+/).filter(Boolean).length,
    },
    screeners,
  };
}
