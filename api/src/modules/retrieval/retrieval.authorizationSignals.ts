import type { RetrievalAuthorizationDenialReason } from "../document-access/documentAccess.retrievalAuthorization.js";
import type { RetrievalDiagnostics } from "./retrieval.types.js";

/**
 * `zeroCandidateReason` values that mean "authorization removed the content",
 * as opposed to "the corpus genuinely has no such content".
 *
 * Declared as an exhaustive record over the authorization denial vocabulary so
 * that adding a new `RetrievalAuthorizationDenialReason` is a compile error
 * here instead of a silent downgrade to "genuine knowledge gap". `DENY_ALL` is
 * the fail-closed default applied when a denied corpus carries no more
 * specific reason; `NO_AUTHORIZED_CANDIDATES` is the normal-path reason when
 * raw matches existed but none survived actor authorization.
 *
 * `ACTOR_INVALID` and `RESOLVER_FAILED` are included deliberately: they are
 * fail-closed resolution failures, so the authorized corpus was never actually
 * searched and "the company does not know this" is an unsupported conclusion.
 */
const AUTHORIZATION_ZERO_CANDIDATE_REASONS: Readonly<
  Record<
    RetrievalAuthorizationDenialReason | "DENY_ALL" | "NO_AUTHORIZED_CANDIDATES",
    true
  >
> = Object.freeze({
  ACTOR_INVALID: true,
  PERMISSION_REQUIRED: true,
  RESOLVER_FAILED: true,
  NO_AUTHORIZED_DOCUMENTS: true,
  READABLE_NOT_AI_USABLE: true,
  TAXONOMY_SCOPE_UNRESOLVABLE: true,
  DENY_ALL: true,
  NO_AUTHORIZED_CANDIDATES: true,
});

/** Prototype-safe membership test over the exhaustive record above. */
const AUTHORIZATION_ZERO_CANDIDATE_REASON_SET: ReadonlySet<string> = new Set(
  Object.keys(AUTHORIZATION_ZERO_CANDIDATE_REASONS),
);

/**
 * The two safe internal authorization signals a retrieval run can carry.
 *
 * Neither signal ever names a document, chunk, title, count of restricted
 * records, or protected value — they only answer "did authorization shape this
 * result, and was it the reason nothing usable came back".
 */
export interface RetrievalAuthorizationSignals {
  /**
   * Authorization removed otherwise query-relevant candidates from this run.
   *
   * May be true even when the run still produced usable candidates from other
   * authorized documents (partial authorized corpus). Consumers must treat
   * this as "the searched corpus was narrower than the tenant corpus", never
   * as evidence about what the hidden documents contain.
   */
  readonly authorizationFiltered: boolean;
  /**
   * Authorization is the reason this run produced no usable candidates at all.
   *
   * Terminal signal: it distinguishes "you are not permitted to see this" from
   * "we do not have this". Only ever true when nothing usable survived, so a
   * successfully answered turn can never be labelled authorization-restricted.
   */
  readonly authorizationRestricted: boolean;
}

/**
 * Translates the retrieval service's authoritative diagnostics into the two
 * safe internal authorization signals.
 *
 * This is a pure classifier over reason codes the authorization layer already
 * produced — it performs no authorization of its own and must never be used to
 * grant or widen access. Downstream consumers (agent tools, chat workflow,
 * knowledge-gap detection) consume these signals rather than re-deriving them
 * from candidate counts, which is how a denied corpus previously collapsed
 * into an ordinary "no matches" knowledge gap.
 */
export function resolveRetrievalAuthorizationSignals(input: {
  readonly diagnostics: Readonly<Partial<RetrievalDiagnostics>> | undefined;
  /** Candidates that survived every server-side check and are usable. */
  readonly usableCandidateCount: number;
  /** Candidate count before actor authorization, when the service reported it. */
  readonly rawCandidateCount?: number | undefined;
  /** Candidate count after actor authorization, when the service reported it. */
  readonly postAuthorizationCandidateCount?: number | undefined;
}): RetrievalAuthorizationSignals {
  const { diagnostics } = input;
  const reason = diagnostics?.zeroCandidateReason;
  const candidatesDroppedByAuthorization =
    input.rawCandidateCount !== undefined &&
    input.postAuthorizationCandidateCount !== undefined &&
    input.rawCandidateCount > input.postAuthorizationCandidateCount;

  const authorizationFiltered =
    diagnostics?.authorizationRestricted === true ||
    diagnostics?.authorizationFiltered === true ||
    diagnostics?.retrievalOutcome === "NO_AUTHORIZED_DOCUMENTS" ||
    (reason !== undefined &&
      AUTHORIZATION_ZERO_CANDIDATE_REASON_SET.has(reason)) ||
    candidatesDroppedByAuthorization;

  return {
    authorizationFiltered,
    authorizationRestricted:
      authorizationFiltered && input.usableCandidateCount === 0,
  };
}
