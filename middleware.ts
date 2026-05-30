import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes: landing + auth pages + internal API routes that have their
// own Bearer-token auth. The server-to-server fetches from after() in
// /api/applications and /api/batch-submit carry no Clerk cookie — without
// this allowlist, clerkMiddleware's auth.protect() returns 404 before
// process-queue's own auth check ever runs, which is why the queue has
// never actually advanced in any test run.
const isPublic = createRouteMatcher([
  "/",
  "/about",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/process-queue",
  "/api/scrape-jobs",
  "/api/check-gmail",
  "/api/complete-with-code",
  "/api/diag-load",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
