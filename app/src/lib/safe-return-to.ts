const GUEST_ROUTES = new Set([
  "/forgot-password",
  "/login",
  "/register",
  "/resend-verification",
  "/reset-password",
  "/token-state",
]);

export function getSafeReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  try {
    const url = new URL(value, "http://internal.local");
    if (url.origin !== "http://internal.local" || GUEST_ROUTES.has(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
