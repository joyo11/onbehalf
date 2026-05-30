/**
 * Phase 7B validation against a real Figma screenshot Shafay saved
 * to disk. Bypasses Browserbase + the extension entirely.
 *
 * Usage:
 *   tsx scripts/test-vision-direct.ts /path/to/screenshot.png
 *
 * Calls Anthropic Sonnet vision with our server's exact system prompt
 * + Shafay's profile + the screenshot. Prints the plan that comes
 * back so we can audit coordinates, field coverage, EEO answers.
 *
 * Cost per run: ~$0.04-0.08. Iterates the prompt without Shafay
 * needing to click anything.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, job, profile, user } from "../lib/db/schema";

const SYSTEM_PROMPT = `You are filling in a job application on behalf of a real candidate. You will be shown a screenshot of the application form and given the candidate's profile + job context.

Output a JSON array — one entry per fillable field VISIBLE on the screenshot. Each entry:
  - fieldName: short human label for the field ("First Name", "Gender", "Why Figma?")
  - action: "type" | "select" | "click" | "check" | "abstain"
  - coord: { "x": number, "y": number } — the pixel coordinate IN THE SCREENSHOT to click on. Click the text input directly for type, or the closed dropdown control for select.
  - value: for type, the string. For select, the EXACT option text as it will appear in the dropdown menu. For click/check, null. For abstain, null.
  - reason: short note explaining the choice

CRITICAL RULES:
1. Use profile values literally for identity (first/last name, email, phone). Do NOT paraphrase.
2. For dropdowns (action: "select"): coord points at the CLOSED dropdown (the bar showing "Select..."), value is the option text the executor should pick after clicking opens the menu.
3. For EEO selects (Gender, Race, Hispanic, Veteran, Disability), use the profile's eeo* fields. If profile says "decline", pick the literal "Decline to self-identify" / "I don't wish to answer" option exactly as worded in the form.
4. For required free-text textareas ("Why do you want to join X?"), write 3-4 substantive sentences using profile + job context. NO filler openers ("I am excited to apply") — get to substance.
5. For COVER LETTER textareas (often labelled "Additional Information") — paste the candidate's coverLetter profile field verbatim. Don't rewrite.
6. ABSTAIN (action: "abstain") rather than guess when:
   - The option list for a dropdown isn't visible AND you can't confidently predict which option fits
   - The field asks something not covered by the profile
   - The right answer would require interview-style judgment ("describe a project")
7. Skip optional fields the candidate has no value for. Don't invent.
8. Pixel coordinates: be PRECISE. Click on the visible input or dropdown control, not a label or a heading.

Output ONLY the JSON array, no prose.`;

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: test-vision-direct.ts <path/to/screenshot.png>");
    process.exit(1);
  }

  const buf = readFileSync(path);
  const mime = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const base64 = buf.toString("base64");
  console.log(`[vision-test] loaded ${path} (${buf.length} bytes, ${mime})`);

  const [u] = await db
    .select()
    .from(user)
    .where(eq(user.email, "shafay11august@gmail.com"))
    .limit(1);
  if (!u) {
    console.error("[vision-test] no user");
    process.exit(1);
  }
  const [p] = await db.select().from(profile).where(eq(profile.userId, u.id)).limit(1);
  if (!p) {
    console.error("[vision-test] no profile");
    process.exit(1);
  }
  const [appRow] = await db
    .select({
      cover: application.coverLetterText,
      company: job.company,
      title: job.title,
      jdText: job.jdText,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .where(eq(application.userId, u.id))
    .limit(1);

  const parts = (p.fullName ?? "").split(/\s+/);
  const slim = {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
    preferredName: p.preferredName,
    email: u.email,
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
    currentCompany: p.currentCompany,
    currentJobTitle: p.currentJobTitle,
    coverLetter: appRow?.cover ?? null,
  };

  const userText = [
    "JOB CONTEXT",
    `Company: ${appRow?.company ?? "Figma"}`,
    `Title: ${appRow?.title ?? "Software Engineer, Full Stack"}`,
    `JD summary: ${(appRow?.jdText ?? "").slice(0, 1500)}`,
    "",
    "CANDIDATE PROFILE (JSON)",
    JSON.stringify(slim, null, 2),
    "",
    "The screenshot below shows a PORTION of the Figma application form (the page is long; one screenshot can't fit everything). Plan for every field visible. Pixel coordinates are in the screenshot's own coordinate system.",
    "",
    "Output the JSON plan.",
  ].join("\n");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[vision-test] ANTHROPIC_API_KEY missing");
    process.exit(1);
  }
  console.log("[vision-test] calling Claude Sonnet vision…");
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          {
            type: "image",
            source: { type: "base64", media_type: mime, data: base64 },
          },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error("[vision-test] no text block");
    process.exit(1);
  }
  const raw = textBlock.text.trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  const outPath = `/tmp/plan-${basename(path)}.json`;
  writeFileSync(outPath, cleaned);
  console.log(`\n=========== PLAN for ${basename(path)} ===========`);
  console.log(cleaned);
  console.log("======================================\n");

  const ui = response.usage.input_tokens ?? 0;
  const uo = response.usage.output_tokens ?? 0;
  const cost = ui / 1_000_000 * 3 + uo / 1_000_000 * 15;
  console.log(`tokens: in=${ui} out=${uo}   cost ≈ $${cost.toFixed(4)}`);
  console.log(`plan written → ${outPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
