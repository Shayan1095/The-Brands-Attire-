/** @type {import('next').NextConfig} */
const nextConfig = {
  // local production previews build into their own folder so they never collide with a running dev server
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@electric-sql/pglite", "pg", "sharp", "nodemailer"],
  experimental: {
    // product photos are pre-shrunk in the browser, then standardised by sharp on the server
    serverActions: { bodySizeLimit: "4mb" },
    // one 404 page for unknown addresses (the shop and admin have separate root layouts): app/global-not-found.js
    globalNotFound: true,
  },
};
export default nextConfig;
