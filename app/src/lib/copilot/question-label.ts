/**
 * Draft questions arrive with both a dictionary key and a server-rendered
 * label. The key is authoritative when the app has a translation for it (so the
 * text follows the user's locale); the label is the verbatim fallback for keys
 * the dictionary does not carry yet. Both the question card and the Q&A
 * transcript resolve them the same way, so the rule lives here.
 */
export function resolveQuestionLabel(
  labelKey: string,
  fallback: string,
  t: (key: string) => string,
): string {
  const localized = t(labelKey);
  return localized !== labelKey && localized.trim().length > 0
    ? localized
    : fallback;
}
