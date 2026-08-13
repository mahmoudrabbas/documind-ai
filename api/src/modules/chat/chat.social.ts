import type { SocialSubtypeValue } from "../intent-query/intentQuery.types.js";

const SOCIAL_REPLIES: Record<
  "ar" | "en",
  Record<SocialSubtypeValue, string>
> = {
  ar: {
    greeting: "مرحباً! كيف يمكنني مساعدتك اليوم؟",
    thanks: "على الرحب والسعة! يسعدني مساعدتك.",
    farewell: "مع السلامة! أتمنى لك يوماً سعيداً.",
    acknowledgement: "تمام، أنا جاهز لمساعدتك.",
    wellbeing: "أنا بخير، شكراً لسؤالك! كيف يمكنني مساعدتك؟",
  },
  en: {
    greeting: "Hello! How can I help you today?",
    thanks: "You're welcome! Happy to help.",
    farewell: "Goodbye! Have a great day.",
    acknowledgement: "Got it — I'm here to help.",
    wellbeing: "I'm doing well, thanks for asking! How can I help you?",
  },
};

export function socialReplyFor(
  language: "ar" | "en" | "mixed",
  subtype: SocialSubtypeValue,
): string {
  return (
    SOCIAL_REPLIES[language === "ar" ? "ar" : "en"][subtype] ??
    (language === "ar"
      ? "مرحباً! كيف يمكنني مساعدتك اليوم؟"
      : "Hello! How can I help you today?")
  );
}
