const LOCAL_API_URL = "http://localhost:5000";

export class PublicEnvironmentValidationError extends Error {
  readonly keys: string[];
  constructor(keys: string[]) {
    const uniqueKeys = [...new Set(keys)].sort();
    super(`Invalid public environment configuration: ${uniqueKeys.join(", ")}`);
    this.name = "PublicEnvironmentValidationError";
    this.keys = uniqueKeys;
  }
}

export function resolvePublicApiUrl(nodeEnv: string | undefined, configuredUrl: string | undefined): string {
  const value = configuredUrl?.trim();
  if (!value) {
    if (nodeEnv === "production") throw new PublicEnvironmentValidationError(["NEXT_PUBLIC_API_URL"]);
    return LOCAL_API_URL;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicEnvironmentValidationError(["NEXT_PUBLIC_API_URL"]);
  }

  if (nodeEnv === "production" && ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname))
    throw new PublicEnvironmentValidationError(["NEXT_PUBLIC_API_URL"]);

  return value.replace(/\/+$/, "");
}
