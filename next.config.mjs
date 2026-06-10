/** @type {import('next').NextConfig} */
const nextConfig = {
  // Single-container deploy: node .next/standalone/server.js
  output: "standalone",
  experimental: {
    // Keep the native SQLite addon external so output tracing bundles it
    // correctly instead of trying to compile it into the server bundle.
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
