import assert from "node:assert/strict";
import test from "node:test";
import type { ManagementApplyResult } from "../modules/document-access/documentPolicyManagement.persistence.js";
import type { DocumentAccessPolicy } from "../modules/document-access/documentAccess.types.js";
import { tenantMemberAllowPolicy, userDenyPolicy } from "../modules/document-access/documentAccess.fixtures.js";
import {
  backfillIdempotencyKey,
  buildUseInAiExtendedPolicy,
  rulesNeedingUseInAi,
  runUseInAiMigration,
  type UseInAiMigrationDeps,
  type UseInAiMigrationScanRecord,
  type UseInAiMigrationTaxonomy,
} from "./migrate-policy-use-in-ai.service.js";

const taxonomy: UseInAiMigrationTaxonomy = {
  classificationId: "classification-internal",
  classificationName: "Internal",
  classificationLevel: "internal",
  categoryId: null,
  categoryName: null,
  departmentId: null,
  departmentName: null,
};

function scanRecord(policy: DocumentAccessPolicy): UseInAiMigrationScanRecord {
  return {
    documentId: policy.documentId,
    tenantId: policy.tenantId,
    documentVersion: 1,
    activePolicyId: policy.policyId,
    activePolicyVersion: policy.policyVersion,
  };
}

function fakeDeps(policy: DocumentAccessPolicy, applyOutcome: () => ManagementApplyResult): {
  deps: UseInAiMigrationDeps;
  applied: Parameters<UseInAiMigrationDeps["apply"]>[0][];
  dispatched: Array<[string, string]>;
  audited: number;
} {
  const applied: Parameters<UseInAiMigrationDeps["apply"]>[0][] = [];
  const dispatched: Array<[string, string]> = [];
  let audited = 0;
  let scanCalls = 0;
  const deps: UseInAiMigrationDeps = {
    scan: async () => (scanCalls++ === 0 ? [scanRecord(policy)] : []),
    findPolicy: async () => policy,
    resolveTaxonomy: async () => taxonomy,
    apply: async (input) => { applied.push(input); return applyOutcome(); },
    dispatch: async (tenantId, eventId) => { dispatched.push([tenantId, eventId]); },
    audit: async () => { audited += 1; },
  };
  return { deps, applied, dispatched, get audited() { return audited; } };
}

const options = { apply: false, batchSize: 10, limit: 100 };

const POLICY_ID = "64a0000000000000000000aa";
const CLASSIFICATION_ID = "64a0000000000000000000bb";

function validPolicyFixture(): DocumentAccessPolicy {
  return {
    ...tenantMemberAllowPolicy,
    policyId: POLICY_ID,
    indexMetadata: {
      ...tenantMemberAllowPolicy.indexMetadata,
      policyId: POLICY_ID,
      classificationId: CLASSIFICATION_ID,
    },
  };
}

test("rulesNeedingUseInAi selects only allow rules with read and without use_in_ai", () => {
  assert.deepEqual(rulesNeedingUseInAi(tenantMemberAllowPolicy.rules), ["tenant-member-read-allow"]);
  assert.deepEqual(rulesNeedingUseInAi(userDenyPolicy.rules), []);
  const withUseInAi = tenantMemberAllowPolicy.rules.map((rule) => ({ ...rule, actions: [...rule.actions, "use_in_ai"] as typeof rule.actions }));
  assert.deepEqual(rulesNeedingUseInAi(withUseInAi), []);
  const withoutRead = tenantMemberAllowPolicy.rules.map((rule) => ({ ...rule, actions: ["discover"] as typeof rule.actions }));
  assert.deepEqual(rulesNeedingUseInAi(withoutRead), []);
});

test("buildUseInAiExtendedPolicy bumps the version and extends only selected rules", () => {
  const policy = validPolicyFixture();
  const extended = buildUseInAiExtendedPolicy(policy, ["tenant-member-read-allow"]);
  assert.equal(extended.policyVersion, policy.policyVersion + 1);
  assert.equal(extended.policyId, POLICY_ID);
  const extendedRule = extended.rules.find((rule) => rule.ruleId === "tenant-member-read-allow");
  assert.deepEqual([...extendedRule!.actions].sort(), ["read", "use_in_ai"]);
  assert.equal(extended.indexMetadata.policyVersion, extended.policyVersion);
  assert.equal(extended.provenance.createdBy, policy.provenance.createdBy);
  assert.match(extended.provenance.reason ?? "", /use_in_ai backfill/);
});

test("dry-run plans migration without applying", async () => {
  const policy = validPolicyFixture();
  const { deps, applied } = fakeDeps(policy, () => ({ outcome: "applied", policyId: POLICY_ID, policyVersion: 2, propagationEventId: "e" }));
  const report = await runUseInAiMigration({ ...options, apply: false }, deps);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.counts.would_migrate, 1);
  assert.equal(applied.length, 0);
});

test("apply migrates, dispatches propagation, and audits", async () => {
  const policy = validPolicyFixture();
  const fake = fakeDeps(policy, () => ({ outcome: "applied", policyId: POLICY_ID, policyVersion: 2, propagationEventId: "event-1" }));
  const report = await runUseInAiMigration({ ...options, apply: true }, fake.deps);
  assert.equal(report.counts.migrated, 1);
  assert.equal(fake.applied.length, 1);
  assert.equal(fake.applied[0]?.idempotencyKey, backfillIdempotencyKey(policy.documentId, 1));
  assert.equal(fake.applied[0]?.policy.policyVersion, 2);
  assert.deepEqual(fake.dispatched, [[policy.tenantId, "event-1"]]);
  assert.equal(fake.audited, 1);
});

test("apply reports replay and version conflict outcomes", async () => {
  const policy = validPolicyFixture();
  const replay = fakeDeps(policy, () => ({ outcome: "replay", policyId: POLICY_ID, policyVersion: 2, propagationEventId: null }));
  const replayReport = await runUseInAiMigration({ ...options, apply: true }, replay.deps);
  assert.equal(replayReport.counts.replayed, 1);
  assert.equal(replay.dispatched.length, 0);

  const conflict = fakeDeps(policy, () => ({ outcome: "version_conflict" }));
  const conflictReport = await runUseInAiMigration({ ...options, apply: true }, conflict.deps);
  assert.equal(conflictReport.counts.version_conflict, 1);
});

test("policies without eligible rules are already_ok", async () => {
  const base = validPolicyFixture();
  const alreadyCompliant = { ...base, rules: base.rules.map((rule) => ({ ...rule, actions: [...rule.actions, "use_in_ai"] as typeof rule.actions })) };
  const fake = fakeDeps(alreadyCompliant, () => ({ outcome: "applied", policyId: POLICY_ID, policyVersion: 2, propagationEventId: "e" }));
  const report = await runUseInAiMigration({ ...options, apply: true }, fake.deps);
  assert.equal(report.counts.already_ok, 1);
  assert.equal(fake.applied.length, 0);
});
