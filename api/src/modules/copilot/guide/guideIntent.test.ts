import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeText,
  hasHowToFraming,
  hasNavFraming,
  matchFlowToUtterance,
  getFlowCategory,
  getFlowKeywords,
  deriveGuideFlowAudience,
  getAllFlowIds,
  FLOW_CATEGORIES,
  type UtteranceMatch,
  type GuideFlowAudience,
} from "./guideIntent.js";
import { getGuideFlow } from "./guideFlows.js";

const ALL_FLOWS = getAllFlowIds();

function flowOf(
  utterance: string,
  locale: "en" | "ar",
  flows: readonly string[] = ALL_FLOWS,
  route?: string,
): string | null {
  const match: UtteranceMatch | null = matchFlowToUtterance(utterance, locale, flows, route);
  return match?.flowId ?? null;
}

test("normalizeText strips Arabic diacritics and folds variant letters", () => {
  assert.equal(normalizeText("مستنداً"), "مستندا");
  assert.equal(normalizeText("الإعدادات"), "الاعدادات");
  assert.equal(normalizeText("أين أجد"), "اين اجد");
  assert.equal(normalizeText("How Do I Upload A Document?"), "how do i upload a document?");
  assert.equal(normalizeText("أرفعُ"), "ارفع");
});

test("hasHowToFraming recognizes English and Arabic how-to phrasing", () => {
  assert.equal(hasHowToFraming("how do I upload a document?"), true);
  assert.equal(hasHowToFraming("How can I archive this?"), true);
  assert.equal(hasHowToFraming("walk me through restoring"), true);
  assert.equal(hasHowToFraming("كيف أرفع مستنداً؟"), true);
  assert.equal(hasHowToFraming("كيف يمكنني تغيير كلمة المرور؟"), true);
  assert.equal(hasHowToFraming("show me the email logs"), false);
  assert.equal(hasHowToFraming("archive this document"), false);
});

test("hasNavFraming recognizes navigation phrasing only for real destinations", () => {
  assert.equal(hasNavFraming("find the roles page"), true);
  assert.equal(hasNavFraming("open the users tab"), true);
  assert.equal(hasNavFraming("أين صفحة الإعدادات؟"), true);
  assert.equal(hasNavFraming("where is the settings page"), true);
  assert.equal(hasNavFraming("find the document I uploaded"), false);
  assert.equal(hasNavFraming("how do I search documents"), false);
  assert.equal(hasNavFraming("show me the email logs"), true);
});

test("matchFlowToUtterance: how-to phrasing routes to flows", () => {
  assert.equal(flowOf("how do I upload a document?", "en"), "documents.upload");
  assert.equal(flowOf("كيف أرفع مستنداً؟", "ar"), "documents.upload");
  assert.equal(flowOf("how do I search documents?", "en"), "documents.search");
  assert.equal(flowOf("كيف أبحث عن مستند؟", "ar"), "documents.search");
  assert.equal(flowOf("how do I archive a document?", "en"), "documents.archive");
  assert.equal(flowOf("how do I restore a deleted document?", "en"), "documents.restore");
  assert.equal(flowOf("how do I replace a document file?", "en"), "documents.replace");
  assert.equal(flowOf("how do I resend an invitation?", "en"), "users.resendInvitation");
  assert.equal(flowOf("كيف أعيد إرسال الدعوة؟", "ar"), "users.resendInvitation");
  assert.equal(flowOf("how do I revoke an invitation?", "en"), "users.revokeInvitation");
  assert.equal(flowOf("how do I delete a user?", "en"), "users.remove");
  assert.equal(flowOf("how do I create a role?", "en"), "roles.create");
  assert.equal(flowOf("how do I update my profile?", "en"), "settings.updateProfile");
  assert.equal(flowOf("كيف أعدّل بيانات الشركة؟", "ar"), "settings.updateProfile");
  assert.equal(flowOf("how do I check my usage limits?", "en"), "usage.view");
  assert.equal(flowOf("كيف أعرف حجم التخزين؟", "ar"), "usage.view");
  assert.equal(flowOf("how do I view failed documents?", "en"), "documents.failedReview");
  assert.equal(flowOf("how do I build the knowledge base?", "en"), "knowledgeBase.build");
});

test("matchFlowToUtterance: neutral phrasing picks the strongest keyword", () => {
  assert.equal(flowOf("search documents", "en"), "documents.search");
  assert.equal(flowOf("upload a document", "en"), "documents.upload");
  assert.equal(flowOf("invite a new employee", "en"), "users.invite");
  assert.equal(flowOf("subscription upgrade", "en"), "billing.open");
  assert.equal(flowOf("update my password", "en"), "settings.open");
  assert.equal(flowOf("usage and limits", "en"), "usage.view");
  assert.equal(flowOf("storage usage", "en"), "usage.view");
});

test("matchFlowToUtterance: tour requests route to platform.tour", () => {
  assert.equal(flowOf("give me a tour of the platform", "en"), "platform.tour");
  assert.equal(flowOf("walk me through the platform", "en"), "platform.tour");
  assert.equal(flowOf("explain the whole platform", "en"), "platform.tour");
  assert.equal(flowOf("getting started", "en"), "platform.tour");
  assert.equal(flowOf("جولة في المنصة", "ar"), "platform.tour");
  assert.equal(flowOf("اشرح لي المنصة", "ar"), "platform.tour");
  assert.equal(flowOf("من أين أبدأ؟", "ar"), "platform.tour");
});

test("matchFlowToUtterance: ambiguous 'taxonomy settings' resolves to taxonomy", () => {
  assert.equal(flowOf("taxonomy settings", "en"), "taxonomy.manage");
  assert.equal(flowOf("settings taxonomy", "en"), "taxonomy.manage");
});

test("matchFlowToUtterance: routeContext breaks equal-score ties", () => {
  const onSettingsPage = "/dashboard/settings";
  const onTaxonomyPage = "/dashboard/settings/document-taxonomy";
  assert.equal(flowOf("taxonomy settings", "en", ALL_FLOWS, onSettingsPage), "settings.open");
  assert.equal(flowOf("taxonomy settings", "en", ALL_FLOWS, onTaxonomyPage), "taxonomy.manage");
});

test("matchFlowToUtterance: Latin keywords require word boundaries", () => {
  assert.equal(flowOf("I uploaded something", "en"), null);
  assert.equal(flowOf("unarchive this", "en"), null);
  assert.equal(flowOf("undelete is not a word", "en"), null);
});

test("matchFlowToUtterance: irrelevant utterances return null", () => {
  assert.equal(flowOf("what is the weather today?", "en"), null);
  assert.equal(flowOf("show me the email logs", "en"), null);
  assert.equal(flowOf("hello", "en"), null);
  assert.equal(flowOf("شكراً", "ar"), null);
});

test("matchFlowToUtterance: availableFlows limits the candidate set", () => {
  assert.equal(flowOf("search documents", "en", ["documents.upload"]), null);
  assert.equal(flowOf("search documents", "en", ["documents.search"]), "documents.search");
});

test("getFlowCategory and getAllFlowIds stay consistent", () => {
  const validCategories = Object.values(FLOW_CATEGORIES);
  for (const flowId of getAllFlowIds()) {
    const category = getFlowCategory(flowId);
    assert.ok(validCategories.includes(category), `${flowId} has a valid category`);
  }
  assert.equal(getFlowCategory("documents.upload"), "documents");
  assert.equal(getFlowCategory("users.invite"), "users");
  assert.equal(getFlowCategory("roles.create"), "roles");
  assert.equal(getFlowCategory("settings.open"), "settings");
  assert.equal(getFlowCategory("taxonomy.manage"), "settings");
  assert.equal(getFlowCategory("billing.open"), "billing");
  assert.equal(getFlowCategory("usage.view"), "billing");
  assert.equal(getFlowCategory("chat.ask"), "chat");
  assert.equal(getFlowCategory("knowledgeBase.build"), "documents");
});

test("getFlowKeywords returns keywords per flow and [] for unknown flows", () => {
  assert.ok(getFlowKeywords("documents.upload").length > 0);
  assert.ok(getFlowKeywords("documents.upload").includes("upload a document"));
  assert.deepEqual(getFlowKeywords("no.such.flow"), []);
});

test("deriveGuideFlowAudience classifies all registered flows", () => {
  const known: GuideFlowAudience[] = ["employee", "admin", "all"];
  for (const flowId of getAllFlowIds()) {
    const flow = getGuideFlow(flowId);
    assert.ok(flow, `flow ${flowId} resolves`);
    const audience = deriveGuideFlowAudience(flow);
    assert.ok(
      known.includes(audience),
      `${flowId} → ${audience} must be a known audience`,
    );
  }
  assert.equal(deriveGuideFlowAudience(getGuideFlow("platform.tour")!), "all");
  const employeeFlows = getAllFlowIds().filter(
    (flowId) => deriveGuideFlowAudience(getGuideFlow(flowId)!) === "employee",
  );
  assert.ok(
    employeeFlows.includes("documents.search"),
    "documents.search is employee-facing (documents:read is in the employee role)",
  );
  assert.ok(
    employeeFlows.includes("chat.ask"),
    "chat.ask is employee-facing",
  );
  const adminFlows = getAllFlowIds().filter(
    (flowId) => deriveGuideFlowAudience(getGuideFlow(flowId)!) === "admin",
  );
  assert.ok(adminFlows.includes("users.invite"), "users.invite is admin-facing");
});
