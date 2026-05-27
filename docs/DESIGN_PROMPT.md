# Onbehalf — Claude Design Prompt

> Paste this into Claude.ai to produce the full visual design spec before the Claude Code build begins. Iterate inside Claude, then hand the final spec back to Claude Code for implementation.

---

You are the lead product designer for **Onbehalf** — an autonomous AI agent that finds, tailors, and submits job applications on behalf of the user. Your job is to design every screen of the v1 product to a level of polish that recruiters at a funded YC startup would consider shippable. This is a portfolio project for an engineer who is putting the live URL on their resume, so the visual bar is "calm, premium, trustworthy" — Notion meets Stripe meets Linear. Nothing toy. Nothing tutorial-grade.

## What the product does (one paragraph)

The user uploads a resume, completes an 8-step onboarding (~5 min), then says "apply to 20 senior backend roles in NYC paying $180k+." Onbehalf finds matching jobs from Greenhouse, Lever, and Ashby; (optionally) tailors the resume + writes a cover letter per job; fills the application form via Playwright; watches Gmail for confirmations; and logs everything into a live **Application Tracker** that exports to Excel. The user can run in *Review-each*, *Auto-submit > 85% match*, or *Auto-submit all* mode. Trust is the core emotion — every tailored bullet is diff-viewable, nothing is fabricated, and the user can audit every submission.

## Brand & visual system (use exactly)

- **Background:** `#FAFAF7` (warm sand)
- **Surface (card):** `#FFFFFF`
- **Text primary:** `#1A1A1A`
- **Text secondary:** `#6B6B6B`
- **Accent:** `#0D9488` (muted teal) / hover `#0F766E`
- **Success:** `#15803D` · **Warning:** `#D97706` · **Error:** `#DC2626` · **Border:** `#E7E5E0`
- **Font:** Inter (400 / 500 / 600 only — never 700+)
- **Radii:** cards 8px · buttons/inputs 6px · pills 999px
- **Shadows:** subtle only (`0 1px 2px rgba(0,0,0,0.04)`); never drop-shadowy
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
- **Density:** generous whitespace; never feels cramped; reading width capped at 720px for prose
- **Motion:** Framer Motion, 150–250ms ease-out only; no bounces, no parallax
- **Iconography:** Lucide; 1.5px stroke; never decorative — every icon earns its place

## Tone of voice

Plainspoken, confident, human. No exclamation marks. No "✨ AI-powered." No "supercharge." Microcopy reads like a thoughtful colleague, not a marketing site. Examples:
- ✅ "We'll watch your inbox for confirmations."
- ❌ "🚀 Let our AI track your applications automatically!"

## Screens to design (in this order)

For each screen, produce: (1) a layout description detailed enough to build from, (2) component inventory with states, (3) microcopy for every visible string, (4) one short paragraph of design rationale explaining the key decisions.

### 1. Marketing — Landing page (`/`)
Hero, social proof strip (logos of ATSes we support, not fake testimonials), 3-step "how it works," tracker preview (the killer feature — show a real-looking table), pricing teaser, FAQ, footer. The hero must answer: *what is this, who's it for, what's different from Simplify/LazyApply.* Make trust visible above the fold ("you approve every submission," "we never fabricate experience").

### 2. Marketing — Pricing (`/pricing`)
Three tiers (Free / Pro / Unlimited). Show feature matrix. Make the Pro tier the obvious choice without dark patterns.

### 3. Onboarding (8 steps, `/onboarding`)
A single full-bleed flow with a slim progress rail (not a stepper bar — too corporate). Each step is its own screen with a single primary action. Steps:
1. **Upload resume** — drag-drop zone, then a parsed-sections preview where the user confirms/edits each section inline
2. **Personal info** — name, email, phone, location, LinkedIn, GitHub, portfolio
3. **Target roles** — chip input with smart suggestions based on parsed resume
4. **Years of experience** — total (dropdown buckets) + per-skill cards (auto-extracted, editable) + years at current role
5. **Work preferences** — auth status, remote/hybrid/onsite (pill toggles), willing to relocate, salary floor (slider with live $ readout), notice period, excluded companies (chip input)
6. **Voice sample** — textarea with a soft prompt ("paste 2–3 paragraphs of something you wrote — a cover letter, blog post, anything in your voice")
7. **Gmail OAuth** — explicitly state read-only, show what we read and what we don't
8. **Tailoring preference** — the big toggle: *"Should AI tailor your resume per job?"* with Yes (recommended) / No. Plain-English explanation of the tradeoff under each option.

Design the *resume parse confirmation* (step 1 follow-up) and the *skill_years editable cards* (step 4) carefully — these are the moments the user decides if they trust the product.

### 4. Dashboard home (`/dashboard`)
Default landing for authed users. Shows: this week's stats (applications sent, confirmations received, response rate), a "Start a new search" CTA, recent applications (5 rows from the tracker), inbox-style alerts (CAPTCHA-blocked, needs-human, low-confidence answers waiting for review). Empty state for brand-new users is critical — design it.

### 5. Search / Setup screen (`/search`)
Single screen pre-filled from onboarding: role keywords (chips), locations (chips), salary minimum (slider), company size (pill toggle), excluded companies (chip), batch size (stepper 1–50), mode (segmented control: Review each / Auto-submit > 85 / Auto-submit all), big "Find & Apply" button. Show estimated time + cost (if paid plan).

### 6. Match results (`/search/results`)
Ranked list of matched jobs. Each row: company logo, title, location, salary, match score (circular progress, 0–100), one-line "why this matched" explanation. Bulk-select for batch action. Click row → Review screen.

### 7. Review screen (per application) — **the trust moment**
Two-pane layout:
- **Left:** JD summary, match score breakdown (semantic / keyword / experience), screener Q&A cards (auto-filled, low-confidence flagged amber with a soft warning icon)
- **Right:** if tailoring on → **DiffViewer** (original bullet → tailored bullet, side-by-side, with a tooltip on each change showing Claude's one-sentence reasoning); if tailoring off → base resume preview. Below: cover letter (editable textarea, 250-word counter).
- **Bottom bar (sticky):** Skip · Edit · **Approve & Submit** (primary). Keyboard shortcuts shown.

Design the DiffViewer carefully — additions in muted teal underline, removed text in subtle strikethrough, never red/green (too aggressive).

### 8. Application Tracker (`/tracker`) — **the dashboard star**
Live spreadsheet view. Sticky header row, zebra-striped body, hover row highlight. Columns: # · Company · Role · Date Applied · JD Link · Cover Letter · Resume · Tailoring Changes · Status · Confirmation. `Cover Letter` / `Resume` / `JD Link` are clickable — open in a side drawer (not a modal). `Tailoring Changes` shows the one-sentence Claude summary inline with a "see diff" hover. `Status` is a colored pill (Queued / Tailoring / Pending Review / Submitting / Submitted / Confirmed / Failed / Needs Human). `Confirmation` shows "✓ 2d ago" or "—". Filters above the table: status (multi-select pills), date range, company search, match score range. Above the filters: **Export to Excel** button (subtle, not shouty). Empty state designed.

Also design: the **side drawer** that opens for Cover Letter / Resume / JD; the **filters bar** behavior; the **bulk action bar** that appears when rows are selected.

### 9. Settings (`/settings`)
Tabs: Profile · Preferences · Tailoring · Gmail connection · Billing · Danger zone. The Tailoring tab is the big global toggle from onboarding step 8, with a one-line "this affects all future applications" note.

### 10. Live submission view (small but important)
When the agent is actively submitting (Auto modes), show a slim live-status panel — current job, current step ("Filling personal info…", "Uploading resume…", "Answering: years of Python experience"), screenshot preview from Browserbase. Feels alive without being a casino.

### 11. Error / blocked states
Design: **CAPTCHA blocked** (calm, "we can't solve this one — open the link to finish manually"), **Form unknown** ("we couldn't read this form, we've flagged it"), **Daily cap reached** (the 50/day safety limit — explain why it exists), **Gmail disconnected**.

### 12. Empty states (all of them)
Brand-new tracker, no search yet, no confirmations yet, no matches found. Each one needs a single illustration concept (describe it — don't need to draw it) and a single primary action.

## Deliverables (what to produce in the chat)

Produce in this order, one artifact per screen group so I can iterate:

1. **Design rationale doc** (one artifact) — vibe, layout principles, what we're stealing from (Linear's calm density, Stripe's typography, Notion's blocks), what we're explicitly *not* doing (no purple gradients, no glow effects, no "AI sparkle" iconography).
2. **Component library** (one artifact) — every reusable primitive: Button (4 variants × 3 sizes × 5 states), Input, Chip, Pill, StatusPill (each of the 8 statuses), MatchScore circular, Card, Drawer, Toast, EmptyState, Skeleton. Specify Tailwind classes for each.
3. **Screen specs** (one artifact per screen, in the order above) — layout description, component inventory, every visible string of microcopy, all states (empty/loading/error/success).
4. **Application Tracker deep-dive** (its own artifact) — this is the star feature, give it extra love. Include the Excel export styling (column widths, header formatting, hyperlink color).
5. **Onboarding deep-dive** (its own artifact) — the 8 steps, with special attention to step 1 (resume parse confirmation) and step 8 (tailoring toggle).
6. **Motion spec** (one artifact) — every animation: page transitions, drawer open, status pill changes, the live submission view, the diff reveal in Review.
7. **Microcopy library** (one artifact) — every empty state line, every error message, every confirmation toast, every CTA. Onbehalf has a voice; codify it.

## Hard constraints

- Use only the colors, font, radii, and shadow values listed above. If you want to add one, justify it.
- No stock illustrations. Describe icon-led empty states using Lucide icons or simple geometric shapes.
- No emojis in the product UI. (Marketing site: one or two, max, and only if they earn it.)
- Every screen must work at 1280px wide minimum; design mobile-responsive layouts for marketing, dashboard, tracker, and settings (the rest can be desktop-only for v1).
- Accessibility: WCAG AA contrast on every text/background pair you specify; focus rings visible; nothing communicated by color alone.
- The product must never look like it's trying to trick a recruiter or ATS. It's a tool the user is openly using to apply faster and better.

## What "done" looks like

I should be able to hand your spec to a Claude Code agent and get a production-grade implementation back without making a single design call myself. Every screen, every state, every string accounted for.

Start with the design rationale doc, then wait for me to approve before moving to the component library.
