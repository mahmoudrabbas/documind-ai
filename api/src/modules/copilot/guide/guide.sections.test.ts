import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryPermissionEvaluator } from "../../permissions/permissions.evaluator.fake.js";
import {
  resetPermissionEvaluator,
  setPermissionEvaluator,
} from "../../permissions/permissions.evaluator.js";
import {
  GUIDE_SECTIONS,
  matchSectionToUtterance,
  type GuideSectionContext,
} from "./guideSections.js";
import { buildNavigationGuide } from "./guide.service.js";

const tenantId = "507f1f77bcf86cd799439011";
const actorId = "507f191e810c19729de860ea";

function withEvaluator(
  baseRole: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE",
  run: () => Promise<void>,
): Promise<void> {
  const evaluator = new InMemoryPermissionEvaluator();
  evaluator.addUser(actorId, tenantId, baseRole);
  setPermissionEvaluator(evaluator);
  return run().finally(() => {
    resetPermissionEvaluator();
  });
}

function match(utterance: string, context: GuideSectionContext = "tenant", locale: "en" | "ar" = "en") {
  return matchSectionToUtterance(utterance, context, locale);
}

test("matchSectionToUtterance resolves tenant sections by label and alias", () => {
  assert.equal(match("show me the email logs")?.sectionId, "emails");
  assert.equal(match("where is my email log")?.sectionId, "emails");
  assert.equal(match("show me the audit log")?.sectionId, "audit");
  assert.equal(match("open the roles page")?.sectionId, "roles");
  assert.equal(match("take me to knowledge gaps")?.sectionId, "knowledge-gaps");
  assert.equal(match("how do i get to the documents")?.sectionId, "documents");
  assert.equal(match("show me usage and limits")?.sectionId, "usage");
  assert.equal(match("أين سجل البريد الإلكتروني", "tenant", "ar")?.sectionId, "emails");
  assert.equal(match("أين سجل التدقيق", "tenant", "ar")?.sectionId, "audit");
});

test("matchSectionToUtterance respects context", () => {
  assert.equal(match("show me the companies", "tenant"), null);
  assert.equal(match("show me the companies", "platform")?.sectionId, "sa-companies");
  assert.equal(match("show me the subscriptions", "platform")?.sectionId, "sa-subscriptions");
  assert.equal(match("show me the email logs", "platform"), null);
});

test("every registered section has a nav target and aliases", () => {
  for (const section of GUIDE_SECTIONS) {
    assert.ok(section.navTargetId.startsWith("nav-"), `${section.sectionId} nav id`);
    assert.ok(section.route.startsWith("/"), `${section.sectionId} route`);
    assert.ok(section.labelEn.length > 0, `${section.sectionId} english label`);
    assert.ok(section.labelAr.length > 0, `${section.sectionId} arabic label`);
  }
});

test("buildNavigationGuide builds a 2-step navigate.emails guide (en)", async () => {
  await withEvaluator("COMPANY_ADMIN", async () => {
    const section = match("show me the email logs");
    assert.ok(section, "emails section should match");
    const session = await buildNavigationGuide(section!, {
      tenantId,
      actorId,
      actorRole: "COMPANY_ADMIN",
      locale: "en",
    });
    assert.ok(session, "session should build with permissions");
    assert.equal(session!.flowId, "navigate.emails");
    assert.equal(session!.entryRoute, "/dashboard/emails");
    assert.equal(session!.locale, "en");
    assert.equal(session!.dir, "ltr");
    assert.equal(session!.steps.length, 2);

    const step1 = session!.steps[0]!;
    assert.equal(step1.target.targetId, "nav-emails");
    assert.equal(step1.completion.event, "route_change");
    assert.equal(step1.completion.routeMatch, "/dashboard/emails");
    assert.equal(step1.interaction, "navigate");
    assert.equal(step1.fallback.onMissing, "wait");
    assert.equal(step1.fallback.waitMs, 8000);
    assert.match(step1.title, /Email Log/);

    const step2 = session!.steps[1]!;
    assert.equal(step2.target.targetId, "page-heading-emails");
    assert.equal(step2.completion.event, "manual");
    assert.match(step2.title, /Email Log/);
  });
});

test("buildNavigationGuide localizes to Arabic (rtl)", async () => {
  await withEvaluator("COMPANY_ADMIN", async () => {
    const section = match("أين سجل البريد الإلكتروني", "tenant", "ar");
    assert.ok(section, "emails section should match in Arabic");
    const session = await buildNavigationGuide(section!, {
      tenantId,
      actorId,
      actorRole: "COMPANY_ADMIN",
      locale: "ar",
    });
    assert.ok(session, "session should build");
    assert.equal(session!.dir, "rtl");
    assert.equal(session!.locale, "ar");
    assert.match(session!.steps[0]!.title, /سجل البريد/);
  });
});

test("buildNavigationGuide denies when the actor lacks the section permission", async () => {
  await withEvaluator("EMPLOYEE", async () => {
    const section = match("show me the email logs");
    assert.ok(section, "emails section should match");
    const session = await buildNavigationGuide(section!, {
      tenantId,
      actorId,
      actorRole: "EMPLOYEE",
      locale: "en",
    });
    assert.equal(session, null);
  });
});

test("buildNavigationGuide builds platform guides for SUPER_ADMIN", async () => {
  await withEvaluator("SUPER_ADMIN", async () => {
    const section = match("show me the companies", "platform");
    assert.ok(section, "companies section should match for platform");
    const session = await buildNavigationGuide(section!, {
      tenantId,
      actorId,
      actorRole: "SUPER_ADMIN",
      locale: "en",
    });
    assert.ok(session, "session should build");
    assert.equal(session!.flowId, "navigate.sa-companies");
    assert.equal(session!.steps[0]!.target.targetId, "nav-sa-companies");
  });
});
