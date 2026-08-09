/**
 * Translation dictionary barrel.
 *
 * Each locale's dictionary is assembled from `<locale>.ts` (the original
 * shared set) plus one module per feature area. The split keeps separate
 * areas from contending over a single large file; the flat, dot-namespaced
 * key shape is unchanged, so `t()` and consumers are unaffected.
 *
 * A key defined in more than one module resolves to the last spread —
 * the duplicate-key test in `__tests__/i18n.test.ts` guards against
 * that happening by accident.
 */

import type { Locale, TranslationDictionary } from "../i18n.types";

import en from "./en";
import enShell from "./en.shell";
import enDocuments from "./en.documents";
import enDashboard from "./en.dashboard";
import enSuperAdmin from "./en.superAdmin";
import enAccount from "./en.account";

import ar from "./ar";
import arShell from "./ar.shell";
import arDocuments from "./ar.documents";
import arDashboard from "./ar.dashboard";
import arSuperAdmin from "./ar.superAdmin";
import arAccount from "./ar.account";

/** Per-locale module lists, exported so tests can check them individually. */
export const localeModules: Record<Locale, readonly TranslationDictionary[]> = {
  en: [en, enShell, enDocuments, enDashboard, enSuperAdmin, enAccount],
  ar: [ar, arShell, arDocuments, arDashboard, arSuperAdmin, arAccount],
};

const dictionaries: Record<Locale, TranslationDictionary> = {
  en: Object.assign({}, ...localeModules.en) as TranslationDictionary,
  ar: Object.assign({}, ...localeModules.ar) as TranslationDictionary,
};

export default dictionaries;
