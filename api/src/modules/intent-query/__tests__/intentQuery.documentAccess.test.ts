import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../../common/errors/AppError.js";
import { authorizeExplicitIntentDocuments, type ExplicitDocumentAuthorizer } from "../intentQuery.service.js";

const tenantId = "64a000000000000000000001";
const actorId = "64a000000000000000000002";
const documentIds = ["64a000000000000000000003", "64a000000000000000000004"];

test("explicit intent documents require use_in_ai for the authenticated tenant", async () => {
  const calls: unknown[] = [];
  const authorizer: ExplicitDocumentAuthorizer = { async authorizeDocumentsAction(context, ids, action) { calls.push({ context, ids, action }); } };
  await authorizeExplicitIntentDocuments(authorizer, { tenantId, actorId }, documentIds);
  assert.deepEqual(calls, [{ context: { tenantId, actorId }, ids: documentIds, action: "use_in_ai" }]);
});

test("one denied explicit document rejects the whole request", async () => {
  const denied = new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  const authorizer: ExplicitDocumentAuthorizer = { async authorizeDocumentsAction() { throw denied; } };
  await assert.rejects(authorizeExplicitIntentDocuments(authorizer, { tenantId, actorId }, documentIds), (error) => error === denied);
});

test("malformed explicit IDs fail before authorization", async () => {
  let calls = 0;
  const authorizer: ExplicitDocumentAuthorizer = { async authorizeDocumentsAction() { calls += 1; } };
  await assert.rejects(authorizeExplicitIntentDocuments(authorizer, { tenantId, actorId }, ["malformed"]), AppError);
  assert.equal(calls, 0);
});
