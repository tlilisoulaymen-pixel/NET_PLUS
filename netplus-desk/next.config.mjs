/** @type {import('next').NextConfig} */
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const FRAPPE_URL = process.env.FRAPPE_URL || "http://localhost:8000";

const nextConfig = {
  // Standalone mode: bundles everything into .next/standalone/ — no node_modules needed at runtime
  output: 'standalone',

  // Skip TS type checking and ESLint at build time (types are checked in dev/CI)
  typescript: { ignoreBuildErrors: true },
  eslint:     { ignoreDuringBuilds: true },

  // Pin workspace root to this directory — prevents Next.js from walking up
  // to C:\Users\tlili and picking up stray lockfiles (fixes EINVAL on Windows/OneDrive).
  outputFileTracingRoot: __dirname,

  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${FRAPPE_URL}/api/:path*` },
      { source: "/assets/:path*", destination: `${FRAPPE_URL}/assets/:path*` },
      { source: "/files/:path*", destination: `${FRAPPE_URL}/files/:path*` },
      // Proxy Frappe PWA routes
      { source: "/netplus-client", destination: `${FRAPPE_URL}/netplus-client` },
      { source: "/netplus-pwa", destination: `${FRAPPE_URL}/netplus-pwa` },
      { source: "/netplus-supervision", destination: `${FRAPPE_URL}/netplus-supervision` },
    ];
  },
};

export default withNextIntl(nextConfig);
