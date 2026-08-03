export function getAllowedOrigins(): Set<string> {
  const configuredOrigins = [
    process.env.CORS_ORIGIN,
    process.env.APP_FRONTEND_URL,
    process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "",
  ];

  return new Set(
    configuredOrigins
      .filter(Boolean)
      .flatMap((origin) => String(origin).split(","))
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

export function resolveCorsOrigin(origin: string | undefined): boolean {
  // Allow server-to-server tools, Postman, curl, health checks
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.replace(/\/$/, "");

  return getAllowedOrigins().has(normalizedOrigin);
}
