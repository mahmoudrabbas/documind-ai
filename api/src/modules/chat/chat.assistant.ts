import type {
  AssistantIntentKindValue,
  QueryLanguageValue,
} from "../intent-query/intentQuery.types.js";

const ASSISTANT_REPLIES: Record<"ar" | "en", Record<AssistantIntentKindValue, string>> = {
  ar: {
    identity:
      "أنا DocuMind AI، مساعد خاص لمعرفة الشركة. أساعدك في طرح أسئلة عن مستندات الشركة المصرح لك بها، وأقدّم إجابات مستندة إلى محتواها مع المصادر عندما تتوفر أدلة كافية.",
    capabilities:
      "بصفتي DocuMind AI، أقدر أجيب بالعربية أو الإنجليزية عن أسئلتك من مستندات الشركة المصرح لك بها، مع مراعاة صلاحيات الوصول وسياق المحادثة وتقديم المصادر للإجابات المدعومة. وإذا لم تتوفر أدلة كافية، أوضّح أن المعلومات غير كافية بدلاً من تقديم ادعاء غير موثوق.",
  },
  en: {
    identity:
      "I'm DocuMind AI, a private company knowledge assistant. I help you ask questions about company documents you're authorized to access and provide grounded answers with sources when sufficient evidence is available.",
    capabilities:
      "As DocuMind AI, I can answer questions in Arabic or English from company documents you're authorized to access, using conversation context where relevant and providing sources for grounded answers. If the available evidence is insufficient, I'll say so instead of making an unsupported claim.",
  },
};

export function assistantReplyFor(
  language: QueryLanguageValue,
  kind: AssistantIntentKindValue,
): string {
  return ASSISTANT_REPLIES[language === "en" ? "en" : "ar"][kind];
}
