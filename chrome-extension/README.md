# Onbehalf — Chrome Extension

This extension is the executor for the Onbehalf agent. The server (at `onbehalfai.vercel.app`) handles scraping, tailoring, matching, the confidence gate, and the review UI. The extension does one job: **drive the user's actual browser to fill an application form on their machine.**

That means:

- No server-side Chromium. No Browserbase bill. Zero per-application infrastructure cost.
- Your job applications go through **your** browser, on **your** IP, with **your** cookies. Onbehalf never logs into the company's website for you.
- You watch every keystroke. You approve every Submit click.

## Development install

The extension isn't on the Chrome Web Store yet. To run locally:

1. Open `chrome://extensions` in Chrome
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Select this `chrome-extension/` directory
5. The Onbehalf icon appears in the toolbar

You also need to be signed in to the Onbehalf web app at <https://onbehalfai.vercel.app>. The extension reuses your existing session cookie — no separate login.

## What the extension does today (Phase 2 scaffold)

- Loads on any Greenhouse-hosted apply URL (`*.greenhouse.io`, `boards.greenhouse.io`, `job-boards.greenhouse.io`)
- Detects whether the page actually contains an application form
- Talks to the server via `credentials: 'include'` fetches so your Clerk session cookie rides along — no API tokens to manage
- The popup shows whether you're signed in and whether the current tab looks like a form we can fill

What it does NOT do yet (intentionally — these are Phase 3-5):

- The fill itself. Phase 3 ports the form-fill logic from the existing `lib/submit/greenhouse.ts` into a content-script-runnable module
- Server endpoints for `next-job` / `screenshot`. Phase 4 builds those
- Approve & Submit through the extension. Phase 5 wires the end-to-end flow

## Architecture

```
+--------------------+         +------------------+
|  onbehalfai.vercel |         | extension popup |
|  .app  (server)    |◀─────▶|                  |
|                    |  Clerk  | shows account,   |
|  - scrape          | cookie  | current-tab,     |
|  - tailor          |         | next action      |
|  - match           |         +────────┬─────────+
|  - confidence gate |                  │
|  - review UI       |                  │ chrome.runtime
+──────────┬─────────+                  │ messages
           │                            │
           │  fetch(...)  ◀─────────────│
           │   credentials: 'include'   │
           │                            ▼
           │                  +───────────────────+
           └────────────────▶ │ background.js    │
                              │ (service worker) │
                              │  thin router     │
                              +──────────┬───────+
                                         │
                                         │ chrome.tabs.sendMessage
                                         ▼
                              +────────────────────+
                              │ content.js        │
                              │ runs on greenhouse│
                              │ pages              │
                              │  - detect form     │
                              │  - fill form       │ ← Phase 3
                              │  - screenshot      │
                              │  - report back     │
                              +────────────────────+
```

## Files

| File | Purpose |
|---|---|
| `manifest.json` | V3 manifest. Declares permissions, host permissions, content script matches |
| `src/background.js` | Service worker. Routes messages between popup, content script, and the API |
| `src/content.js` | Runs on Greenhouse pages. Detects forms today; fills them in Phase 3 |
| `src/popup.html` / `.css` / `.js` | The toolbar popup — account state + current tab status |
| `icons/` | Toolbar icons (placeholder, replace before store submission) |

## Permissions explained

- `activeTab` — read the URL of the current tab when the popup is open
- `scripting` — inject the fill logic on demand (Phase 3)
- `storage` — remember the API base URL (so QA can point at a staging build)
- `host_permissions` for `onbehalfai.vercel.app` — fetch our API with the user's session cookie
- `host_permissions` for `*.greenhouse.io` — run the content script on apply pages

We do NOT request `<all_urls>` or any cross-cutting permission. The extension is scoped tightly to Greenhouse + our own API.
