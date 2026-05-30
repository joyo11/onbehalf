import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, job, profile } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * Phase 7B — vision + coordinate-based fill planner.
 *
 * Why coordinates instead of label text: tonight we proved the
 * label-walk executor can't reliably reach React-Selects on Figma's
 * EEO section. Labels are bound by ID for text inputs but only by
 * proximity for dropdowns. Proximity-walking the DOM is fragile.
 *
 * What Claude does:
 *   - looks at a screenshot of the form
 *   - given the slim profile + job context, returns a JSON plan with
 *     pixel coordinates of WHERE to click + WHAT to do
 *
 * Action shape (mirrors what the executor expects):
 *   {
 *     fieldName: string,            // human label for the popup
 *     action: "type" | "select" | "click" | "check" | "abstain",
 *     coord: { x: number, y: number },  // viewport pixel coords
 *     value: string | null,         // text to type, option text to pick
 *     optionCoord?: { x, y },       // for select: where the option will
 *                                    //   appear after the dropdown opens
 *                                    //   (optional; executor falls back
 *                                    //   to finding option by text)
 *     reason?: string
 *   }
 *
 * Dry-run mode (?dryRun=1): returns a fake plan with coordinates that
 * point at the first ~8 fields on a typical Greenhouse form so we can
 * validate the executor without spending a token.
 */

type Coord = { x: number; y: number };

type PlanAction = {
  fieldName: string;
  action: "type" | "select" | "click" | "check" | "abstain";
  coord: Coord;
  value: string | null;
  optionCoord?: Coord;
  reason?: string;
};

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
9. NEVER mention or reference any company other than the target company (from JOB CONTEXT) in your textarea answers. If the candidate's cached cover letter or profile mentions a different employer or target company, ignore those references and write the answer about the current target company only.

Output ONLY the JSON array, no prose.

Example output shape:
[
  { "fieldName": "First Name", "action": "type", "coord": {"x": 420, "y": 480}, "value": "Mohammad", "reason": "profile.firstName" },
  { "fieldName": "Gender", "action": "select", "coord": {"x": 420, "y": 1240}, "value": "Male", "reason": "profile.eeoGender=man" },
  { "fieldName": "Pronouns", "action": "abstain", "coord": {"x": 0, "y": 0}, "value": null, "reason": "optional, profile has no pronoun preference" }
]`;

function dryRunPlan(): PlanAction[] {
  // Coordinates are best-guesses for a typical Greenhouse layout at
  // ~1280px wide. Won't be pixel-accurate but should at least land on
  // the right column. Lets us prove the executor's elementFromPoint
  // path works.
  return [
    {
      fieldName: "First Name",
      action: "type",
      coord: { x: 420, y: 460 },
      value: "[dry-run] Mohammad",
      reason: "dry-run scaffold",
    },
    {
      fieldName: "Last Name",
      action: "type",
      coord: { x: 420, y: 540 },
      value: "[dry-run] Shafay Joyo",
      reason: "dry-run scaffold",
    },
    {
      fieldName: "Email",
      action: "type",
      coord: { x: 420, y: 620 },
      value: "[dry-run] shafay11august@gmail.com",
      reason: "dry-run scaffold",
    },
    {
      fieldName: "Gender",
      action: "select",
      coord: { x: 420, y: 1240 },
      value: "Male",
      reason: "dry-run scaffold",
    },
    {
      fieldName: "Pronouns",
      action: "abstain",
      coord: { x: 0, y: 0 },
      value: null,
      reason: "dry-run scaffold (testing abstain path)",
    },
  ];
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const url = new URL(req.url);
    const dryRunQuery = url.searchParams.get("dryRun") === "1";

    const body = (await req.json().catch(() => null)) as {
      applicationId?: string;
      screenshotBase64?: string;
      viewportWidth?: number;
      viewportHeight?: number;
      dryRun?: boolean;
    } | null;
    if (!body?.applicationId) {
      return NextResponse.json({ error: "applicationId required." }, { status: 400 });
    }
    const isDryRun = dryRunQuery || body.dryRun === true;

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

    if (isDryRun) {
      return NextResponse.json({ plan: dryRunPlan(), dryRun: true, tokenCost: 0 });
    }

    if (!body.screenshotBase64) {
      return NextResponse.json(
        { error: "screenshotBase64 required for real runs." },
        { status: 400 },
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured." },
        { status: 500 },
      );
    }

    const p = row.profileRow;
    const slimProfile = {
      firstName: splitName(p.fullName ?? "").first,
      lastName: splitName(p.fullName ?? "").last,
      preferredName: p.preferredName,
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
      currentCompany: p.currentCompany,
      currentJobTitle: p.currentJobTitle,
      coverLetter: row.appCoverLetter ?? null,
    };

    const dims =
      body.viewportWidth && body.viewportHeight
        ? `Screenshot dimensions: ${body.viewportWidth}px wide × ${body.viewportHeight}px tall. Coordinates you return must be in this viewport's pixel space.`
        : "Screenshot is in standard viewport coordinates — return coords in the same pixel space.";

    const userText = [
      "JOB CONTEXT",
      `Company: ${row.jobCompany}`,
      `Title: ${row.jobTitle}`,
      `JD summary: ${(row.jobJdText ?? "").slice(0, 1500)}`,
      "",
      "CANDIDATE PROFILE (JSON)",
      JSON.stringify(slimProfile, null, 2),
      "",
      dims,
      "",
      "Look at the screenshot below and produce the JSON fill plan with coordinate clicks. Output JSON array only.",
    ].join("\n");

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: body.screenshotBase64,
              },
            },
          ],
        },
      ],
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
    let plan: PlanAction[];
    try {
      plan = JSON.parse(cleaned) as PlanAction[];
    } catch {
      return NextResponse.json(
        { error: "Plan was not valid JSON.", raw: cleaned.slice(0, 500), usage: response.usage },
        { status: 502 },
      );
    }
    if (!Array.isArray(plan)) {
      return NextResponse.json(
        { error: "Plan must be an array.", usage: response.usage },
        { status: 502 },
      );
    }

    return NextResponse.json({
      plan,
      dryRun: false,
      usage: response.usage,
      tokenCost:
        ((response.usage.input_tokens ?? 0) / 1_000_000) * 3 +
        ((response.usage.output_tokens ?? 0) / 1_000_000) * 15,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[extension/computer-use] FATAL", message);
    return NextResponse.json({ error: "computer-use threw", message }, { status: 500 });
  }
}

function splitName(full: string): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}
