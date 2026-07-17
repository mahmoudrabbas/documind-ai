const path = require("path");
const { resolvePublicApiUrl } = require("./src/config/public-env");

resolvePublicApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL);

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
};

module.exports = nextConfig;
