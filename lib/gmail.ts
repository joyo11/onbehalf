import { google, type gmail_v1 } from "googleapis";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

function appUrl(req?: Request): string {
  // Explicit override always wins.
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  // Prefer the host the user is actually visiting — that's what Google's
  // redirect URI registry was set against (e.g. onbehalf-ten.vercel.app).
  // process.env.VERCEL_URL gives us a unique per-deploy URL we'd have to
  // re-register on every push, which is wrong.
  if (req) {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function redirectUri(req?: Request): string {
  return `${appUrl(req)}/api/auth/google/callback`;
}

export function oauthClient(req?: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri(req));
}

/**
 * Build a Gmail API client for a user using their stored refresh token.
 * The OAuth2 client will auto-refresh the access token via the refresh token.
 */
export function gmailForUser(refreshToken: string): gmail_v1.Gmail {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: client });
}

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  receivedAt: Date;
  from: string;
  fromDomain: string;
  subject: string;
  snippet: string;
};

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function extractDomain(from: string): string {
  const m = from.match(/<?([^<>@\s]+)@([^<>@\s]+?)>?$/);
  return m?.[2]?.toLowerCase() ?? "";
}

/**
 * List recent messages matching ATS confirmation patterns.
 */
export async function listConfirmationCandidates(
  gmail: gmail_v1.Gmail,
  maxAgeDays = 30,
  maxMessages = 60,
): Promise<GmailMessageSummary[]> {
  // Gmail search query: recent emails likely to be application confirmations.
  // Cast as wide as we can on subject + sender; we tighten with the matcher.
  const ageClause = `newer_than:${maxAgeDays}d`;
  const senderClause = [
    "from:no-reply@greenhouse.io",
    "from:noreply@greenhouse.io",
    "from:no-reply@hire.lever.co",
    "from:noreply@lever.co",
    "from:no-reply@ashbyhq.com",
    "from:noreply@ashbyhq.com",
  ].join(" OR ");
  const subjectClause = [
    'subject:"we received your application"',
    'subject:"thank you for applying"',
    'subject:"thanks for applying"',
    'subject:"application received"',
    'subject:"application confirmation"',
    'subject:"received your application"',
    'subject:"your application to"',
  ].join(" OR ");
  const q = `${ageClause} AND ((${senderClause}) OR (${subjectClause}))`;

  const list = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: maxMessages,
  });

  const ids = list.data.messages ?? [];
  const out: GmailMessageSummary[] = [];

  // Fetch each message's headers in parallel.
  await Promise.all(
    ids.map(async (m) => {
      if (!m.id) return;
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const headers = msg.data.payload?.headers ?? undefined;
      const from = headerValue(headers, "From");
      const subject = headerValue(headers, "Subject");
      const dateHeader = headerValue(headers, "Date");
      const receivedAt = msg.data.internalDate
        ? new Date(Number(msg.data.internalDate))
        : dateHeader
          ? new Date(dateHeader)
          : new Date();
      out.push({
        id: m.id,
        threadId: m.threadId ?? m.id,
        receivedAt,
        from,
        fromDomain: extractDomain(from),
        subject,
        snippet: msg.data.snippet ?? "",
      });
    }),
  );

  out.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  return out;
}

/**
 * Read the primary Gmail address of the authenticated user.
 */
export async function profileEmail(gmail: gmail_v1.Gmail): Promise<string | null> {
  const res = await gmail.users.getProfile({ userId: "me" });
  return res.data.emailAddress ?? null;
}

/**
 * Find the most recent verification-code email from a specific company and
 * extract the 6-8 character alphanumeric code from the body. Returns null
 * if no such email is found within the last few minutes.
 *
 * Companies that send these: Reddit, GitLab, Anthropic, and most modern
 * Greenhouse boards that block AI submissions with an email CAPTCHA.
 */
export async function findVerificationCode(
  gmail: gmail_v1.Gmail,
  options: {
    company: string;
    sinceMinutes?: number;
  },
): Promise<string | null> {
  const since = options.sinceMinutes ?? 10;
  const subjectClause = [
    "verification code",
    "security code",
    "confirm your application",
    "confirm your email",
    "your code",
    "verify your application",
  ]
    .map((s) => `subject:"${s}"`)
    .join(" OR ");

  // Greenhouse sends from noreply@greenhouse.io. Companies sometimes use
  // their own no-reply addresses with the company name in From.
  const senderClause = [
    "from:no-reply@greenhouse.io",
    "from:noreply@greenhouse.io",
    `from:${options.company.toLowerCase()}`,
  ].join(" OR ");

  const q = `newer_than:${Math.max(1, Math.ceil(since / 60 / 24))}d AND ((${senderClause}) OR (${subjectClause}))`;

  const list = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: 10,
  });
  const ids = list.data.messages ?? [];
  if (ids.length === 0) return null;

  for (const m of ids) {
    if (!m.id) continue;
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "full",
    });
    // Skip messages older than `since` minutes
    const internalMs = msg.data.internalDate ? Number(msg.data.internalDate) : 0;
    if (Date.now() - internalMs > since * 60_000) continue;

    // Extract code from snippet OR body. Snippet is enough for most
    // verification emails since the code appears in the first 200 chars.
    const snippet = msg.data.snippet ?? "";
    const code = extractCode(snippet);
    if (code) return code;

    // Fallback to full body text
    const bodyText = walkPartsForText(msg.data.payload).slice(0, 4000);
    const fromBody = extractCode(bodyText);
    if (fromBody) return fromBody;
  }
  return null;
}

function walkPartsForText(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  if (part.body?.data) {
    try {
      const decoded = Buffer.from(part.body.data, "base64").toString("utf-8");
      // For HTML parts, strip tags lightly.
      return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    } catch {
      // ignore
    }
  }
  if (part.parts) {
    return part.parts.map(walkPartsForText).join(" ");
  }
  return "";
}

function extractCode(text: string): string | null {
  // Patterns for 6-8 character alphanumeric verification codes. Greenhouse's
  // standard is 8 chars alphanumeric (e.g. "gq9O38L6"). Reddit uses 8.
  // Some other ATSes use 6-digit numeric.
  const patterns = [
    /\b([A-Za-z0-9]{8})\b(?=[^A-Za-z0-9]|$)/, // 8-char alphanumeric
    /\b([A-Za-z0-9]{7})\b(?=[^A-Za-z0-9]|$)/, // 7-char
    /\b([A-Za-z0-9]{6})\b(?=[^A-Za-z0-9]|$)/, // 6-char
    /\b(\d{6})\b/, // 6-digit numeric
  ];
  // Skip false positives — common words/numbers we don't want to interpret
  // as codes.
  const blocklist = /^(application|greenhouse|reddit|please|company|software|engineer|product|design|january|february|march|april|august|septemb|october|november|decembe)$/i;
  for (const pat of patterns) {
    const m = text.match(pat);
    if (!m) continue;
    if (blocklist.test(m[1])) continue;
    return m[1];
  }
  return null;
}
