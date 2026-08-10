// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  ChatImageThumbnail,
  PersistedChatImageThumbnail,
} from "./ChatImageThumbnail";
import { ChatImagePreviewModal } from "./ChatImagePreviewModal";
import { fetchChatAttachmentUrl } from "@/services/chat.service";
import { t as translateKey } from "@/lib/i18n/i18n.utils";
import en from "@/lib/i18n/translations/en";
import ar from "@/lib/i18n/translations/ar";

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({
    locale: "en",
    dir: "ltr",
    t: (key: string, params?: Record<string, string>) =>
      translateKey(en, key, params),
  }),
}));

vi.mock("@/services/chat.service", () => ({
  fetchChatAttachmentUrl: vi.fn().mockResolvedValue("blob:mock-attachment-url"),
}));

const mockedFetch = vi.mocked(fetchChatAttachmentUrl);

const ATTACHMENT = {
  id: "attachment-1",
  fileName: "invoice.png",
  mimeType: "image/png",
  sizeBytes: 2048,
} as const;

function renderThumbnail() {
  const onOpen = vi.fn();
  const utils = render(
    <ChatImageThumbnail
      src="blob:local-optimistic"
      alt="Attachment preview"
      onOpen={onOpen}
    />,
  );
  return { onOpen, ...utils };
}

describe("ChatImageThumbnail", () => {
  it("renders a local optimistic image thumbnail", () => {
    renderThumbnail();
    const img = screen.getByRole("img", { name: "Attachment preview" });
    expect(img.getAttribute("src")).toBe("blob:local-optimistic");
  });

  it("is keyboard-focusable and interactive", () => {
    const { onOpen } = renderThumbnail();
    const button = screen.getByRole("button", { name: "Open image preview" });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("preserves aspect ratio and caps size without stretching (no fixed aspect ratio)", () => {
    const { container } = renderThumbnail();
    const img = container.querySelector("img");
    expect(img?.className).toContain("object-contain");
    expect(img?.className).toContain("max-h-[280px]");
    expect(img?.className).toContain("max-w-[min(320px,100%)]");
  });
});

describe("PersistedChatImageThumbnail", () => {
  beforeEach(() => {
    mockedFetch.mockClear();
  });

  it("renders after the async attachment URL resolves (persisted path preserved)", async () => {
    render(
      <PersistedChatImageThumbnail
        attachment={ATTACHMENT}
        alt={ATTACHMENT.fileName}
        onOpen={vi.fn()}
      />,
    );
    expect(mockedFetch).toHaveBeenCalledWith(ATTACHMENT.id);
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: ATTACHMENT.fileName }),
      ).toBeTruthy(),
    );
    expect(
      screen
        .getByRole("img", { name: ATTACHMENT.fileName })
        .getAttribute("src"),
    ).toBe("blob:mock-attachment-url");
  });

  it("forwards the resolved src to the click handler", async () => {
    const onOpen = vi.fn();
    render(
      <PersistedChatImageThumbnail attachment={ATTACHMENT} onOpen={onOpen} />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: ATTACHMENT.fileName }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open image preview" }));
    expect(onOpen).toHaveBeenCalledWith("blob:mock-attachment-url");
  });
});

function renderPreview(src: string | null) {
  const onClose = vi.fn();
  const utils = render(
    <ChatImagePreviewModal
      src={src}
      alt="Attachment preview"
      onClose={onClose}
    />,
  );
  return { onClose, ...utils };
}

describe("ChatImagePreviewModal", () => {
  it("does not render when there is nothing to preview", () => {
    renderPreview(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens as an accessible modal dialog", () => {
    renderPreview("blob:local-optimistic");
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Image preview");
  });

  it("shows the same image src in the preview", () => {
    renderPreview("blob:local-optimistic");
    const img = screen.getByRole("img", { name: "Attachment preview" });
    expect(img.getAttribute("src")).toBe("blob:local-optimistic");
  });

  it("closes via the accessible close button", () => {
    const { onClose } = renderPreview("blob:local-optimistic");
    fireEvent.click(
      screen.getByRole("button", { name: "Close image preview" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape key", () => {
    const { onClose } = renderPreview("blob:local-optimistic");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the darkened backdrop is clicked", () => {
    const { onClose } = renderPreview("blob:local-optimistic");
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("image preview i18n", () => {
  it("keeps en/ar parity for the image preview labels", () => {
    expect(Object.keys(ar)).toEqual(Object.keys(en));
    for (const key of [
      "chat.openImagePreview",
      "chat.closeImagePreview",
      "chat.imagePreview",
    ]) {
      expect(en[key]).not.toBe("");
      expect(ar[key]).not.toBe("");
      expect(ar[key]).not.toBe(en[key]);
    }
    expect(en["chat.openImagePreview"]).toBe("Open image preview");
    expect(ar["chat.openImagePreview"]).toBe("فتح معاينة الصورة");
    expect(en["chat.closeImagePreview"]).toBe("Close image preview");
    expect(ar["chat.closeImagePreview"]).toBe("إغلاق معاينة الصورة");
    expect(en["chat.imagePreview"]).toBe("Image preview");
    expect(ar["chat.imagePreview"]).toBe("معاينة الصورة");
  });
});
