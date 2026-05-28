import OpenAI from "openai";

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;
// text-embedding-3-small max input is 8192 tokens; ~4 chars per token = ~32k chars.
// Keep a buffer.
const MAX_CHARS_PER_TEXT = 28000;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

function clip(t: string): string {
  return t.length > MAX_CHARS_PER_TEXT ? t.slice(0, MAX_CHARS_PER_TEXT) : t;
}

export async function embedOne(text: string): Promise<number[]> {
  const res = await client().embeddings.create({
    model: MODEL,
    input: clip(text),
    dimensions: DIMENSIONS,
  });
  return res.data[0].embedding;
}

/**
 * Batch up to 100 texts per request to amortize HTTP overhead.
 * Returns the embeddings in the same order as the input.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  const BATCH = 64;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH).map(clip);
    const res = await client().embeddings.create({
      model: MODEL,
      input: slice,
      dimensions: DIMENSIONS,
    });
    // OpenAI returns data in the order of input
    for (const item of res.data) out.push(item.embedding);
  }
  return out;
}

export const EMBEDDING_DIMS = DIMENSIONS;
export const EMBEDDING_MODEL = MODEL;
