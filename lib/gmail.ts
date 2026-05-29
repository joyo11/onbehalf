import { google, type gmail_v1 } from "googleapis";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

function appUrl(req?: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (req) {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  }
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
