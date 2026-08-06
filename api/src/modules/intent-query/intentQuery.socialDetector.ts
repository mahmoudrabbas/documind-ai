import type { SocialSubtypeValue } from "./intentQuery.types.js";
import { containsArabic, containsLatin, normalizeArabic } from "./intentQuery.languageDetector.js";

export interface SocialDetection {
  isSocial: boolean;
  /** Present (and a valid SocialSubtype) when isSocial is true. */
  subtype: SocialSubtypeValue | null;
  reasonCode: "SOCIAL_FAST_PATH" | null;
}

// Whole-message phrases (after normalization) that are purely social, grouped
// by subtype. Normalization: lowercase, Arabic normalized (kashida/harakat
// removed, alif/teh-marbuta/ya normalized), punctuation and symbols stripped
// (so trailing "?"/"؟" are irrelevant), whitespace collapsed.
const AR_PHRASES: Record<SocialSubtypeValue, readonly string[]> = {
  greeting: [
    "السلام عليكم", "عليكم السلام", "وعليكم السلام",
    "السلام عليكم ورحمه الله", "السلام عليكم ورحمه الله وبركاته", "وعليكم السلام ورحمه الله وبركاته",
    "صباح الخير", "صباح النور", "صباح الفل", "صباح الورد",
    "مساء الخير", "مساء النور",
    "اهلا", "اهلا وسهلا", "اهلا بك", "اهلا بكم", "اهلا و سهلا", "اهلا وسهلا بكم",
    "مرحبا", "مرحبا بك", "مرحبا بكم", "اهلين", "اهلين وسهلين", "هلا", "هلا وغلا", "هلا وغلا بيك",
    "عيد سعيد", "رمضان كريم",
  ],
  thanks: [
    "شكرا", "شكرا جزيلا", "شكرا لك", "شكرا لكم", "شكرا لكما", "شكرا لكي",
    "شكرا جزيلا لك", "شكرا جزيلا لكم", "شكرا كثيرا", "شكرا جدا", "شكرا جزيلا جدا",
    "الف شكرا", "الف شكر", "شكرا من القلب",
    "تسلم", "تسلم يدك", "تسلم ايدك", "تسلملي", "تسلمين", "تسلمون",
    "مشكور", "مشكوره", "مشكورين",
    "يعطيك العافيه", "يعطيكم العافيه", "الله يعطيك العافيه", "الله يعطيكم العافيه",
    "جزاك الله خيرا", "جزاك الله خير", "جزاكم الله خيرا", "جزاكم الله خير", "جزاك الله كل خير",
    "بارك الله فيك", "بارك الله فيكم", "الله يبارك فيك", "الله يبارك فيكم", "بارك الله فيك يا غالي",
    "دعواتك", "دعواتكم",
    "شكرا يا باشا", "شكرا يا أستاذ", "شكرا يا أستاذة", "شكرا يا ريس", "شكرا يا معلم",
    "تسلم يا باشا", "تسلم يا أستاذ", "تسلم يا غالي", "تسلم يا صاحبي",
  ],
  farewell: [
    "مع السلامه", "في امان الله", "تصبح على خير", "تصبحون على خير", "تصبحين على خير",
    "ليله سعيده", "ليله هانئه", "طاب يومك", "طاب يومكم",
    "تحياتي", "تحياتي لك", "مع تحياتي",
    "بالتوفيق", "حظ موفق",
    "مع السلامة يا باشا", "مع السلامة يا صديقي", "مع السلامة يا غالي",
  ],
acknowledgement: [
    "الحمد لله", "الحمدلله", "الحمد لله رب العالمين",
    "مبروك", "الف مبروك", "الف الف مبروك",
    "عيد مبارك", "كل عام وانت بخير", "كل عام وانتم بخير", "كل عام وانت بالف خير",
    "تقبل الله", "تقبل الله طاعتك", "تقبل الله منا ومنكم",
    "الله يوفقك", "الله يسعدك", "الله يحفظك", "الله يعينك", "الله يرحمه",
    "ان شاء الله", "انشاء الله", "باذن الله", "ما شاء الله",
    "كل عام وانت الى الله اقرب",
    "اوكي", "تمام", "تمام شكرا", "شكرا تمام", "تمام تمام",
    "تمام يا باشا", "تمام يا ريس", "تمام يا معلم", "تمام يا أستاذ",
    "ماشي يا باشا", "ماشي يا معلم", "ماشي يا ريس",
    "got it sir", "got it boss", "got it mate", "right sir", "right boss",
  ],
  wellbeing: [
    "كيف حالك", "كيف الحال", "كيفك", "كيفك انت", "كيف حالكم", "كيفكم", "كيف حالكم جميعا",
    "انا بخير", "بخير", "بخير الحمد لله",
    "اخبارك", "هل انت بخير", "هل انتي بخير", "انت بخير", "انتي بخير",
    "أخبارك يا باشا", "أخبارك يا صاحبي", "أخبارك يا غالي",
    "كيفك يا باشا", "كيفك يا ريس", "كيفك يا معلم",
  ],
};

const EN_PHRASES: Record<SocialSubtypeValue, readonly string[]> = {
  greeting: [
    "hi", "hello", "hey", "hey there", "hii", "heyy", "helloo", "hi there", "hello there", "hello hello",
    "salam", "salaam", "salam alaikum", "salam aleikum", "assalamu alaikum", "assalamu alaykum",
    "wa alaikum assalam", "wa alaikum salam", "waalaikum assalam", "waalaikum salam",
    "good morning", "good afternoon", "good evening", "morning", "evening",
    "welcome",
  ],
  thanks: [
    "thanks", "thank you", "thanks a lot", "thank you so much", "thanks so much", "thanks alot",
    "thankyou", "thank u", "thank you very much", "many thanks", "thanks a million", "thx", "ty", "tnx",
    "youre welcome", "you re welcome", "no problem", "no worries", "my pleasure", "anytime",
    "thanks sir", "thank you sir", "thanks boss", "thank you boss", "thanks mate", "thank you mate",
  ],
  farewell: [
    "bye", "goodbye", "bye bye", "see you", "see ya", "see you later", "see you soon", "take care",
    "have a nice day", "have a good day", "have a great day",
    "good night", "night",
    "god bless you", "god bless",
  ],
  acknowledgement: [
    "ok", "okay", "okk", "okkk", "kk", "sure", "of course", "alright", "awesome", "great", "perfect",
    "nice", "got it", "understood", "roger that", "makes sense", "sounds good", "sounds great",
    "congrats", "congratulations", "well done", "great work", "good job", "nice work",
    "got it sir", "got it boss", "got it mate", "right sir", "right boss",
  ],
  wellbeing: [
    "how are you", "how are you doing", "how are u", "how s it going", "hows it going", "how is it going",
    "how do you do", "whats up", "what s up", "how have you been", "how r u", "how r you",
    "are you ok", "are you okay", "are u ok", "r u ok", "you ok", "you alright",
  ],
};

// Arabic tokens that are purely social on their own — a message composed
// entirely of these (plus fillers below) is treated as social. Each token
// maps to the subtype it expresses; the majority subtype wins.
const AR_CORE_SUBTYPES: Record<string, SocialSubtypeValue> = {
  // thanks
  "شكرا": "thanks", "تسلم": "thanks", "تسلمي": "thanks", "مشكور": "thanks", "مشكوره": "thanks", "مشكورين": "thanks",
  "يعطيك": "thanks", "يعطيكم": "thanks", "العافيه": "thanks", "بارك": "thanks", "الله": "thanks", "فيك": "thanks",
  "فيكم": "thanks", "فيكي": "thanks", "جزاك": "thanks", "جزاكم": "thanks", "خيرا": "thanks", "خير": "thanks",
  "دعواتك": "thanks", "دعواتكم": "thanks",
  // greeting
  "السلام": "greeting", "عليكم": "greeting", "سلام": "greeting", "صباح": "greeting", "الخير": "greeting",
  "مساء": "greeting", "النور": "greeting", "اهلا": "greeting", "اهلين": "greeting", "مرحبا": "greeting",
  "هلا": "greeting", "وسهلا": "greeting", "سهلا": "greeting", "سهلين": "greeting", "بكم": "greeting", "بك": "greeting",
  // wellbeing
  "حالك": "wellbeing", "الحال": "wellbeing", "كيفك": "wellbeing", "حالكم": "wellbeing", "كيفكم": "wellbeing",
  "بخير": "wellbeing", "اخبارك": "wellbeing",
  // acknowledgement
  "الحمد": "acknowledgement", "مع": "acknowledgement", "السلامه": "acknowledgement", "تمام": "acknowledgement",
  "اوكي": "acknowledgement", "انشالله": "acknowledgement", "انشاء": "acknowledgement", "باذن": "acknowledgement",
  "شاء": "acknowledgement", "ماشاء": "acknowledgement", "تقبل": "acknowledgement", "يوفقك": "acknowledgement",
  "يسعدك": "acknowledgement", "يحفظك": "acknowledgement", "يعينك": "acknowledgement", "مبروك": "acknowledgement",
  "الف": "acknowledgement", "عبد": "acknowledgement", "عيد": "acknowledgement", "مبارك": "acknowledgement",
  "كل": "acknowledgement", "عام": "acknowledgement", "وانت": "acknowledgement", "وانتم": "acknowledgement",
  "طاب": "acknowledgement", "يومك": "acknowledgement", "يومكم": "acknowledgement", "بالتوفيق": "acknowledgement",
  "توفيق": "acknowledgement", "حظ": "acknowledgement", "موفق": "acknowledgement",
  // farewell
  "تصبح": "farewell", "تصبحون": "farewell", "تصبحين": "farewell", "ليله": "farewell", "سعيده": "farewell",
  "هانئه": "farewell", "تحياتي": "farewell",
};

const AR_FILLERS = new Set([
  "يا", "لك", "لكي", "لكم", "لكما", "لنا", "جدا", "كتير", "كثيرا", "جزيلا", "ايضا", "فقط", "الي", "و",
  "باشا", "فندم", "أستاذ", "أستاذة", "ريس", "معلم", "صاحبي", "صديقي", "غالي", "كابتن",
]);

// phrase -> subtype lookup built once from the grouped maps.
const PHRASE_SUBTYPES = new Map<string, SocialSubtypeValue>();
for (const [subtype, phrases] of [...Object.entries(AR_PHRASES), ...Object.entries(EN_PHRASES)]) {
  for (const phrase of phrases) {
    PHRASE_SUBTYPES.set(phrase, subtype as SocialSubtypeValue);
  }
}

/**
 * Normalizes a raw message for social matching:
 * lowercases, strips punctuation/symbols/emojis, collapses whitespace and
 * applies Arabic normalization.
 */
function normalizeForSocial(raw: string): string {
  let text = raw.toLowerCase();
  // Strip apostrophes/quotes before punctuation removal so English
  // contractions normalize to their canonical social-phrase form
  // ("you're welcome" -> "youre welcome", "what's up" -> "whats up").
  text = text.replace(/['\u2018\u2019\u201A\u201B]/gu, "");
  text = normalizeArabic(text);
  text = text.replace(/[\p{P}\p{S}]/gu, " ");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Deterministic, conservative social-intent detection.
 *
 * A message is social ONLY when the entire normalized message matches a known
 * social phrase, or is composed exclusively of social tokens. Substantive
 * requests (question words, document terms) are never classified as social —
 * those are left to the LLM router.
 *
 * Punctuation alone never decides the route: the trailing "?"/"؟" of a known
 * social message ("كيف حالك؟", "Are you okay?") is stripped during
 * normalization, so known whole-message social phrases stay social. A message
 * that is ONLY punctuation/question marks, or an unknown message containing a
 * question mark, is still not social.
 */
export function detectSocialMessage(raw: string): SocialDetection {
  const notSocial: SocialDetection = { isSocial: false, subtype: null, reasonCode: null };
  if (!raw || raw.trim().length === 0) return notSocial;

  // No letters at all: emoji/symbol reactions ("👍", "❤️", "🙏") are social
  // (acknowledgement); pure punctuation or whitespace ("...", "---", "؟") is not.
  if (!containsArabic(raw) && !containsLatin(raw)) {
    if (/[\p{S}]/u.test(raw)) {
      return { isSocial: true, subtype: "acknowledgement", reasonCode: "SOCIAL_FAST_PATH" };
    }
    return notSocial;
  }

  const normalized = normalizeForSocial(raw);
  if (!normalized) return notSocial;

  const phraseSubtype = PHRASE_SUBTYPES.get(normalized);
  if (phraseSubtype) {
    return { isSocial: true, subtype: phraseSubtype, reasonCode: "SOCIAL_FAST_PATH" };
  }

  // Combination rule (Arabic only): every token must be a social/filler token.
  // The majority token subtype becomes the message subtype; ties resolve to
  // the neutral "acknowledgement".
  if (containsArabic(normalized)) {
    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 6) return notSocial;
    const counts = new Map<SocialSubtypeValue, number>();
    let hasCore = false;
    for (const token of tokens) {
      const subtype = AR_CORE_SUBTYPES[token];
      if (subtype) {
        hasCore = true;
        counts.set(subtype, (counts.get(subtype) ?? 0) + 1);
      } else if (!AR_FILLERS.has(token)) {
        return notSocial;
      }
    }
    if (hasCore) {
      let majority: SocialSubtypeValue = "acknowledgement";
      let maxCount = 0;
      for (const [subtype, count] of counts) {
        if (count > maxCount) {
          majority = subtype;
          maxCount = count;
        }
      }
      return { isSocial: true, subtype: majority, reasonCode: "SOCIAL_FAST_PATH" };
    }
  }

  return notSocial;
}
