/**
 * Unit tests for KnowledgeGapsService.reportCandidate's T18 outbox trigger
 * ("knowledge_gap_created" producer).
 *
 * The service's real dependencies (mongo repository, audit writer) are faked /
 * fail-fast so the test stays pure: the ONLY side effect under test is the
 * trigger envelope published through the injected OutboxTriggerPort.
 *
 * Runner note: this directory runs under node:test (see scripts/run-api-tests.mjs)
 * — the file must NOT import from "vitest" or it is silently skipped.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { KnowledgeGapsService } from "../knowledge-gaps.service.js";
import type { KnowledgeGapsRepository } from "../knowledge-gaps.repository.js";
import type { KnowledgeGapAgentPort, GapAgentProposal } from "../knowledge-gaps.agent.js";
import type {
  OutboxTriggerPort,
  TriggerEnvelope,
} from "../../notifications/ports/outboxTrigger.port.js";
import type { ReportGapCandidateInput } from "../knowledge-gaps.dto.js";

// The audit writer never throws (it catch-logs), but on a disconnected mongoose
// connection it buffers operations ~10s. Fail-fast instead so tests are fast.
before(() => {
  mongoose.set("bufferCommands", false);
});

interface FakeGapDoc {
  _id: mongoose.Types.ObjectId;
  topic: string;
  severity: string;
  source: string;
  department: string | null;
}

/** In-memory repository stub recording the calls reportCandidate makes. */
class FakeGapRepository {
  existingGap: unknown = null;
  createdGap: FakeGapDoc | null = null;
  calls = { createGap: 0, createOccurrence: 0, incrementOccurrence: 0 };

  async findByClusterKey(): Promise<unknown> {
    return this.existingGap;
  }

  async createGap(data: { topic: string; severity: string }): Promise<FakeGapDoc> {
    this.calls.createGap += 1;
    const gap: FakeGapDoc =
      this.createdGap ?? {
        _id: new mongoose.Types.ObjectId("64b000000000000000000001"),
        topic: data.topic,
        severity: data.severity,
        source: "refusal",
        department: null,
      };
    this.createdGap = gap;
    return gap;
  }

  async createOccurrence(): Promise<unknown> {
    this.calls.createOccurrence += 1;
    return { _id: new mongoose.Types.ObjectId() };
  }

  async incrementOccurrence(): Promise<unknown> {
    this.calls.incrementOccurrence += 1;
    return { occurrenceCount: 2 };
  }
}

/** Deterministic agent stub so the trigger payload is fully controllable. */
class StubAgent implements KnowledgeGapAgentPort {
  constructor(private readonly proposal: GapAgentProposal) {}
  async proposeGapAnalysis(): Promise<GapAgentProposal> {
    return this.proposal;
  }
}

/** Records published envelopes; can be made to throw (best-effort check). */
class FakeTriggerPort implements OutboxTriggerPort {
  published: TriggerEnvelope[] = [];
  attempts = 0;
  failNext = false;

  async publishTrigger(event: TriggerEnvelope): Promise<void> {
    this.attempts += 1;
    if (this.failNext) {
      throw new Error("outbox unavailable");
    }
    this.published.push(event);
  }
}

const PROPOSAL: GapAgentProposal = {
  topic: "Remote Work Policy Missing",
  severity: "high",
  department: "HR",
  confidence: 0.9,
  reasoning: "test proposal",
};

const LONG_QUESTION =
  "What is the company vacation policy for employees who have completed more than five years of service and wish to take an extended unpaid leave during the summer months?";

function buildService(
  repo: FakeGapRepository,
  port: FakeTriggerPort,
  _actorId = "user-1",
): KnowledgeGapsService {
  return new KnowledgeGapsService(
    repo as unknown as KnowledgeGapsRepository,
    new StubAgent(PROPOSAL),
    undefined,
    port,
  );
}

function candidateInput(overrides: Partial<ReportGapCandidateInput> = {}): ReportGapCandidateInput {
  return {
    question: "How do I request remote work approval?",
    outcome: "refused",
    confidence: 0.9,
    evidenceSummaryIds: [],
    ...overrides,
  };
}

describe("KnowledgeGapsService.reportCandidate — T18 outbox trigger", () => {
  it("publishes exactly one knowledge_gap_created envelope for a NEW gap", async () => {
    const repo = new FakeGapRepository();
    repo.createdGap = {
      _id: new mongoose.Types.ObjectId("64b000000000000000000001"),
      topic: "Remote Work Policy Missing",
      severity: "high",
      source: "refusal",
      department: "HR",
    };
    const port = new FakeTriggerPort();
    const service = buildService(repo, port);

    const gap = await service.reportCandidate("tenant-1", "user-1", {
      ...candidateInput(),
      question: LONG_QUESTION,
    });

    // Persistence contract unchanged: exactly one gap + one first occurrence.
    assert.equal(repo.calls.createGap, 1);
    assert.equal(repo.calls.createOccurrence, 1);

    // Trigger fired exactly once with the full expected envelope.
    assert.equal(port.attempts, 1);
    assert.equal(port.published.length, 1);
    const env = port.published[0]!;
    assert.equal(env.type, "knowledge_gap_created");
    assert.equal(env.tenantId, "tenant-1");
    assert.equal(env.actorId, "user-1");
    assert.deepEqual(env.recipientUserIds, ["user-1"]);
    assert.ok(env.eventId.length > 0, "eventId should be a fresh id");
    assert.match(
      env.dedupKey ?? "",
      /^knowledge_gap_created:64b000000000000000000001:/,
      `dedupKey should scope to the gap id, got: ${env.dedupKey ?? ""}`,
    );

    // Payload mirrors the persisted gap (topic/severity/department/trace).
    assert.deepEqual(env.payload.metadata, {
      topic: "Remote Work Policy Missing",
      severity: "high",
      questionPreview: LONG_QUESTION.slice(0, 80),
    });
    assert.equal(env.payload.dedupEventId, "64b000000000000000000001");
    assert.equal(env.payload.actorId, "user-1");
    assert.equal(env.payload.department, "HR");
    assert.deepEqual(env.payload.source, {
      type: "knowledge_gap",
      id: "64b000000000000000000001",
      displayName: "Remote Work Policy Missing",
    });

    // Service contract unchanged: returns the created gap.
    assert.equal(String((gap as { _id: unknown })._id), "64b000000000000000000001");
  });

  it("does NOT publish for an existing gap (recurrence branch)", async () => {
    const repo = new FakeGapRepository();
    repo.existingGap = { _id: new mongoose.Types.ObjectId("64b000000000000000000002") };
    const port = new FakeTriggerPort();
    const service = buildService(repo, port);

    const result = await service.reportCandidate("tenant-1", "user-1", candidateInput());

    assert.ok(result, "recurrence still resolves");
    assert.equal(repo.calls.createGap, 0, "no new gap created on recurrence");
    assert.equal(repo.calls.incrementOccurrence, 1);
    assert.equal(repo.calls.createOccurrence, 1);
    assert.equal(port.attempts, 0, "recurrence must NOT publish a trigger");
    assert.equal(port.published.length, 0);
  });

  it("keeps gap creation when the trigger port throws (best-effort, non-fatal)", async () => {
    const repo = new FakeGapRepository();
    const port = new FakeTriggerPort();
    port.failNext = true;
    const service = buildService(repo, port);

    const gap = await service.reportCandidate("tenant-1", "user-1", candidateInput());

    assert.equal(port.attempts, 1, "publish was attempted");
    assert.equal(port.published.length, 0, "and it failed");
    assert.equal(repo.calls.createGap, 1, "gap still persisted despite trigger failure");
    assert.equal(String((gap as { _id: unknown })._id), "64b000000000000000000001");
  });

  it("emits no recipientUserIds for a 'system' actor", async () => {
    const repo = new FakeGapRepository();
    const port = new FakeTriggerPort();
    const service = buildService(repo, port, "system");

    await service.reportCandidate("tenant-1", "system", candidateInput());

    assert.equal(port.published.length, 1);
    assert.deepEqual(port.published[0]!.recipientUserIds, []);
    assert.equal(port.published[0]!.actorId, "system");
  });
});
