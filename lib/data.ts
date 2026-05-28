import type {
  Company,
  DiffSegmentT,
  GmailItem,
  Job,
  QueueItem,
  ScreenerQ,
  SkillYear,
  TimelineStage,
  TrackerRow,
} from "./types";

export const COMPANIES: Company[] = [
  { name: "Linear", industry: "Software", size: "Mid" },
  { name: "Vercel", industry: "Cloud infra", size: "Mid" },
  { name: "Stripe", industry: "Fintech", size: "Enterprise" },
  { name: "Anthropic", industry: "AI research", size: "Mid" },
  { name: "Notion", industry: "Productivity", size: "Mid" },
  { name: "Ramp", industry: "Fintech", size: "Mid" },
  { name: "Mercury", industry: "Fintech", size: "Startup" },
  { name: "Plaid", industry: "Fintech", size: "Mid" },
  { name: "Figma", industry: "Design tools", size: "Enterprise" },
  { name: "Retool", industry: "Dev tools", size: "Mid" },
  { name: "Vanta", industry: "Security", size: "Mid" },
  { name: "Modal Labs", industry: "AI infra", size: "Startup" },
];

export const JOBS: Job[] = [
  {
    id: "j-lin-1",
    company: "Linear",
    role: "Senior Product Engineer, Workflows",
    location: "Remote (US)",
    salary: "$185k – $230k",
    score: 92,
    posted: "2d ago",
    summary:
      "Own the workflow primitives that power Linear's issue tracking — cycles, projects, and triage flows used by every customer.",
    jd: [
      "Lead end-to-end product engineering on the workflows surface — from idea to ship, including UX details, API design, perf, and rollout.",
      "You'll partner closely with design and ship in tight 1–2 week loops. We expect strong taste and a bias for craftsmanship.",
      "Strong TypeScript + React fundamentals. Experience with Kubernetes-orchestrated services a plus — we run our backend on EKS.",
      "Comfort owning ambiguous problems end-to-end. We don't have PMs on this surface; engineers drive direction with design.",
      "Bonus: prior experience shipping at a high-leverage product company (Linear, Figma, Notion, Vercel, etc.).",
    ],
  },
  {
    id: "j-vrc-1",
    company: "Vercel",
    role: "Staff Software Engineer, Edge Runtime",
    location: "San Francisco · Remote OK",
    salary: "$240k – $310k",
    score: 89,
    posted: "5h ago",
    summary:
      "Push the limits of what runs at the edge. You'll shape the runtime that serves billions of requests a day across our network.",
    jd: [
      "Design and harden the V8-isolate-based edge runtime that backs Next.js Middleware, Functions, and AI streaming primitives.",
      "Deep systems experience — V8, WASM, container runtimes, or kernel-level networking. Strong Rust or C++ a plus.",
      "You've scaled infrastructure to billions of requests/day and led architectural calls others rely on.",
      "Comfort writing public technical content — RFCs, blog posts, conference talks.",
    ],
  },
  {
    id: "j-anth-1",
    company: "Anthropic",
    role: "Member of Technical Staff, Applied AI",
    location: "San Francisco · Hybrid",
    salary: "$310k – $410k + equity",
    score: 87,
    posted: "1d ago",
    summary:
      "Embed with frontier-model teams to translate raw model capabilities into reliable product experiences for developers and enterprises.",
    jd: [
      "Build production-grade tooling, evaluations, and guardrails around frontier language models. You'll work alongside research.",
      "Strong Python; experience instrumenting and shipping ML systems in production. Kubernetes-orchestrated services a plus.",
      "You care deeply about safety, evaluation rigor, and the gap between \"demo\" and \"actually works for users every day\".",
      "Comfort moving between deep technical work and concise written explanations for non-technical leadership.",
    ],
  },
  {
    id: "j-strp-1",
    company: "Stripe",
    role: "Product Engineer, Payments UX",
    location: "New York · Hybrid",
    salary: "$190k – $245k",
    score: 81,
    posted: "3d ago",
    summary:
      "Reduce friction in the checkout flow used by millions of merchants. Small UX wins compound to billions in incremental volume.",
    jd: [
      "Lead UX and front-end engineering on the Checkout surface. Ship A/B-tested changes weekly; measure conversion impact in basis points.",
      "Strong React + TypeScript; comfortable with Stripe-scale internationalization, accessibility, and instrumentation.",
      "You've owned a high-traffic surface where small UX details directly drive measurable business outcomes.",
    ],
  },
  {
    id: "j-not-1",
    company: "Notion",
    role: "Senior Engineer, Collaboration",
    location: "Remote (US/Canada)",
    salary: "$180k – $225k",
    score: 78,
    posted: "4d ago",
    summary:
      "Make multi-player editing feel instant for teams of 10,000+. Own the CRDT layer that powers real-time collaboration.",
    jd: [
      "Push the limits of our CRDT and sync engine. Improvements here are felt by every Notion user, every minute.",
      "Strong distributed-systems sensibilities. Experience with WebSocket transport, conflict resolution, or operational transforms.",
      "Comfort going deep on perf — flame graphs, p99 tracing, mobile-network reality.",
    ],
  },
  {
    id: "j-ramp-1",
    company: "Ramp",
    role: "Founding Engineer, AI Agents",
    location: "New York · On-site",
    salary: "$220k – $280k + equity",
    score: 85,
    posted: "8h ago",
    summary:
      "Greenfield team building agentic workflows that automate finance ops — receipt matching, vendor negotiation, budget enforcement.",
    jd: [
      "Greenfield team. You'll own the architecture for agent loops that take real actions on customer finance data.",
      "Strong product instincts — you'll be ranking which workflows to automate next based on customer interviews and usage data.",
      "Comfort working without a finished spec. We're figuring out what \"agentic ops\" means in production as we go.",
    ],
  },
  {
    id: "j-merc-1",
    company: "Mercury",
    role: "Product Engineer, Treasury",
    location: "Remote (US)",
    salary: "$170k – $210k",
    score: 73,
    posted: "2d ago",
    summary:
      "Build the treasury product startups use to park idle cash safely while earning yield. Compliance-heavy but high-impact.",
    jd: [
      "Own and ship features end-to-end in the Treasury surface — yield products, transfers, reconciliation, statements.",
      "Comfort working through complex regulatory and partner-bank constraints. Prior fintech experience is a plus.",
    ],
  },
  {
    id: "j-fig-1",
    company: "Figma",
    role: "Senior Software Engineer, FigJam",
    location: "San Francisco · Hybrid",
    salary: "$210k – $265k",
    score: 76,
    posted: "6d ago",
    summary:
      "Bring the same craft Figma is known for to FigJam. The whiteboard is being adopted across enterprise teams — this is its growth year.",
    jd: [
      "Ship feature work end-to-end on the FigJam surface — collaboration, drawing, AI sticky-note clustering, voting flows.",
      "Strong front-end fundamentals; experience with Canvas/WebGL rendering, or real-time collaboration systems, a plus.",
    ],
  },
  {
    id: "j-rt-1",
    company: "Retool",
    role: "Software Engineer, Workflows",
    location: "San Francisco · Hybrid",
    salary: "$165k – $210k",
    score: 68,
    posted: "1w ago",
    summary:
      "Help internal teams at companies like DoorDash and Brex automate the long tail of glue work between SaaS tools.",
    jd: [
      "Ship into the Workflows product — visual triggers, branching, retries, error handling.",
      "Strong TypeScript; experience with workflow engines or queueing systems a plus.",
    ],
  },
  {
    id: "j-mdl-1",
    company: "Modal Labs",
    role: "Engineer, Container Runtime",
    location: "New York · On-site",
    salary: "$190k – $240k + equity",
    score: 83,
    posted: "3d ago",
    summary:
      "Serverless GPU runtime for AI workloads. Used by Suno, Replicate-grade customers. The container cold-start work here is genuinely novel.",
    jd: [
      "Own the container runtime — sub-second cold starts, GPU scheduling, sandboxing. Built on Kubernetes; rolling our own scheduler on top.",
      "Strong Linux internals, Go or Rust. Experience with gVisor, Firecracker, or containerd preferred.",
    ],
  },
  {
    id: "j-vt-1",
    company: "Vanta",
    role: "Senior Product Engineer, Trust Center",
    location: "Remote (US)",
    salary: "$175k – $220k",
    score: 71,
    posted: "5d ago",
    summary:
      "Make compliance shareable. The Trust Center is the public-facing surface customers send to their procurement teams.",
    jd: [
      "Own the Trust Center product end-to-end. Strong UX sensibility, partner closely with design.",
      "Strong TypeScript + React. Comfort with auth/SSO, data-export flows.",
    ],
  },
  {
    id: "j-plaid-1",
    company: "Plaid",
    role: "Product Engineer, Identity",
    location: "San Francisco · Hybrid",
    salary: "$185k – $235k",
    score: 64,
    posted: "1w ago",
    summary:
      "Help users prove who they are without friction. The Identity product is rolling out across every Plaid integration.",
    jd: [
      "Ship into the Identity verification surface — document scanning, selfie liveness, KYC orchestration.",
      "Strong front-end and an eye for friction. Familiarity with mobile SDK patterns a plus.",
    ],
  },
];

export const QUEUE: QueueItem[] = [
  { id: "q1", company: "Linear", role: "Senior Product Engineer, Workflows", score: 92, status: "confirmed", time: "8:14 AM", via: "Direct ATS", note: "Greenhouse — confirmation #LIN-2148" },
  { id: "q2", company: "Vercel", role: "Staff Software Engineer, Edge Runtime", score: 89, status: "submitted", time: "8:21 AM", via: "Direct ATS", note: "Awaiting confirmation email" },
  { id: "q3", company: "Anthropic", role: "Member of Technical Staff, Applied AI", score: 87, status: "pending", time: "8:42 AM", via: "Direct ATS", note: "Cover letter needs your review" },
  { id: "q4", company: "Ramp", role: "Founding Engineer, AI Agents", score: 85, status: "tailoring", time: "9:03 AM", via: "Lever", note: "Rewriting 4 bullets · 12 sec" },
  { id: "q5", company: "Stripe", role: "Product Engineer, Payments UX", score: 81, status: "submitting", time: "9:04 AM", via: "Workday", note: "Filling 23-question form" },
  { id: "q6", company: "Modal Labs", role: "Engineer, Container Runtime", score: 83, status: "queued", time: "9:10 AM", via: "Ashby", note: "In queue · est. 2 min" },
  { id: "q7", company: "Notion", role: "Senior Engineer, Collaboration", score: 78, status: "queued", time: "9:11 AM", via: "Greenhouse", note: "In queue · est. 4 min" },
  { id: "q8", company: "Figma", role: "Senior Software Engineer, FigJam", score: 76, status: "pending", time: "9:12 AM", via: "Greenhouse", note: "2 screener answers low-confidence" },
  { id: "q9", company: "Mercury", role: "Product Engineer, Treasury", score: 73, status: "confirmed", time: "7:48 AM", via: "Lever", note: "Confirmation received" },
  { id: "q10", company: "Vanta", role: "Senior Product Engineer, Trust Center", score: 71, status: "submitted", time: "7:58 AM", via: "Greenhouse", note: "Submitted via direct API" },
  { id: "q11", company: "Retool", role: "Software Engineer, Workflows", score: 68, status: "failed", time: "8:02 AM", via: "Workday", note: "Job posting closed" },
  { id: "q12", company: "Plaid", role: "Product Engineer, Identity", score: 64, status: "queued", time: "9:15 AM", via: "Greenhouse", note: "Borderline match · skip?" },
];

export const GMAIL: GmailItem[] = [
  { sender: "Linear Recruiting", from: "jobs@linear.app", subject: "We received your application", preview: "Thanks for applying to Senior Product Engineer, Workflows. We'll be in touch within 5 business days.", time: "8:16 AM" },
  { sender: "Mercury Talent", from: "no-reply@mercury.com", subject: "Application received — Product Engineer, Treasury", preview: "Thank you for your interest in Mercury. A recruiter will review your application shortly.", time: "7:50 AM" },
  { sender: "Vanta Recruiting", from: "careers@vanta.com", subject: "Application confirmation", preview: "We've received your application for the Senior Product Engineer, Trust Center role.", time: "8:01 AM" },
  { sender: "Greenhouse", from: "noreply@greenhouse.io", subject: "Your application to Vercel", preview: "Thank you for your application. Vercel will review it and follow up if there is a match.", time: "8:24 AM" },
];

export const REVIEW_JOB = {
  id: "j-lin-1",
  company: "Linear",
  role: "Senior Product Engineer, Workflows",
  location: "Remote (US)",
  salary: "$185k – $230k",
  score: 92,
};

export const REVIEW_ORIGINAL: string[] = [
  "Led front-end team of 4 engineers building internal admin tools at Brightlane (Series B fintech, 90 people).",
  "Shipped a Kubernetes-orchestrated deployment pipeline that reduced deploy time from 22 to 3 minutes.",
  "Built React component library used across 6 product teams; reduced new-page bring-up from 2 days to 4 hours.",
  "Owned end-to-end feature delivery: discovery, design partnership, scoping, shipping, and post-launch perf work.",
  "Mentored 2 junior engineers through their first 12 months; both promoted to mid-level within 14 months.",
];

export const REVIEW_TAILORED: DiffSegmentT[][] = [
  [
    { k: "keep", t: "Led " },
    { k: "add", t: "a tight ", r: 'JD emphasizes 1–2 week shipping loops — "tight" mirrors their language.' },
    { k: "keep", t: "front-end team of 4 engineers " },
    { k: "add", t: "shipping in 1–2 week loops ", r: 'Mirrors the JD phrase "tight 1–2 week loops" verbatim. ATS keyword + recruiter signal.' },
    { k: "keep", t: "building internal admin tools at Brightlane (Series B fintech, 90 people)." },
  ],
  [
    { k: "remove", t: "Shipped a Kubernetes-orchestrated deployment pipeline that reduced deploy time from 22 to 3 minutes. ", r: "Reordered to lead with Kubernetes — the JD mentions it 4 times. Putting it first surfaces the keyword for both human and ATS." },
    { k: "add", t: "Architected a Kubernetes-orchestrated deploy pipeline (EKS, Argo) that cut deploy time from 22 to 3 minutes — now the team's default deploy path.", r: 'Surfaces "EKS" because Vercel\'s JD calls out EKS by name. Adds the outcome of adoption — they care about leverage, not just shipping.' },
  ],
  [
    { k: "keep", t: "Built React " },
    { k: "add", t: "+ TypeScript ", r: 'JD lists "Strong TypeScript + React fundamentals" — exact phrasing.' },
    { k: "keep", t: "component library used across 6 product teams; reduced new-page bring-up from 2 days to 4 hours." },
  ],
  [
    { k: "keep", t: "Owned end-to-end feature delivery: discovery, design partnership, scoping, shipping, and post-launch perf work" },
    { k: "add", t: " — drove direction with design, no PM on the surface", r: 'JD: "We don\'t have PMs on this surface; engineers drive direction with design." Direct echo.' },
    { k: "keep", t: "." },
  ],
  [
    { k: "remove", t: "Mentored 2 junior engineers through their first 12 months; both promoted to mid-level within 14 months.", r: "Linear's JD doesn't emphasize mentorship. Swapped for a craft-and-taste bullet since the JD calls out both explicitly." },
    { k: "add", t: "Reputation on the team for craft and taste — bullets I've owned ship with the polish details intact (empty states, keyboard, motion).", r: 'Mirrors the JD\'s phrase "strong taste and a bias for craftsmanship." Specifics (empty states/keyboard/motion) signal hands-on product engineering.' },
  ],
];

export const REVIEW_COVER_LETTER = `Hi Linear team,

I've been a daily Linear user for three years and the workflow primitives — cycles, triage, projects — are the part of my stack I think about least, which is the highest compliment I can pay a tool.

I'm a senior product engineer most of the way through my third year at Brightlane (Series B fintech). My day-to-day looks a lot like what you describe: design-led, no-PM, 1–2 week loops, owning a surface end-to-end. I'd bring strong React/TypeScript fundamentals, comfort going deep on the Kubernetes/EKS side when needed, and the kind of taste that shows up in keyboard shortcuts and empty-state copy.

Two recent ships I'd point to: a deploy pipeline rewrite (22 → 3 min) that became the default path for our 18-person engineering org, and a customer-facing admin redesign that cut weekly support tickets by 34% in the first six weeks.

Happy to dig in further. Thanks for reading.

— Maya`;

export const REVIEW_SCREENERS: ScreenerQ[] = [
  { q: "Why Linear specifically?", a: "I've used Linear daily for three years across two companies. The workflow primitives — cycles, triage, projects — disappear into the background, which to me is the highest compliment a tool can earn. I'd like to work on the surface I rely on most.", confidence: "high" },
  { q: "What's your experience with Kubernetes in production?", a: "I led a deploy-pipeline rewrite at Brightlane onto EKS with Argo CD. I'm comfortable in the YAML and with the day-2 ops of it (rollouts, autoscaling, observability via Datadog) but I wouldn't call myself a platform engineer — I lean on a dedicated infra team for the deeper internals.", confidence: "high" },
  { q: "Are you authorized to work in the US without sponsorship?", a: "Yes.", confidence: "high" },
  { q: "Tell us about a time you disagreed with a designer and how you resolved it.", a: "On a recent settings redesign we disagreed about whether to surface advanced toggles in the primary flow. I prototyped both versions in a couple of afternoons and we ran them past three power users. The designer's version won on simplicity for new users; my version on power-user discoverability. We shipped a hybrid (primary flow simple, \"Advanced\" disclosure) and it tested well in week-two retention.", confidence: "medium" },
  { q: "Salary expectation?", a: "$210k base feels right given the role level and location flexibility, but I'm open to discussing the broader package.", confidence: "low" },
  { q: "When could you start?", a: "4 weeks notice from offer signing.", confidence: "high" },
];

export const DETAIL_TIMELINE: TimelineStage[] = [
  { stage: "tailored", label: "Tailored", time: "May 27, 8:13 AM", desc: "Rewrote 4 bullets, drafted cover letter, answered 6 screeners.", icon: "sparkles" },
  { stage: "approved", label: "Approved", time: "May 27, 8:15 AM", desc: "You approved the submission.", icon: "check" },
  { stage: "submitting", label: "Submitting", time: "May 27, 8:15 AM", desc: "Filled 23-field Greenhouse form. Uploaded tailored resume.pdf.", icon: "paper-plane" },
  { stage: "submitted", label: "Submitted", time: "May 27, 8:16 AM", desc: "Application accepted by Greenhouse ATS. Reference: LIN-2148.", icon: "check-circle" },
  { stage: "confirmed", label: "Confirmed", time: "May 27, 8:18 AM", desc: "Confirmation email arrived from jobs@linear.app.", icon: "mail" },
];

export const SKILL_YEARS: SkillYear[] = [
  { skill: "React", years: 6, level: "Expert" },
  { skill: "TypeScript", years: 5, level: "Expert" },
  { skill: "Node.js", years: 5, level: "Expert" },
  { skill: "Kubernetes", years: 3, level: "Intermediate" },
  { skill: "AWS / EKS", years: 3, level: "Intermediate" },
  { skill: "GraphQL", years: 4, level: "Advanced" },
  { skill: "PostgreSQL", years: 5, level: "Advanced" },
  { skill: "Design systems", years: 4, level: "Expert" },
];

export const TARGET_ROLES = ["Senior Product Engineer", "Staff Product Engineer", "Founding Engineer"];
export const TARGET_LOCATIONS = ["Remote (US)", "New York", "San Francisco"];
export const EXCLUDE_COMPANIES = ["Brightlane", "Atlassian"];

/* ---------- Tracker rows (from Design 2) ---------- */
function daysAgo(d: number) {
  return new Date(Date.now() - d * 86400000);
}
function fmtApplied(d: Date) {
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TRACKER_BASE: Omit<TrackerRow, "n" | "appliedAtLabel">[] = [
  { id: "t1", company: COMPANIES[0], role: "Senior Product Engineer, Workflows", location: "Remote (US)", salary: "$185k – $230k", appliedAt: daysAgo(0), jd: "https://jobs.linear.app/spe-workflows", resumeFile: "Resume - Linear SPE.pdf", changes: "Led with Kubernetes; added EKS callout; reordered taste/craft bullet.", changesCount: 4, status: "confirmed", matchScore: 92, confirmation: "8:18 AM" },
  { id: "t2", company: COMPANIES[1], role: "Staff Software Engineer, Edge Runtime", location: "San Francisco · Remote OK", salary: "$240k – $310k", appliedAt: daysAgo(0), jd: "https://vercel.com/careers/edge-runtime", resumeFile: "Resume - Vercel Staff.pdf", changes: "Surfaced V8 + WASM; swapped React-perf bullet for systems-perf bullet.", changesCount: 5, status: "submitted", matchScore: 89, confirmation: null },
  { id: "t3", company: COMPANIES[3], role: "Member of Technical Staff, Applied AI", location: "San Francisco · Hybrid", salary: "$310k – $410k + equity", appliedAt: daysAgo(0), jd: "https://anthropic.com/careers/mts-applied", resumeFile: "Resume - Anthropic MTS.pdf", changes: "Emphasized evaluation work; trimmed front-end-only bullets.", changesCount: 3, status: "pending", matchScore: 87, confirmation: null },
  { id: "t4", company: COMPANIES[5], role: "Founding Engineer, AI Agents", location: "New York · On-site", salary: "$220k – $280k + equity", appliedAt: daysAgo(0), jd: "https://ramp.com/careers/fe-agents", resumeFile: "Resume - Ramp Founding.pdf", changes: "Reframed 0→1 work first; cut maintenance bullet.", changesCount: 4, status: "tailoring", matchScore: 85, confirmation: null },
  { id: "t5", company: COMPANIES[2], role: "Product Engineer, Payments UX", location: "New York · Hybrid", salary: "$190k – $245k", appliedAt: daysAgo(0), jd: "https://stripe.com/jobs/listing/payments-ux", resumeFile: "Resume - Stripe PE.pdf", changes: "Surfaced A/B testing experience; added i18n bullet.", changesCount: 3, status: "submitting", matchScore: 81, confirmation: null },
  { id: "t6", company: COMPANIES[11], role: "Engineer, Container Runtime", location: "New York · On-site", salary: "$190k – $240k + equity", appliedAt: daysAgo(0), jd: "https://modal.com/careers/container-runtime", resumeFile: "Resume - Modal Runtime.pdf", changes: "Led with Linux internals; promoted Rust work.", changesCount: 2, status: "queued", matchScore: 83, confirmation: null },
  { id: "t7", company: COMPANIES[4], role: "Senior Engineer, Collaboration", location: "Remote (US/Canada)", salary: "$180k – $225k", appliedAt: daysAgo(1), jd: "https://notion.so/careers/se-collab", resumeFile: "Resume - Notion Collab.pdf", changes: "Surfaced CRDT-adjacent work; cut admin-tools bullet.", changesCount: 3, status: "submitted", matchScore: 78, confirmation: null },
  { id: "t8", company: COMPANIES[8], role: "Senior Software Engineer, FigJam", location: "San Francisco · Hybrid", salary: "$210k – $265k", appliedAt: daysAgo(1), jd: "https://figma.com/careers/sse-figjam", resumeFile: "Resume - Figma FigJam.pdf", changes: "Emphasized Canvas/WebGL adjacent experience.", changesCount: 2, status: "pending", matchScore: 76, confirmation: null },
  { id: "t9", company: COMPANIES[6], role: "Product Engineer, Treasury", location: "Remote (US)", salary: "$170k – $210k", appliedAt: daysAgo(1), jd: "https://mercury.com/jobs/pe-treasury", resumeFile: "Resume - Mercury Treasury.pdf", changes: "Added fintech compliance bullet; cut consumer bullet.", changesCount: 2, status: "confirmed", matchScore: 73, confirmation: "Yesterday" },
  { id: "t10", company: COMPANIES[10], role: "Senior Product Engineer, Trust Center", location: "Remote (US)", salary: "$175k – $220k", appliedAt: daysAgo(2), jd: "https://vanta.com/careers/spe-trust", resumeFile: "Resume - Vanta Trust.pdf", changes: "Surfaced SSO + data-export experience.", changesCount: 3, status: "submitted", matchScore: 71, confirmation: null },
  { id: "t11", company: COMPANIES[9], role: "Software Engineer, Workflows", location: "San Francisco · Hybrid", salary: "$165k – $210k", appliedAt: daysAgo(2), jd: "https://retool.com/careers/se-workflows", resumeFile: "Resume - Retool Workflows.pdf", changes: "Reframed queue-systems experience.", changesCount: 2, status: "failed", matchScore: 68, confirmation: null },
  { id: "t12", company: COMPANIES[7], role: "Product Engineer, Identity", location: "San Francisco · Hybrid", salary: "$185k – $235k", appliedAt: daysAgo(3), jd: "https://plaid.com/careers/pe-identity", resumeFile: "Resume - Plaid Identity.pdf", changes: "Cut backend-heavy bullet; added mobile SDK experience.", changesCount: 3, status: "needsHuman", matchScore: 64, confirmation: null },
  { id: "t13", company: COMPANIES[0], role: "Engineering Manager, Workflows", location: "Remote (US)", salary: "$240k – $290k", appliedAt: daysAgo(4), jd: "https://jobs.linear.app/em-workflows", resumeFile: "Resume - Linear EM.pdf", changes: "Emphasized mentorship; added EM-track signals.", changesCount: 4, status: "confirmed", matchScore: 88, confirmation: "4d ago" },
  { id: "t14", company: COMPANIES[1], role: "Senior Product Engineer, AI", location: "Remote (US)", salary: "$200k – $260k", appliedAt: daysAgo(5), jd: "https://vercel.com/careers/spe-ai", resumeFile: "Resume - Vercel AI.pdf", changes: "Surfaced streaming + RAG work.", changesCount: 3, status: "draft", matchScore: 79, confirmation: null },
];

export const TRACKER_ROWS: TrackerRow[] = TRACKER_BASE.map((r, i) => ({
  ...r,
  n: i + 1,
  appliedAtLabel: fmtApplied(r.appliedAt),
}));
