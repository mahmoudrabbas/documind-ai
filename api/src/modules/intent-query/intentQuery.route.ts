import type { IntentClassValue, QueryRouteValue } from "./intentQuery.types.js";

/**
 * Determines which processing route a detected intent should follow.
 *
 * social / unsafe / clarification take priority over the generic intents
 * because they represent hard behavior boundaries (no retrieval).
 */
export function deriveQueryRoute(intent: IntentClassValue | unknown, clarificationNeeded: boolean): QueryRouteValue {
  switch (intent) {
    case "social":
      return "social";
    case "unsafe":
      return "unsafe";
    case "unsupported":
      return "unsupported";
    case "knowledge_question":
    case "follow_up":
    case "document_specific":
    case "comparison":
    case "summarization":
    case "navigation":
    case "administrative_action":
      return clarificationNeeded ? "clarification" : "rag";
    default:
      // Unknown/unversioned classifier output is never positive evidence that
      // document retrieval is appropriate.
      return "unsupported";
  }
}
