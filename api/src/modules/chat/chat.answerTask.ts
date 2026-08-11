import type { AnswerTask } from "../agents/answerWriter.service.js";
import type { QueryPlan } from "../intent-query/intentQuery.types.js";

const SUMMARY_TASK_PATTERNS: readonly string[] = [
  "لخص",
  "ملخص",
  "أعطني ملخصاً",
  "أعطني ملخصا",
  "اعطني ملخصاً",
  "اعطني ملخصا",
  "أهم النقاط",
  "اهم النقاط",
  "النقاط الرئيسية",
  "النقاط الرئيسيه",
  "خلاصة",
  "بالتفصيل",
  "summarize",
  "summarise",
  "summary",
  "key points",
  "main points",
  "detailed summary",
  "in detail",
  "recap",
  "overview",
];

export function detectAnswerTask(
  plan: Pick<QueryPlan, "detectedIntent"> | null | undefined,
  message: string,
): AnswerTask {
  if (plan?.detectedIntent === "summarization") return "document_summary";
  const text = message.trim().toLowerCase();
  return SUMMARY_TASK_PATTERNS.some((pattern) =>
    text.includes(pattern.toLowerCase()),
  )
    ? "document_summary"
    : "direct_question";
}
