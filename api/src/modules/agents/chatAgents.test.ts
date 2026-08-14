import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { AGENT_CONTRACT_INVALID } from "../../common/errors/errorCodes.js";
import { createAgentRegistry } from "./agentRegistry.js";
import {
  CHAT_AGENT_IDS,
  chatAgentIdSchema,
  createChatAgentRegistry,
  isChatAgentId,
} from "./chatAgents.js";

describe("approved chat agent ids", () => {
  it("are exactly the approved chat agent ids", () => {
    assert.deepEqual(CHAT_AGENT_IDS, [
      "chat-supervisor",
      "intent-query-agent",
      "answer-writer-agent",
      "citation-verification-agent",
      "compliance-agent",
      "copilot-supervisor",
      "platform-guide-agent",
      "platform-action-agent",
    ]);
  });

  it("accept every approved id and reject unknown chat agent ids", () => {
    for (const id of CHAT_AGENT_IDS) {
      assert.equal(chatAgentIdSchema.safeParse(id).success, true, id);
      assert.equal(isChatAgentId(id), true, id);
    }

    for (const unknown of ["evil-agent", "echo-agent", "supervisor", ""]) {
      assert.equal(chatAgentIdSchema.safeParse(unknown).success, false, unknown);
      assert.equal(isChatAgentId(unknown), false, unknown);
    }
  });

  it("rejects registering unknown chat agents in the chat registry", () => {
    const registry = createChatAgentRegistry();
    assert.throws(
      () => registry.register({ id: "evil-agent" }),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, AGENT_CONTRACT_INVALID);
        assert.equal(error.statusCode, 400);
        return true;
      },
    );
  });

  it("auto-registers only the approved agents, never fake/test agents", () => {
    const generic = createAgentRegistry();
    assert.deepEqual(generic.list(), []);

    const chat = createChatAgentRegistry();
    const ids = chat.list().map((d) => d.id);
    assert.deepEqual(ids, [...CHAT_AGENT_IDS]);
  });
});
