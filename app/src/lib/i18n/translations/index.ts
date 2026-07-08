/**
 * Translation dictionary barrel.
 *
 * Import locale dictionaries and re-export them as a single record
 * keyed by `Locale` so consumers can look up the right dictionary
 * with `dictionaries[locale]`.
 */

import type { Locale, TranslationDictionary } from "../i18n.types";
import en from "./en";
import ar from "./ar";

const dictionaries: Record<Locale, TranslationDictionary> = { en, ar };

export default dictionaries;
