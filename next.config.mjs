/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg", "sharp", "nodemailer"],
  experimental: {
    // product photos are pre-shrunk in the browser, then standardised by sharp on the server
    serverActions: { bodySizeLimit: "4mb" },
  },
};
export default nextConfig;
