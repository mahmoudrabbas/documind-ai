/**
 * Newcomer "platform tour" offer logic.
 *
 * A user is considered a newcomer when their account is younger than
 * TOUR_OFFER_WINDOW_DAYS. The offer appears inside the copilot panel until the
 * user starts, dismisses, or completes the tour (tracked in localStorage per
 * user id so the card never nags twice).
 */

export const TOUR_OFFER_WINDOW_DAYS = 30;

export const TOUR_FLOW_ID = "platform.tour";

function storageKey(userId: string, flag: "started" | "dismissed" | "completed"): string {
  return `documind.tour.${userId}.${flag}`;
}

export function isNewcomer(createdAt: string, now: number = Date.now()): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  const ageMs = now - created;
  return ageMs >= 0 && ageMs < TOUR_OFFER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export function shouldShowTourOffer(
  userId: string,
  createdAt: string,
  now: number = Date.now(),
): boolean {
  if (!isNewcomer(createdAt, now)) return false;
  if (typeof window === "undefined") return false;
  return ["started", "dismissed", "completed"].every(
    (flag) => window.localStorage.getItem(storageKey(userId, flag as "started")) === null,
  );
}

export function markTourStarted(userId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId, "started"), "1");
}

export function dismissTourOffer(userId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId, "dismissed"), "1");
}

export function markTourCompleted(userId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId, "completed"), "1");
}
