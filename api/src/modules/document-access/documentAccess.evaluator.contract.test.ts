import { InMemoryDocumentCapabilityEvaluator } from "./documentAccess.capability.js";
import { InMemoryDocumentAccessPolicyEvaluator } from "./documentAccess.evaluator.inMemory.js";
import { runDocumentAccessEvaluatorContract } from "./documentAccess.evaluator.contract.js";

runDocumentAccessEvaluatorContract("InMemoryDocumentAccessPolicyEvaluator", () => {
  const capabilities = new InMemoryDocumentCapabilityEvaluator();
  return {
    capabilities,
    evaluator: new InMemoryDocumentAccessPolicyEvaluator(capabilities),
  };
});
