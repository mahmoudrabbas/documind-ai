import type {
  DocumentAccessDecision,
  DocumentAccessEvaluationInput,
} from "./documentAccess.types.js";

export interface DocumentAccessPolicyEvaluator {
  evaluate(input: DocumentAccessEvaluationInput): Promise<DocumentAccessDecision>;
}
