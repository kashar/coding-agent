/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship as built ESM in dist/, so no transpilePackages needed.
  // node:sqlite and other Node built-ins are only used in server route handlers.
  serverExternalPackages: ["@helmsman/data"],
};

export default nextConfig;
