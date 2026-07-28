export function formatMoneyMinor(
  amountMinor: number,
  currency = "USD",
  locale = "en-US",
): string {
  if (!Number.isInteger(amountMinor)) {
    throw new TypeError("Money amounts must be integer minor units");
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}
