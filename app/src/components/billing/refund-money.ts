/** Converts a localized decimal major-unit string to integer minor units. */
export function parseRefundAmountMinor(value: string, locale: string): number | null {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const easternDigits = "۰۱۲۳۴۵۶۷۸۹";
  const normalizedDigits = [...value.trim()].map((character) => {
    const arabic = arabicDigits.indexOf(character);
    if (arabic >= 0) return String(arabic);
    const eastern = easternDigits.indexOf(character);
    return eastern >= 0 ? String(eastern) : character;
  }).join("");
  const decimal = locale === "ar" ? normalizedDigits.replace(/[٫,]/g, ".") : normalizedDigits.replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(decimal)) return null;
  const [whole, fraction = ""] = decimal.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
