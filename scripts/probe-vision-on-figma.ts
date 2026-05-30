/**
 * Phase 7B validation script — runs WITHOUT Shafay's browser.
 *
 * 1. Open a Browserbase session, navigate to Figma's apply page
 * 2. Wait for the form to render
 * 3. Capture a viewport-sized screenshot
 * 4. Send it directly to Anthropic Sonnet vision with our server's
 *    exact system prompt + Shafay's profile data
 * 5. Print the plan that comes back so we can audit it
 *    (coordinate accuracy, EEO coverage, abstain calibration)
 *
 * If Browserbase is exhausted (402), we fall back gracefully so the
 * team can plan around it.
 */
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, job, profile, user } from "../lib/db/schema";
import { startSession } from "../lib/submit/browserbase";

const FIGMA_URL =
  "https://job-boards.greenhouse.io/figma/jobs/5691911004";

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
  // Pull Shafay's profile so the prompt gets the same context the
  // server endpoint would build.
  const [u] = await db
    .select()
    .from(user)
    .where(eq(user.email, "shafay11august@gmail.com"))
    .limit(1);
  if (!u) {
    console.error("no user");
    process.exit(1);
  }
  const [p] = await db.select().from(profile).where(eq(profile.userId, u.id)).limit(1);
  if (!p) {
    console.error("no profile");
    process.exit(1);
  }
  // Find the Figma application so we can include the cover letter text
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

  const fullName = p.fullName ?? "";
  const parts = fullName.split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ");
  const slim = {
    firstName: first,
    lastName: last,
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

  // Open a Browserbase session, navigate, screenshot.
  console.log("[probe] starting Browserbase session…");
  let session: Awaited<ReturnType<typeof startSession>>;
  try {
    session = await startSession();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[probe] Browserbase failed:", msg);
    if (msg.includes("402") || /minutes limit/i.test(msg)) {
      console.error("[probe] Browserbase still capped. Can't auto-test without a screenshot.");
      console.error("[probe] Options: (1) wait for reset, (2) Shafay manually screenshots Figma + sends, (3) top up Browserbase.");
    }
    process.exit(1);
  }
  try {
    await session.page.goto(FIGMA_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await session.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    // Wait for the form to mount — Greenhouse's portal mount point
    await session.page
      .waitForSelector("input[name='first_name'], input[type='email'], textarea", { timeout: 15_000 })
      .catch(() => {});
    await session.page.waitForTimeout(1500);
    // Scroll up to the top of the form area for a stable shot
    await session.page.evaluate(() => {
      const form = document.querySelector("input[name='first_name']")?.closest("form");
      if (form) form.scrollIntoView({ behavior: "instant", block: "start" });
      else window.scrollTo({ top: 0, behavior: "instant" });
    });
    await session.page.waitForTimeout(500);
    const viewport = await session.page.viewportSize();
    console.log("[probe] viewport:", viewport);
    const shotBuf = await session.page.screenshot({ fullPage: false, type: "jpeg", quality: 70 });
    writeFileSync("/tmp/figma-probe.jpg", shotBuf);
    console.log(`[probe] saved /tmp/figma-probe.jpg (${shotBuf.length} bytes)`);

    const screenshotBase64 = shotBuf.toString("base64");

    // Now call Claude
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("[probe] ANTHROPIC_API_KEY missing");
      process.exit(1);
    }
    const client = new Anthropic();
    const userText = [
      "JOB CONTEXT",
      `Company: ${appRow?.company ?? "Figma"}`,
      `Title: ${appRow?.title ?? "Software Engineer, Full Stack"}`,
      `JD summary: ${(appRow?.jdText ?? "").slice(0, 1500)}`,
      "",
      "CANDIDATE PROFILE (JSON)",
      JSON.stringify(slim, null, 2),
      "",
      `Screenshot dimensions: ${viewport?.width ?? "?"}px wide × ${viewport?.height ?? "?"}px tall.`,
      "",
      "Output the JSON plan.",
    ].join("\n");

    console.log("[probe] calling Claude Sonnet vision…");
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
              source: { type: "base64", media_type: "image/jpeg", data: screenshotBase64 },
            },
          ],
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[probe] no text block");
      process.exit(1);
    }
    const raw = textBlock.text.trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    writeFileSync("/tmp/figma-plan.json", cleaned);
    console.log("\n=========== PLAN ===========");
    console.log(cleaned);
    console.log("============================\n");
    console.log("[probe] saved /tmp/figma-plan.json");
    const u_in = response.usage.input_tokens ?? 0;
    const u_out = response.usage.output_tokens ?? 0;
    console.log(`[probe] tokens: in=${u_in} out=${u_out}  cost ≈ $${(u_in / 1_000_000 * 3 + u_out / 1_000_000 * 15).toFixed(4)}`);
  } finally {
    await session.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
