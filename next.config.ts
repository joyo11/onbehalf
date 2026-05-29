import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // playwright-core needs its on-disk browsers.json + native binaries at
  // runtime; Turbopack's bundler strips non-JS files and breaks the runtime
  // require. Mark it as an external server package so Next/Vercel ship the
  // raw node_modules/playwright-core instead of bundling it.
  serverExternalPackages: ["playwright-core", "@browserbasehq/sdk"],
  // Even with serverExternalPackages, the Vercel function tracer only copies
  // .js files from node_modules by default. browsers.json (and a few other
  // non-JS resources) get omitted. Force-include the whole playwright-core
  // directory for any route that touches the submission stack.
  outputFileTracingIncludes: {
    "/api/process-queue": ["./node_modules/playwright-core/**/*"],
    "/api/submit": ["./node_modules/playwright-core/**/*"],
    "/api/batch-submit": ["./node_modules/playwright-core/**/*"],
    "/api/applications": ["./node_modules/playwright-core/**/*"],
  },
};

export default nextConfig;
