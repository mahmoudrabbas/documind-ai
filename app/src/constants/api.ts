import { resolvePublicApiUrl } from "@/config/public-env";

export const API_BASE_URL = resolvePublicApiUrl(
  process.env.NODE_ENV,
  process.env.NEXT_PUBLIC_API_URL,
);
