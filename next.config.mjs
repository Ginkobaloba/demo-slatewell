/** @type {import('next').NextConfig} */
const nextConfig = {
  // Single-container deploy: node .next/standalone/server.js
  output: "standalone",
  // Keep the native SQLite addon external so output tracing bundles it
  // correctly instead of trying to compile it into the server bundle.
  // Next 15 graduated this out of `experimental`.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
