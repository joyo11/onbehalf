import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { PARSE_RESUME_SCHEMA, PARSE_RESUME_SYSTEM } from "@/lib/prompts/parse-resume";
import type { ParsedResume } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded under field 'file'." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: `Only PDF files are supported. Got: ${file.type || "unknown"}.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `File is too large. Limit is ${MAX_PDF_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      system: PARSE_RESUME_SYSTEM,
      output_config: {
        format: {
          type: "json_schema",
          schema: PARSE_RESUME_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: "Parse this resume. Follow the system rules. Return only the JSON object matching the schema.",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Model returned no text content.", stop_reason: response.stop_reason },
        { status: 502 },
      );
    }

    let parsed: ParsedResume;
    try {
      parsed = JSON.parse(textBlock.text) as ParsedResume;
    } catch {
      return NextResponse.json(
        { error: "Model output was not valid JSON.", raw: textBlock.text.slice(0, 500) },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        parsed,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic API error: ${err.message}`, status: err.status },
        { status: err.status ?? 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
