// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FeedbackWidget } from "./FeedbackWidget";
import { submitFeedback } from "@/services/feedback.service";
import { t as translateKey } from "@/lib/i18n/i18n.utils";
import en from "@/lib/i18n/translations/en";

vi.mock("@/services/feedback.service", () => ({
  submitFeedback: vi.fn().mockResolvedValue({ feedback: { id: "f1" } }),
}));

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({
    locale: "en",
    dir: "ltr",
    t: (key: string, params?: Record<string, string>) =>
      translateKey(en, key, params),
  }),
}));

const mockedSubmit = vi.mocked(submitFeedback);

function renderWidget() {
  return render(
    <FeedbackWidget messageId="msg-real-1" conversationId="conv-1" />,
  );
}

describe("FeedbackWidget", () => {
  beforeEach(() => {
    mockedSubmit.mockClear();
  });

  it("renders the prompt and two labeled controls", () => {
    renderWidget();
    expect(screen.getByText("Was this answer helpful?")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Thumbs Up" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Thumbs Down" }),
    ).toBeTruthy();
  });

  it("reflects the selected rating with aria-pressed", async () => {
    renderWidget();
    const thumbsUp = screen.getByRole("button", { name: "Thumbs Up" });
    expect(thumbsUp.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(thumbsUp);
    await waitFor(() =>
      expect(thumbsUp.getAttribute("aria-pressed")).toBe("true"),
    );
    expect(screen.getByRole("button", { name: "Thumbs Down" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("submits positive feedback with the active conversation and message ids", async () => {
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "Thumbs Up" }));
    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1));
    expect(mockedSubmit).toHaveBeenCalledWith({
      messageId: "msg-real-1",
      conversationId: "conv-1",
      rating: "thumbs_up",
      category: undefined,
      comment: undefined,
    });
  });

  it("expands the negative-feedback details form when thumbs down is chosen", async () => {
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "Thumbs Down" }));
    await waitFor(() =>
      expect(
        screen.getByText("What was the issue? (Optional)"),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByText("Skip")).toBeTruthy();
  });

  it("skipping the details form submits thumbs down without a category", async () => {
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "Thumbs Down" }));
    await waitFor(() =>
      expect(screen.getByText("Skip")).toBeTruthy(),
    );
    fireEvent.click(screen.getByText("Skip"));
    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1));
    expect(mockedSubmit).toHaveBeenCalledWith({
      messageId: "msg-real-1",
      conversationId: "conv-1",
      rating: "thumbs_down",
      category: undefined,
      comment: undefined,
    });
  });

  it("submits negative feedback with category and comment when provided", async () => {
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "Thumbs Down" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toBeTruthy(),
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "inaccurate" },
    });
    fireEvent.change(screen.getByPlaceholderText("Tell us what was missing or incorrect..."), {
      target: { value: "Missing the 2024 update" },
    });
    fireEvent.click(screen.getByText("Submit Feedback"));
    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1));
    expect(mockedSubmit).toHaveBeenCalledWith({
      messageId: "msg-real-1",
      conversationId: "conv-1",
      rating: "thumbs_down",
      category: "inaccurate",
      comment: "Missing the 2024 update",
    });
  });
});
