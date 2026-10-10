import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a verification build run beside a live dev server without
  // overwriting its output: NEXT_DIST_DIR=.next-verify pnpm build
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
