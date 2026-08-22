// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailPreviewDialog, type EmailPreviewData } from "./email-preview-dialog";

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const completeEmail: EmailPreviewData = {
  subject: "Welcome",
  recipientEmail: "person@example.test",
  templateId: "user-invitation",
  state: "SENT",
  createdAt: "2026-08-22T08:00:00.000Z",
  scheduledFor: "2026-08-22T08:01:00.000Z",
  sentAt: "2026-08-22T08:02:00.000Z",
  lastAttemptAt: "2026-08-22T08:02:00.000Z",
  attemptCount: 1,
  providerMessageId: "provider-message-123",
  correlationId: "trace-123",
  errorCategory: "",
  attempts: [{ attemptNumber: 1, state: "SENT", startedAt: "2026-08-22T08:01:30.000Z" }],
};

describe("EmailPreviewDialog", () => {
  beforeAll(() => {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close() { this.open = false; };
    }
  });
  beforeEach(() => vi.clearAllMocks());

  it("renders safe delivery metadata and never renders secrets or raw provider payloads", () => {
    render(<EmailPreviewDialog isOpen onClose={vi.fn()} data={completeEmail} />);

    expect(screen.getByText("person@example.test")).toBeTruthy();
    expect(screen.getByText("user-invitation")).toBeTruthy();
    expect(screen.getByText("provider-message-123")).toBeTruthy();
    expect(screen.getByText("trace-123")).toBeTruthy();
    expect(screen.getByText("1", { selector: "dd" })).toBeTruthy();
    expect(screen.queryByText(/token|secret|raw payload|password/i)).toBeNull();
  });

  it("handles absent optional metadata without rendering placeholders", () => {
    render(<EmailPreviewDialog isOpen onClose={vi.fn()} data={{
      subject: "Verification",
      recipientEmail: "person@example.test",
      templateId: "verification",
      state: "QUEUED",
    }} />);

    expect(screen.getByText("person@example.test")).toBeTruthy();
    expect(screen.queryByText(/undefined|null|provider message|trace \/ correlation/i)).toBeNull();
  });
});
