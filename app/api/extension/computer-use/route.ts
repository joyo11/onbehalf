import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, job, profile } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Phase 7 — vision-based fill planner.
 *
 * Extension captures a screenshot of the current Greenhouse / Lever /
 * Ashby apply page and POSTs it here with the application ID. We hand
 * the image plus a slim profile to Claude Sonnet with vision, ask it
 * to look at the form and return a fill plan as JSON.
 *
 * The Guy's discipline (2026-05-30 plan): cap at one vision call per
 * fill, not iterative tool-use. Cheaper, faster, and Claude is good
 * enough at understanding a screenshot in one pass to plan the
 * actions ahead of time.
 *
 * Dry-run mode: append ?dryRun=1 (or pass body.dryRun=true) to return
 * a hardcoded plan with no API call. Lets us validate the executor
 * end-to-end before spending a single token.
 */

type ActionType = "type" | "select" | "click" | "abstain";

type PlanAction = {
  // What the agent SEES on the form — used by the extension to find
  // the right element via label-text match. Examples:
  //   "First Name", "Email", "Why do you want to join Figma?",
  //   "Gender (under Voluntary Self-Identification)"
  targetLabel: string;
  // What to do with the matched element.
  action: ActionType;
  // For type/select: the value to type or option text to pick.
  // For click: ignored. For abstain: null + reason explains why.
  value: string | null;
  // Short rationale — surfaced in the popup so the user can audit.
  reason?: string;
};

const SYSTEM_PROMPT = `You are filling in a job application on behalf of a real candidate. You will be shown a screenshot of the application form and given the candidate's profile + the job context.

Your job: produce a JSON fill plan. For every visible fillable field on the screenshot, output one entry with:
  - targetLabel: the exact label text on the form (so a downstream executor can find the element). Be precise — include any parent section like "Gender (under Voluntary Self-Identification)" so EEO fields don't get confused with general dropdowns.
  - action: one of "type" | "select" | "click" | "abstain"
  - value: for type, the string to type. for select, the EXACT option text from the dropdown. for click, null. for abstain, null.
  - reason: 5-15 word note explaining the choice. For abstain, explain why.

Rules:
  - Use the candidate's profile fields literally for identity (first/last name, email, phone). Don't paraphrase those.
  - For free-text textareas ("Why do you want to join X?"), write 3-4 substantive sentences using the profile + job context. No filler openers, no "I am excited to apply."
  - For dropdowns, abstain if you can't see all the options from the screenshot. Better to abstain than pick wrong.
  - For EEO fields (Gender, Race, Veteran, Disability), use the eeo* fields in the profile. If a profile field says "decline", choose the "Decline to self-identify" / "I don't wish to answer" option exactly as it appears.
  - Skip optional fields if the profile doesn't have a value for them. Don't invent.
  - Output ONLY the JSON array. No prose before or after.

Format:
[
  { "targetLabel": "First Name", "action": "type", "value": "Mohammad", "reason": "from profile.firstName" },
  { "targetLabel": "Gender", "action": "select", "value": "Male", "reason": "profile.eeoGender=man" },
  { "targetLabel": "Pronouns", "action": "abstain", "value": null, "reason": "optional, not in profile" }
]`;

function dryRunPlan(): PlanAction[] {
  // Fake plan returned when ?dryRun=1. Lets us validate the executor
  // without spending a token. Mirrors the shape of a real plan.
  return [
    { targetLabel: "First Name", action: "type", value: "[dry-run] Mohammad", reason: "dry-run scaffold" },
    { targetLabel: "Last Name", action: "type", value: "[dry-run] Shafay Joyo", reason: "dry-run scaffold" },
    { targetLabel: "Email", action: "type", value: "[dry-run] shafay11august@gmail.com", reason: "dry-run scaffold" },
    { targetLabel: "Why do you want to join", action: "type", value: "[dry-run] This would be the Claude-written textarea answer.", reason: "dry-run scaffold" },
    { targetLabel: "Gender", action: "select", value: "Male", reason: "dry-run scaffold" },
    { targetLabel: "Pronouns", action: "abstain", value: null, reason: "dry-run scaffold (testing abstain path)" },
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
      dryRun?: boolean;
    } | null;
    if (!body?.applicationId) {
      return NextResponse.json({ error: "applicationId required." }, { status: 400 });
    }
    const isDryRun = dryRunQuery || body.dryRun === true;

    // Verify ownership even on dry-run (no point letting an attacker
    // poke at this without auth + ownership).
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
      return NextResponse.json({
        plan: dryRunPlan(),
        dryRun: true,
        tokenCost: 0,
      });
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

    const userText = [
      "JOB CONTEXT",
      `Company: ${row.jobCompany}`,
      `Title: ${row.jobTitle}`,
      `JD summary: ${(row.jobJdText ?? "").slice(0, 1500)}`,
      "",
      "CANDIDATE PROFILE (JSON)",
      JSON.stringify(slimProfile, null, 2),
      "",
      "Look at the screenshot below and produce the fill plan. Output JSON only.",
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
      return NextResponse.json({ error: "Plan must be an array.", usage: response.usage }, { status: 502 });
    }

    return NextResponse.json({
      plan,
      dryRun: false,
      usage: response.usage,
      // Rough cost estimate so the popup can surface it.
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
