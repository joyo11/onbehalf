import Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, job, profile, resumeSection } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * Phase 8 — unified auto-fill.
 *
 * The extension walks the page's DOM, builds a structured inventory
 * of every form field (label + type + options + required), and
 * sends the whole list here in one request. We ask Claude Haiku to
 * answer every field from the candidate's profile + JD context in
 * a single call.
 *
 * Why one call: text labels + JSON profile + JD = ~1200-1500 input
 * tokens. Haiku at $1/Mtok input + $5/Mtok output = ~$0.003 per
 * application. An entire 22-field form is one round trip.
 *
 * Why opaque IDs: the extension assigns field_0..field_N when it
 * walks the DOM. Claude returns answers by the same IDs. The
 * extension looks each ID back up to the original element. Claude
 * never has to know about selectors or DOM shape — only labels.
 */

type FieldSpec = {
  id: string;
  label: string;
  type:
    | "text"
    | "email"
    | "tel"
    | "url"
    | "textarea"
    | "select"
    | "radio"
    | "checkbox"
    | "react-select"
    | "file"
    | "file_resume"
    | "file_cover_letter";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
};

type Answer = {
  id: string;
  action: "fill" | "select" | "check" | "skip";
  value: string | null;
  confidence: "high" | "low" | "abstain";
  reason: string;
};

const SYSTEM_PROMPT = `You are filling in a job application on behalf of a real candidate. The candidate has given you their profile, the job description, and a structured list of every fillable field on the application form.

For EACH field in the list, return ONE answer object: { id, action, value, confidence, reason }.

ACTIONS:
- "fill": for text/email/tel/url/textarea fields. value = the literal string to type.
- "select": for select/react-select/radio fields. value = the EXACT option string from the field's options list (case-sensitive).
- "check": for checkbox fields. value = "yes" to check, "no" to leave unchecked.
- "skip": leave the field alone. Use when the profile has no data, OR the field asks for interview-style judgment that should not be guessed.

CONFIDENCE:
- "high": the answer is directly supported by the profile (e.g., First Name → profile.firstName).
- "low": you inferred the answer from context (e.g., "Other Website" → profile.githubUrl is a reasonable best guess).
- "abstain": used only with action "skip". The field has no profile-derivable answer.

RULES:
1. Use profile values literally for identity (first/last/preferred name, email, phone, location, LinkedIn, GitHub, portfolio). Never paraphrase.
2. For EEO selects (Gender, Race, Hispanic, Veteran, Disability) use the profile's eeo* fields and pick the option whose text best matches. If the profile says "decline" or has no value, pick the literal decline option ("Decline to self-identify" / "I don't wish to answer") if it exists, otherwise skip.
3. For work authorization / sponsorship / visa: use profile.workAuthorization, profile.needsSponsorship, profile.currentlyAuthorizedUS. These three can disagree — trust them as written.
4. For "Why do you want to join X?" textareas: write 3-4 substantive sentences using profile + JD context. NO filler openers ("I am excited to apply") — get to substance.
5. For COVER LETTER textareas (often labeled "Additional Information"): use the profile.coverLetter verbatim. Do not rewrite.
6. NEVER mention any company other than the target company (from JOB CONTEXT) in any free-text answer. If the candidate's cached cover letter mentions a different company, rewrite the relevant sentence around the target company only.
7. For file upload fields (type=file, file_resume, or file_cover_letter): always skip with reason "extension handles file uploads separately". The extension uploads the resume PDF and fills the cover letter via the form's 'Enter manually' link AFTER your answers apply — do not try to fill these via text.
8. For "How did you hear about us?" type fields: if the profile has no source, pick "LinkedIn" if it's an option, otherwise skip.
8a. For "Who is your current employer?" / "Current company" / similar: use profile.currentEmployer (we derive it from the resume's most recent 'Present' experience; if the candidate has no current job, the field will be "N/A" — use that literal string, do not skip).
8b. For "Years of experience after graduation" or "Post-graduation experience" questions, use profile.yearsExperienceAfterGraduation (distinct from total experience). For generic "Years of experience" questions, use totalYearsExperience.
8c. For "Are you willing to relocate?" questions, use profile.willingToRelocate ("no" / "within_country" / "anywhere") — map to the form's option text: "no" → "No", "within_country" → "Yes, within my country" (or whichever in-country phrasing exists), "anywhere" → "Yes" / "Yes, anywhere".
9. INTERVIEW-STYLE QUESTIONS — answer them. Questions like "How are you using AI today in your current role?", "Describe a project you're proud of", "What excites you about X?", "Tell us about a recent technical challenge" are NOT reasons to abstain. The candidate's profile includes a RESUME SECTIONS block with their experience, projects, skills, summary, and education — use it. Write 3-5 substantive sentences naming SPECIFIC technologies, projects, and outcomes from the resume sections. NO filler ("I am passionate about..."), NO unverifiable claims, NO hallucinating projects that aren't on the resume. If asked about AI specifically and the resume mentions specific AI work (LLMs, RAG, fine-tuning, AI products like PurpleHire, generative models), lean into those by name.
10. Only abstain when the answer requires the candidate to take a stance the profile genuinely doesn't reveal (e.g., "What's your salary expectation?" with no salary data; specific dates the profile doesn't mention; legally sensitive opinion).
11. Output ONE JSON object: { answers: [...] }. No prose around it.`;

function safeSlim(s: string | null | undefined, max = 1500): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function splitName(full: string): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json().catch(() => null)) as {
      applicationId?: string;
      fields?: FieldSpec[];
    } | null;
    if (!body?.applicationId) {
      return NextResponse.json({ error: "applicationId required." }, { status: 400 });
    }
    if (!Array.isArray(body.fields) || body.fields.length === 0) {
      return NextResponse.json({ error: "fields[] required." }, { status: 400 });
    }
    if (body.fields.length > 80) {
      return NextResponse.json(
        { error: "Too many fields in one call (cap is 80)." },
        { status: 400 },
      );
    }

    const [row] = await db
      .select({
        appUserId: application.userId,
        appCoverLetter: application.coverLetterText,
        jobCompany: job.company,
        jobTitle: job.title,
        jobJdText: job.jdText,
        profileRow: profile,
      })
      .from(application)
      .innerJoin(job, eq(application.jobId, job.id))
      .innerJoin(profile, eq(profile.userId, application.userId))
      .where(eq(application.id, body.applicationId))
      .limit(1);
    if (!row) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    if (row.appUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // Load resume sections so Claude has structured context for
    // interview-style questions (projects, experience, skills, summary,
    // education). Each row has bullets[] (the actual content) plus
    // optional title / organization / dates.
    const sections = await db
      .select({
        type: resumeSection.type,
        title: resumeSection.title,
        organization: resumeSection.organization,
        startDate: resumeSection.startDate,
        endDate: resumeSection.endDate,
        bullets: resumeSection.bullets,
        tags: resumeSection.tags,
      })
      .from(resumeSection)
      .where(eq(resumeSection.userId, user.id))
      .orderBy(asc(resumeSection.type));

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured." },
        { status: 500 },
      );
    }

    const p = row.profileRow;
    const { first, last } = splitName(p.fullName ?? "");
    // Prefer the user's explicit fields when set; fall back to the
    // split from fullName for legacy profiles.
    const firstNameValue = p.firstName?.trim() || first;
    const lastNameValue = p.lastName?.trim() || last;
    const preferredNameValue = p.preferredName?.trim() || firstNameValue;

    // Derive the candidate's current employer from the resume's
    // experience rows. Rule: pick the experience whose endDate looks
    // like "Present" / "Current" / "Now" / empty; fall back to the
    // most recent dated job. If no experience at all, "N/A".
    function isPresentDate(d: string | null | undefined): boolean {
      if (!d) return true;
      return /^(present|current|now|ongoing|—|–|-)$/i.test(d.trim());
    }
    const experiences = sections.filter((s) => s.type === "experience");
    const currentExperience =
      experiences.find((e) => isPresentDate(e.endDate)) ?? experiences[0];
    const currentEmployer = currentExperience?.organization?.trim() || "N/A";
    const currentTitle = currentExperience?.title?.trim() || null;

    const slimProfile = {
      firstName: firstNameValue,
      lastName: lastNameValue,
      preferredName: preferredNameValue,
      email: user.email,
      phone: p.phone,
      location: p.location,
      linkedinUrl: p.linkedinUrl,
      githubUrl: p.githubUrl,
      portfolioUrl: p.portfolioUrl,
      workAuthorization: p.workAuthorization,
      needsSponsorship: p.needsSponsorship,
      currentlyAuthorizedUS: p.currentlyAuthorizedUS,
      countryOfResidence: p.countryOfResidence,
      previouslyWorkedHere: p.previouslyWorkedHere,
      eeoGender: p.eeoGender,
      eeoHispanicLatino: p.eeoHispanicLatino,
      eeoRaceEthnicity: p.eeoRaceEthnicity,
      eeoVeteranStatus: p.eeoVeteranStatus,
      eeoDisabilityStatus: p.eeoDisabilityStatus,
      eeoSexualOrientation: p.eeoSexualOrientation,
      currentCompany: p.currentCompany || currentEmployer,
      currentJobTitle: p.currentJobTitle || currentTitle,
      currentEmployer, // explicit field for "Who is your current employer?" prompts
      totalYearsExperience: p.totalYearsExperience,
      yearsExperienceAfterGraduation: p.yearsExperienceAfterGraduation,
      willingToRelocate: p.willingToRelocate,
      coverLetter: row.appCoverLetter ?? null,
    };

    // Group resume sections by type. Claude uses these as ground truth
    // for interview-style answers.
    type SectionForLlm = {
      title: string | null;
      organization: string | null;
      dates: string | null;
      bullets: string[];
      tags: string[];
    };
    const sectionsByType: Record<string, SectionForLlm[]> = {};
    for (const s of sections) {
      const arr = (sectionsByType[s.type] ??= []);
      const dates =
        s.startDate || s.endDate ? `${s.startDate ?? ""} → ${s.endDate ?? "present"}` : null;
      arr.push({
        title: s.title ?? null,
        organization: s.organization ?? null,
        dates,
        bullets: (s.bullets ?? []).map((b) => safeSlim(b, 240)).filter(Boolean),
        tags: s.tags ?? [],
      });
    }

    const userText = [
      "JOB CONTEXT",
      `Company: ${row.jobCompany}`,
      `Title: ${row.jobTitle}`,
      `JD summary: ${safeSlim(row.jobJdText, 1500)}`,
      "",
      "CANDIDATE PROFILE (JSON)",
      JSON.stringify(slimProfile, null, 2),
      "",
      "RESUME SECTIONS (use these for interview-style answers — name specific projects, technologies, outcomes)",
      JSON.stringify(sectionsByType, null, 2),
      "",
      "FORM FIELDS (JSON list — answer every one by id)",
      JSON.stringify(body.fields, null, 2),
      "",
      'Return: { "answers": [...] } — one answer object per field, same ids. JSON only, no prose.',
    ].join("\n");

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userText }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text in Claude response.", usage: response.usage },
        { status: 502 },
      );
    }
    const raw = textBlock.text.trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    let parsed: { answers: Answer[] };
    try {
      parsed = JSON.parse(cleaned) as { answers: Answer[] };
    } catch {
      return NextResponse.json(
        { error: "Reply was not valid JSON.", raw: cleaned.slice(0, 500), usage: response.usage },
        { status: 502 },
      );
    }
    if (!Array.isArray(parsed.answers)) {
      return NextResponse.json(
        { error: "Reply missing answers[].", usage: response.usage },
        { status: 502 },
      );
    }

    // Bundle the cover letter text + resume PDF into the response so
    // the extension's content-script executor doesn't need to make
    // separate cross-origin fetches (CORS blocks those because the
    // content script runs in the host page's origin, e.g.
    // greenhouse.io, and credentialed fetches require an exact
    // Access-Control-Allow-Origin header).
    let resumePdfBase64: string | null = null;
    let resumeFileName: string | null = null;
    if (p.resumePdf) {
      const buf = Buffer.from(p.resumePdf);
      resumePdfBase64 = buf.toString("base64");
      resumeFileName = p.resumeFileName ?? "resume.pdf";
    }

    return NextResponse.json({
      answers: parsed.answers,
      coverLetterText: row.appCoverLetter ?? null,
      resumePdfBase64,
      resumeFileName,
      usage: response.usage,
      tokenCost:
        ((response.usage.input_tokens ?? 0) / 1_000_000) * 1 +
        ((response.usage.output_tokens ?? 0) / 1_000_000) * 5,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[extension/auto-fill] FATAL", message);
    return NextResponse.json({ error: "auto-fill threw", message }, { status: 500 });
  }
}
