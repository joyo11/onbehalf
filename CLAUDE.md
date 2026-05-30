# Onbehalf

Autonomous AI job-application agent. Finds jobs that match your resume, tailors cover letters, drives a real browser to fill the form, submits it, and tracks the outcome.

Public repo: `joyo11/onbehalf` · Live: `onbehalfai.vercel.app` · Status: pre-launch, single-user (Shafay), v0.

---

## Architecture in one paragraph

A user signs up (Clerk), runs onboarding (6 sections + resume PDF), and gets a profile + a resume embedding (OpenAI `text-embedding-3-small`, 1536-dim). Hourly cron scrapes Greenhouse boards and embeds new JDs into pgvector. The dashboard ranks jobs by cosine similarity to the resume. When the user (or a batch) queues a job, `/api/process-queue` calls `runSubmission`, which opens a Browserbase session, detects the ATS (Greenhouse / Lever / Ashby), dispatches to the matching form-filler, clicks Submit, and watches for thank-you, validation error, or CAPTCHA. CAPTCHA-blocked apps land in `awaitingCode` and a separate flow polls Gmail for the verification email and finishes them automatically.

---

## Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 App Router · React 19 · TypeScript |
| Styling | Tailwind v4 · Fraunces (display) / Quicksand (body) / Caveat (hand) / JetBrains Mono |
| Auth | Clerk v7 |
| Database | Supabase Postgres + pgvector + Drizzle ORM (transaction pooler) |
| Browser | Browserbase + playwright-core (`chromium.connectOverCDP`) |
| LLM | Anthropic Claude (tailoring, smart-fill) · OpenAI (embeddings) |
| Mail | Google OAuth + Gmail readonly (CAPTCHA + confirmation polling) |
| PDF | pdf-lib |
| Host | Vercel Hobby ($0; 60s function ceiling; limited crons) |

---

## Directory map

```
app/
  page.tsx                   landing
  (app)/                     authenticated routes (dashboard, search, matches, review, tracker, settings)
  api/
    process-queue/           cron entry, drives runSubmission
    complete-with-code/      Phase 1 CAPTCHA completion (polls Gmail, finishes blocked apps)
    scrape-jobs/             hourly Greenhouse scrape
    check-gmail/             daily confirmation-email scan
    submit/                  manual single-app submit
    batch-submit/            queue N matches for the current user
    applications/[id]/       per-application API + screenshot
    profile/                 onboarding + section-level Settings saves

lib/
  db/                        Drizzle schema + postgres client
  submit/
    orchestrate.ts           runSubmission entry; session, ATS dispatch, CAPTCHA detection
    greenhouse.ts            Greenhouse form filler + shared helpers (EEO maps, React-Select, city autocomplete, N/A fallback)
    lever.ts                 Lever form filler (in flight)
    ashby.ts                 Ashby form filler (in flight)
    complete.ts              Phase 1 CAPTCHA: fresh session, re-fill, poll Gmail, type code, finish
    smart-fill.ts            Claude Haiku-generated answers for unknown required fields (in flight)
    browserbase.ts           session lifecycle
    types.ts                 SubmissionProfile, SubmissionStep, SubmissionResult
  jobs/queries.ts            findMatchingJobs (pgvector cosine + HNSW)
  tailor.ts                  Claude-based cover letter + screener answers
  gmail.ts                   OAuth client + listConfirmationCandidates + findVerificationCode

components/
  ob/                        design system (primitives, sidebar, mobile-nav, icons)
  sidebar.tsx, mobile-nav.tsx

scripts/                     one-off (scrape, embed, queue, migrate, debug). Each takes env from .env.local.
```

---

## Submit pipeline

1. **Trigger** — `/api/process-queue` is hit (cron or `after()` self-recurse). It finds the next `queued` application and calls `runSubmission(id)`.
2. **Session** — `startSession()` (lib/submit/browserbase.ts) opens a Browserbase CDP session. Returns `{ page, sessionId, liveViewUrl, close }`.
3. **Navigate** — open `job.applyUrl`. `unwrapToFormPage()` handles "Apply Now" intermediate pages and iframe-embedded Greenhouse widgets.
4. **Detect ATS** — URL pattern + page probe (`isGreenhousePage`, `isLeverPage`, `isAshbyPage`). Sets `ats` to one of `greenhouse | lever | ashby | unknown`.
5. **Fill** — dispatch to the matching form-filler. Each filler returns `{ steps }` and does NOT click Submit.
6. **Submit** — orchestrate.ts clicks the primary Submit button. After 15s networkidle + 2s settle:
   - Body contains "thank you / received / we'll be in touch" → `submitted`
   - A `security/verification code` input appeared OR body matches CAPTCHA regex → `awaitingCode`
   - Body contains validation error keywords → `needsHuman`
7. **Persist** — application status + screenshot are written; `after()` triggers `/api/complete-with-code` 45s later if status is `awaitingCode`.

**Form-fillers JUST fill. Submission lives in orchestrate.** This is intentional: it gives CAPTCHA detection one centralized place.

---

## CAPTCHA flow (Reddit / GitLab / Anthropic)

These boards send 8-char alphanumeric codes to email to block bots. Our flow:

1. orchestrate detects the code-input after Submit → `awaitingCode`.
2. `after()` schedules `/api/complete-with-code` with a 45s delay (lets the email arrive).
3. The endpoint reads the user's Gmail refresh token and calls `completeWithCode(applicationId)`.
4. `completeWithCode` opens a **fresh** Browserbase session (the original is dead), re-fills the form via `fillGreenhouseForm`, clicks Submit — which sends a **new** code email tied to the new session.
5. Polls Gmail (`findVerificationCode`) for the new code (up to 45s, 5s intervals).
6. Types the code, clicks Verify/Submit. Updates status.

Phase 1 supports users who connected Gmail at signup (capped at 100 by Google's test-user whitelist until the OAuth app is verified). Phase 2 (paste-code UX for users without Gmail) is deferred.

---

## Matching

`findMatchingJobs(q)` does cosine similarity (`<=>` operator) against the user's resume embedding and an HNSW index on `job.jd_embedding`. Hard filters (role keywords, location, salary, seniority exclusions) are applied as SQL WHERE clauses BEFORE ranking.

**Gotcha:** pgvector's HNSW default `ef_search = 40` caps results at 40 regardless of LIMIT. The query is wrapped in a transaction with `SET LOCAL hnsw.ef_search = max(100, limit*4)` to actually fill the LIMIT.

---

## Application statuses (enum)

```
matching · queued · tailoring · submitting · submitted · confirmed
needsHuman · awaitingCode · failed · draft · pending
```

Adding a new value requires a `ALTER TYPE application_status ADD VALUE` migration — see `scripts/migrate-status-enum.ts` for the idempotent DO $$ pattern.

---

## Env vars

```
DATABASE_URL                 Supabase Postgres pooler (port 6543)
NEXT_PUBLIC_APP_URL          https://onbehalfai.vercel.app (overrides VERCEL_URL for OAuth redirect)

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY

ANTHROPIC_API_KEY            tailoring + smart-fill
OPENAI_API_KEY               text-embedding-3-small for resumes + JDs

BROWSERBASE_API_KEY
BROWSERBASE_PROJECT_ID

GOOGLE_CLIENT_ID             Gmail OAuth
GOOGLE_CLIENT_SECRET

CRON_SECRET                  Bearer token for cron endpoints (process-queue, scrape-jobs, complete-with-code)
SCRAPE_TOKEN                 same role; either works

REAL_SUBMIT_ENABLED          'true' to actually click Submit; anything else = demo (fills but doesn't click)
```

---

## Local dev

```
npm install
cp .env.local.example .env.local   # fill in keys
npm run dev                         # http://localhost:3000
npm run db:push                     # sync schema to Supabase
npm run scrape                      # one-off Greenhouse scrape
```

---

## Vercel gotchas

- **60s function ceiling.** Tailoring (~30s) + form-fill (~25s) + submit eats the budget. Tailoring is cached on the application row so retries don't pay the Claude bill twice.
- **Hobby cron limits.** Don't add `*/5 * * * *` schedules — they reject. Use `after()` self-triggers for short-interval polling.
- **Alias is per-deploy.** After `vercel deploy --prod`, run `vercel alias set <url> onbehalfai.vercel.app` to point production traffic. Better: add `onbehalfai.vercel.app` as a managed domain in the Vercel dashboard so it auto-follows.
- **Browserbase sessions die on function return.** Don't try to keep a session alive across requests. For multi-stage flows (like CAPTCHA), open a fresh session and re-do the form fill — it's fast because tailoring is cached.
- **playwright-core runtime require of `browsers.json`** — handled via `outputFileTracingIncludes` in `next.config.ts`.
- **serverExternalPackages** — `playwright-core` and `@browserbasehq/sdk` are externalized so they aren't bundled into the Edge runtime.

---

## Adding a new ATS

1. Create `lib/submit/{ats}.ts` exporting `is{Ats}Page(page)` and `fill{Ats}Form(page, profile, jobCtx?)`.
2. Add the ats name to the union in `lib/submit/types.ts` (`SubmissionResult.ats`) and the local `ats` var in `orchestrate.ts`.
3. Add a detection branch in orchestrate (URL pattern + probe).
4. Add a dispatch branch that calls `fill{Ats}Form` and pushes its steps.
5. **Reuse, don't duplicate.** `mapEeoToOption`, `fillReactSelect`, `fillCityAutocompletes`, and `fillEmptyRequiredTextInputs` are exported from `greenhouse.ts` because EEO sections and React-Select dropdowns are nearly identical across ATSes.

---

## Conventions

- Form-fillers fill, orchestrate submits. Don't click Submit inside a filler.
- Profile fields are source-of-truth; never hardcode user data in a filler.
- Log every meaningful action via `logEvent(applicationId, step, payload)` so the review page can replay what happened.
- Status writes go through one place (the end of `runSubmission` or `completeWithCode`). Don't write status from inside a filler.
- Drizzle pgEnum migrations always go through a `scripts/migrate-*.ts` raw SQL script (idempotent `DO $$ ... IF NOT EXISTS ... ADD VALUE`).
- Tailwind breakpoints: sidebar/drawer switch at **`lg` (1024px)**, not `md` — `md` would put the desktop sidebar on iPad portrait, which is wrong.

---

## Known gaps (2026-05-30)

- Workday unsupported. Hardest ATS — iframes, dynamic auth, often a custom multi-step wizard. Punted.
- "How did you hear about us?" hardcoded to "LinkedIn." If the form's options don't include it → validation error.
- City autocomplete picks the first matching option. Ambiguous cities ("Brooklyn") can pick the wrong state.
- `needsSponsorship`, `workAuthorization`, `currentlyAuthorizedUS` are three fields that can disagree. F-1 OPT users need a specific combination; the filler handles it but it's brittle.
- CAPTCHA Phase 1 (Gmail-poll completion) was just built. End-to-end test pending.
- Public OAuth verification not done → Gmail features capped at 100 test users on the whitelist.

---

## What's actively in flight

- Lever + Ashby ATS support (subagents writing them now).
- LLM-based smart fill for unknown required fields — replaces the "N/A" fallback with a Claude Haiku call that uses profile + JD context.
- After those land: first real cross-ATS run + the first end-to-end CAPTCHA Phase 1 validation.
