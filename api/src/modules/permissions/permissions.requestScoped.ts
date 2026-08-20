import { decidePermission } from "./permissions.decision.js";
import type {
  PermissionActor,
  PermissionDecision,
  PermissionEvaluationInput,
  PermissionEvaluator,
  ResolvedPermissions,
} from "./permissions.types.js";

/**
 * Request-scoped `resolve()` memoization for bulk-evaluation call sites.
 *
 * WHY THIS IS NOT A CACHE. `PermissionEvaluatorImpl.resolve` is deliberately
 * uncached so an authorization change is visible immediately on every API
 * instance (permissions.evaluator.ts). That property is fully preserved: an
 * instance of this class has no TTL and no eviction because it has no lifetime
 * — the caller constructs one, uses it for a single computation, and drops it.
 * Nothing it memoized can ever be observed by a later request.
 *
 * WHY IT IS SOUND. `resolve(actor)` reads only persisted ACTOR state: the user
 * row, the platform tenant (SUPER_ADMIN), the assigned custom role and its
 * provenance, and the actor's department assignment. It is independent of the
 * permission, the resource and the action being checked. So a call site that
 * asks "may this actor do each of N actions?" gets N identical results from N
 * identical round-trips. Collapsing them changes no decision.
 *
 * It also makes bulk evaluation more internally CONSISTENT, not less: a loop
 * that re-reads roles for thousands of checks spread over several seconds can
 * measure the first users against pre-change state and the last against
 * post-change state. One resolution per actor per computation gives every
 * actor a single coherent snapshot.
 *
 * WHAT IT DOES NOT DO. It never widens a decision, never skips a check, and
 * never substitutes its own authorization logic: `evaluate` applies the same
 * pure `decidePermission` to the same resolved grants that both the production
 * and the fake evaluator apply (permissions.evaluator.ts / .fake.ts), and
 * per-request scope is enforced structurally by instance lifetime rather than
 * by a policy someone has to remember.
 */
export class RequestScopedPermissionEvaluator implements PermissionEvaluator {
  /**
   * Promises, not values: concurrent checks for one actor share the single
   * in-flight round-trip instead of racing to issue duplicates.
   */
  private readonly resolutions = new Map<string, Promise<ResolvedPermissions>>();

  constructor(private readonly delegate: PermissionEvaluator) {}

  resolve(actor: PermissionActor): Promise<ResolvedPermissions> {
    const key = actorKey(actor);
    let resolution = this.resolutions.get(key);
    if (!resolution) {
      resolution = this.delegate.resolve(actor);
      this.resolutions.set(key, resolution);
    }
    return resolution;
  }

  async evaluate(input: PermissionEvaluationInput): Promise<PermissionDecision> {
    return decidePermission(input, await this.resolve(input));
  }

  evict(actorId: string, tenantId: string): void {
    this.resolutions.clear();
    this.delegate.evict(actorId, tenantId);
  }

  evictAllForTenant(tenantId: string): void {
    this.resolutions.clear();
    this.delegate.evictAllForTenant(tenantId);
  }
}

/**
 * Keys on every field of `PermissionActor`, so two different actors can never
 * collide even though `resolve` reads `customRoleId` from the persisted user row
 * rather than from the actor. JSON encoding keeps the parts unambiguous without
 * assuming which characters an id or role name may contain.
 */
function actorKey(actor: PermissionActor): string {
  return JSON.stringify([
    actor.tenantId,
    actor.actorId,
    actor.baseRole,
    actor.customRoleId ?? null,
  ]);
}
