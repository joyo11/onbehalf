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
};

export default nextConfig;
