import type { QueryPlan, AnalyzeQueryInput, IntentClassValue } from "../intentQuery.types.js";
import { detectLanguage } from "../intentQuery.languageDetector.js";
import { extractEntities, extractTemporalConstraints } from "../intentQuery.entityExtractor.js";
import { expandBilingual } from "../intentQuery.bilingualExpander.js";
import { detectSocialMessage } from "../intentQuery.socialDetector.js";
import { deriveQueryRoute } from "../intentQuery.route.js";
import { detectAssistantIntent } from "../intentQuery.assistantDetector.js";

export class FakeIntentQueryAdapter {
  private promptVersion = "1.0.0";
  private modelVersion = "fake-default-agent-v1";

  /**
   * Deterministically analyze input query to produce a schema-valid QueryPlan.
   * Useful for unit/integration testing and parallel work.
   */
  async analyze(input: Partial<AnalyzeQueryInput> & { question: string }): Promise<QueryPlan> {
    const { question, conversationId, referencedDocumentIds } = input;
    const lowerQuestion = question.toLowerCase().trim();
    
    // 1. Detect language & extract entities
    const language = detectLanguage(question);
    const entities = extractEntities(question, language);

    // 2. Expand terminology
    const { semanticQueries, keywordQueries } = expandBilingual(question, language, entities);

    // 3. Determine intent class based on patterns
    let detectedIntent: IntentClassValue = "knowledge_question";
    let intentConfidence = 0.9;
    let clarificationNeeded = false;
    let clarification = null;
    const isFollowUp = !!conversationId;
    const assistantIntent = detectAssistantIntent(question);

    const hasExplicitlyMaliciousIntent =
      /unsafe|hack|ignore\s+previous|system\s+prompt|تجاهل|التعليمات\s+السابقة/i.test(question) ||
      /(?:give|show|reveal)\s+me\s+another\s+user(?:'s|’s)?\s+password/i.test(question) ||
      /bypass\s+authentication/i.test(question) ||
      /(?:أعطني|اكشف|أظهر)\s+كلمة\s+مرور\s+مستخدم\s+آخر|تجاوز\s+المصادقة|موجه\s+النظام/i.test(question);

    if (hasExplicitlyMaliciousIntent) {
      detectedIntent = "unsafe";
      intentConfidence = 0.95;
      clarificationNeeded = true;
      clarification = {
        reason: "ambiguous_intent" as const,
        suggestedQuestions: ["How can I help you safely?"],
        messageEn: "This request violates safety policies and cannot be processed.",
        messageAr: "لا يمكن معالجة هذا الطلب لمخالفته لسياسات الأمان.",
      };
    } else if (assistantIntent.isAssistantOnly && assistantIntent.kind) {
      detectedIntent = assistantIntent.kind === "identity"
        ? "assistant_identity"
        : "assistant_capabilities";
      intentConfidence = 0.99;
    } else if (detectSocialMessage(question).isSocial) {
      detectedIntent = "social";
      intentConfidence = 0.95;
    } else if (lowerQuestion.includes("compare") || lowerQuestion.includes("مقارنة") || lowerQuestion.includes("قارن")) {
      detectedIntent = "comparison";
    } else if (lowerQuestion.includes("summarize") || lowerQuestion.includes("ملخص") || lowerQuestion.includes("لخص")) {
      detectedIntent = "summarization";
    } else if (
      (lowerQuestion.includes("where") || lowerQuestion.includes("أين")) &&
      !lowerQuestion.includes("policy") &&
      !lowerQuestion.includes("سياس") &&
      !lowerQuestion.includes("إجاز") &&
      !lowerQuestion.includes("leave")
    ) {
      detectedIntent = "navigation";
    } else if (lowerQuestion.includes("upload") || lowerQuestion.includes("delete") || lowerQuestion.includes("حذف")) {
      detectedIntent = "administrative_action";
    } else if (lowerQuestion.length < 10 || lowerQuestion.split(/\s+/).length < 3) {
      detectedIntent = "unsupported";
      intentConfidence = 0.2;
      clarificationNeeded = true;
      clarification = {
        reason: "ambiguous_intent" as const,
        suggestedQuestions: [
          language === "ar" ? "ما هي سياسة الإجازات؟" : "What is the vacation policy?",
          language === "ar" ? "ما هو دليل الموظف؟" : "What is the employee handbook?",
        ],
        messageEn: "Your query is too short or vague. Could you please clarify?",
        messageAr: "سؤالك قصير جداً أو غير واضح. هل يمكنك التوضيح?",
      };
    } else if (isFollowUp) {
      detectedIntent = "follow_up";
    } else if (
      (referencedDocumentIds && referencedDocumentIds.length > 0) ||
      lowerQuestion.includes("handbook") ||
      lowerQuestion.includes("دليل") ||
      lowerQuestion.includes("وثيقة") ||
      entities.some(e => e.type === "clause_number" || e.type === "document_title")
    ) {
      detectedIntent = "document_specific";
    }

    // Populate exactTerms from entities
    const exactTerms = entities.filter(e => e.preserveExact).map(e => e.text);

    // Build the query plan
    return {
      schemaVersion: "1.1.0",
      normalizedQuestion: question.trim(),
      originalQuestion: question,
      language,
      detectedIntent,
      intentConfidence,
      route: deriveQueryRoute(detectedIntent, clarificationNeeded),
      assistantKind: assistantIntent.isAssistantOnly ? assistantIntent.kind : null,
      socialSubtype:
        detectedIntent === "social"
          ? (detectSocialMessage(question).subtype ?? "acknowledgement")
          : "acknowledgement",
      entities,
      temporalConstraints: extractTemporalConstraints(question),
      referencedDocumentIds: referencedDocumentIds ?? [],
      referencedDocumentTitles: [],
      departments: [],
      categories: [],
      exactTerms,
      semanticQueries: ["social", "assistant_identity", "assistant_capabilities"].includes(detectedIntent) ? [] : semanticQueries,
      keywordQueries: ["social", "assistant_identity", "assistant_capabilities"].includes(detectedIntent) ? [] : keywordQueries,
      clarificationNeeded,
      clarification,
      isFollowUp,
      conversationContextUsed: isFollowUp,
      promptVersion: this.promptVersion,
      modelVersion: this.modelVersion,
      processingMetadata: {
        tokensUsed: question.length * 2,
        latencyMs: 15,
        estimatedCost: 0.0001,
        fallbackUsed: false,
      },
    };
  }
}
