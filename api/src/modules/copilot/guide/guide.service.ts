import { v4 as uuidv4 } from "uuid";
import {
  getPermissionEvaluator,
} from "../../permissions/permissions.evaluator.js";
import { decidePermission } from "../../permissions/permissions.decision.js";
import type {
  ResolvedPermissions,
  PermissionActor,
} from "../../permissions/permissions.types.js";
import { getDirection } from "../../../lib/i18n/index.js";
import { createGuideTargetRegistry } from "./guideTargets.js";
import { createGuideFlowRegistry, getGuideFlow } from "./guideFlows.js";
import type { GuideSection } from "./guideSections.js";
import { localizeGuideKey } from "./guide.i18n.js";
import type { GuideSession, GuideStep, GuideFlow } from "./guide.contracts.js";
import type { BaseRole } from "../../../common/auth/baseRoles.js";

interface GuideExpansionContext {
  tenantId: string;
  actorId: string;
  actorRole: BaseRole;
  locale: "en" | "ar";
}

function actorFor(context: GuideExpansionContext): PermissionActor {
  return {
    tenantId: context.tenantId,
    actorId: context.actorId,
    baseRole: context.actorRole,
  };
}

/**
 * Resolve the actor's full permission set exactly once per guide expansion.
 * Every permission check then runs synchronously against the resolved grants
 * (previously each `evaluator.evaluate` re-ran the whole resolution graph,
 * which is what made `/copilot/guide/resolve` ~5.8s).
 */
async function resolveActorPermissions(
  context: GuideExpansionContext,
): Promise<ResolvedPermissions> {
  return getPermissionEvaluator().resolve(actorFor(context));
}

function allowsPermission(
  resolved: ResolvedPermissions,
  context: GuideExpansionContext,
  permission: string,
): boolean {
  return decidePermission(
    {
      tenantId: context.tenantId,
      actorId: context.actorId,
      baseRole: context.actorRole,
      permission,
    },
    resolved,
  ).allowed;
}

function hasAllPermissions(
  resolved: ResolvedPermissions,
  context: GuideExpansionContext,
  requiredPermissions: readonly string[],
): boolean {
  return requiredPermissions.every((permission) =>
    allowsPermission(resolved, context, permission),
  );
}

function filterStepsByPermissions(
  steps: GuideFlow["steps"],
  context: GuideExpansionContext,
  resolved: ResolvedPermissions,
): GuideFlow["steps"] {
  const registry = createGuideTargetRegistry();
  return steps.filter((step) => {
    const target = registry.get(step.target.targetId);
    const requiredPermissions = target?.requiredPermissions ?? [];
    return hasAllPermissions(resolved, context, requiredPermissions);
  });
}

function validateTargetIds(steps: GuideFlow["steps"]): GuideFlow["steps"] {
  const registry = createGuideTargetRegistry();
  return steps.filter((step) => registry.has(step.target.targetId));
}

export async function expandGuideFlow(
  flowId: string,
  context: GuideExpansionContext,
  resolved?: ResolvedPermissions,
): Promise<GuideSession | null> {
  const flow = getGuideFlow(flowId);
  if (!flow) return null;

  // Reuse the caller's resolution when available (the controller already
  // resolves once for its permission context) so a guide expansion never
  // repeats the DB-backed resolution graph for the same request.
  const effectiveResolved = resolved ?? (await resolveActorPermissions(context));

  if (!hasAllPermissions(effectiveResolved, context, flow.requiredPermissions)) {
    return null;
  }

  let steps = filterStepsByPermissions(flow.steps, context, effectiveResolved);
  steps = validateTargetIds(steps);

  if (steps.length === 0) return null;

  const dir = getDirection(context.locale);

  const sessionSteps: GuideStep[] = steps.map((step) => ({
    stepId: step.stepId,
    order: step.order,
    title: localize(step.titleKey, context.locale),
    instruction: localize(step.instructionKey, context.locale),
    target: step.target,
    placement: step.placement,
    interaction: step.interaction,
    completion: step.completion,
    fallback: step.fallback,
  }));

  return {
    sessionId: `guide-${uuidv4()}`,
    flowId,
    locale: context.locale,
    dir,
    steps: sessionSteps,
    entryRoute: flow.entryRoute,
  };
}

/**
 * Build a universal two-step navigation guide for any registered section:
 * 1) navigate to the section (target its sidebar link, complete on route change),
 * 2) confirm arrival by spotlighting the shared content region (manual finish).
 */
export async function buildNavigationGuide(
  section: GuideSection,
  context: GuideExpansionContext,
): Promise<GuideSession | null> {
  const resolved = await resolveActorPermissions(context);
  if (!hasAllPermissions(resolved, context, section.requiredPermissions)) {
    return null;
  }

  const dir = getDirection(context.locale);
  const label = context.locale === "ar" ? section.labelAr : section.labelEn;

  const sessionSteps: GuideStep[] = [
    {
      stepId: "step-1",
      order: 1,
      title: interpolate(
        localize("copilot.guide.navigate.step1.title", context.locale),
        label,
      ),
      instruction: interpolate(
        localize("copilot.guide.navigate.step1.instruction", context.locale),
        label,
      ),
      target: { targetId: section.navTargetId, route: section.route },
      placement: "end",
      interaction: "navigate",
      completion: { event: "route_change", routeMatch: section.route },
      fallback: { onMissing: "wait", waitMs: 8000 },
    },
    {
      stepId: "step-2",
      order: 2,
      title: interpolate(
        localize("copilot.guide.navigate.step2.title", context.locale),
        label,
      ),
      instruction: interpolate(
        localize("copilot.guide.navigate.step2.instruction", context.locale),
        label,
      ),
      target: {
        targetId: section.pageTargetId ?? section.navTargetId,
        route: section.route,
      },
      placement: "top",
      interaction: "observe",
      completion: { event: "manual" },
      fallback: { onMissing: "skip" },
    },
  ];

  return {
    sessionId: `guide-${uuidv4()}`,
    flowId: `navigate.${section.sectionId}`,
    locale: context.locale,
    dir,
    steps: sessionSteps,
    entryRoute: section.route,
  };
}

function interpolate(template: string, label: string): string {
  return template.split("{label}").join(label);
}

export async function listAvailableGuideFlows(context: GuideExpansionContext): Promise<string[]> {
  const resolved = await resolveActorPermissions(context);
  const flows = createGuideFlowRegistry();
  const available: string[] = [];

  for (const [flowId, flow] of flows) {
    if (hasAllPermissions(resolved, context, flow.requiredPermissions)) {
      available.push(flowId);
    }
  }

  return available;
}

function localize(textKey: string, locale: "en" | "ar"): string {
  return localizeGuideKey(textKey, locale);
}
