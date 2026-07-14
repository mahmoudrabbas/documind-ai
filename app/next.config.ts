import path from "path";
import type { NextConfig } from "next";
import { resolvePublicApiUrl } from "./src/config/public-env";

resolvePublicApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL);

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
