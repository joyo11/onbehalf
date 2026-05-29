import { Browserbase } from "@browserbasehq/sdk";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export type BrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
  liveViewUrl: string;
  close: () => Promise<void>;
};

export async function startSession(): Promise<BrowserSession> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error(
      "BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set in env.",
    );
  }

  const bb = new Browserbase({ apiKey });

  const session = await bb.sessions.create({ projectId });

  // Live view URL — recruiters/users can watch the agent work in real time.
  const liveViews = await bb.sessions.debug(session.id).catch(() => null);
  const liveViewUrl = liveViews?.debuggerFullscreenUrl ?? "";

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());

  return {
    browser,
    context,
    page,
    sessionId: session.id,
    liveViewUrl,
    close: async () => {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    },
  };
}
