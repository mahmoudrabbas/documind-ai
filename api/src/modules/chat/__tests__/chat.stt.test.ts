import { describe, it, expect, vi } from "vitest";
import { Permission } from "../../permissions/permissions.catalog.js";

vi.mock("../../permissions/permissions.operation.js", () => ({
  authorizeTenantOperation: vi.fn().mockImplementation(async () => ({
    tenantId: "tenant_123",
    actorId: "user_123",
    actorRole: "EMPLOYEE",
    permissions: [Permission.CHAT_CREATE],
  })),
}));

import { ChatService } from "../chat.service.js";
import { AppError } from "../../../common/errors/AppError.js";
import type { HybridRetrievalService } from "../../retrieval/retrieval.service.js";
import type { ModelAdapter } from "../../agents/agents.types.js";
import type { OperationAuthorizationContext } from "../../permissions/permissions.operation.js";

describe("Chat STT Endpoint & Service Integration Tests", () => {
  const mockRetrievalService = {} as HybridRetrievalService;
  const mockModelAdapter = {} as ModelAdapter;
  const mockSttAdapter = {
    transcribe: vi.fn().mockResolvedValue("Transcribed audio result"),
  };

  const mockContext: OperationAuthorizationContext = {
    tenantId: "tenant_123",
    actorId: "user_123",
    actorRole: "EMPLOYEE",
    traceId: "trace_123",
    requestId: "req_123",
  };

  it("rejects missing audio file", async () => {
    const service = new ChatService(
      mockRetrievalService,
      mockModelAdapter,
      undefined,
      undefined,
      mockSttAdapter as any,
    );

    await expect(
      service.transcribeAudio(undefined, mockContext),
    ).rejects.toThrow("Audio file is required");
  });

  it("rejects audio file larger than 10MB limit", async () => {
    const service = new ChatService(
      mockRetrievalService,
      mockModelAdapter,
      undefined,
      undefined,
      mockSttAdapter as any,
    );

    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024);
    const oversizedFile = {
      buffer: oversizedBuffer,
      mimetype: "audio/webm",
      size: oversizedBuffer.length,
    };

    try {
      await service.transcribeAudio(oversizedFile, mockContext);
      expect.fail("Should have thrown STT_FILE_TOO_LARGE");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe("STT_FILE_TOO_LARGE");
    }
  });

  it("rejects unsupported audio file mime types", async () => {
    const service = new ChatService(
      mockRetrievalService,
      mockModelAdapter,
      undefined,
      undefined,
      mockSttAdapter as any,
    );

    const invalidFile = {
      buffer: Buffer.from("fake text file"),
      mimetype: "text/plain",
      size: 100,
    };

    try {
      await service.transcribeAudio(invalidFile, mockContext);
      expect.fail("Should have thrown STT_UNSUPPORTED_MIME_TYPE");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(400);
      expect(appErr.code).toBe("STT_UNSUPPORTED_MIME_TYPE");
    }
  });

  it("successfully transcribes valid webm audio file", async () => {
    const service = new ChatService(
      mockRetrievalService,
      mockModelAdapter,
      undefined,
      undefined,
      mockSttAdapter as any,
    );

    const validFile = {
      buffer: Buffer.from("audio stream bytes"),
      mimetype: "audio/webm",
      size: 500,
    };

    const res = await service.transcribeAudio(validFile, mockContext);
    expect(res).toEqual({ text: "Transcribed audio result" });
    expect(mockSttAdapter.transcribe).toHaveBeenCalledWith(
      validFile.buffer,
      "audio/webm",
    );
  });
});
