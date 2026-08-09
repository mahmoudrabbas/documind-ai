// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SourceList } from "./ChatSources";
import type { ChatSource } from "@/types/api/chat.types";
import { t as translateKey } from "@/lib/i18n/i18n.utils";
import en from "@/lib/i18n/translations/en";

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({
    locale: "en",
    dir: "ltr",
    t: (key: string, params?: Record<string, string>) =>
      translateKey(en, key, params),
  }),
}));

function source(overrides: Partial<ChatSource> = {}): ChatSource {
  return {
    chunkId: "chunk-1",
    documentId: "doc-1",
    text: "Procurement thresholds are set annually.",
    pageNumber: 3,
    sectionTitle: "Procurement Policy",
    score: 0.92,
    documentTitle: "Vendor Management Policy 2024",
    ...overrides,
  };
}

function openHandler() {
  return vi.fn();
}

describe("SourceList", () => {
  it("renders the localized source count in the header", () => {
    render(<SourceList sources={[source()]} onOpen={openHandler()} />);
    expect(screen.getByText("Sources (1)")).toBeTruthy();
  });

  it("renders the document title for every source", () => {
    const sources = [
      source({ chunkId: "c1", documentTitle: "Alpha Policy" }),
      source({ chunkId: "c2", documentTitle: "Beta Policy" }),
    ];
    render(<SourceList sources={sources} onOpen={openHandler()} />);
    expect(screen.getByText("Alpha Policy")).toBeTruthy();
    expect(screen.getByText("Beta Policy")).toBeTruthy();
  });

  it("renders the page number when present", () => {
    render(<SourceList sources={[source({ pageNumber: 7 })]} onOpen={openHandler()} />);
    expect(screen.getByText("Page 7")).toBeTruthy();
  });

  it("does not render a page label when page number is absent", () => {
    render(
      <SourceList
        sources={[source({ pageNumber: undefined })]}
        onOpen={openHandler()}
      />,
    );
    expect(screen.queryByText(/page/i)).toBeNull();
  });

  it("renders the section title when present", () => {
    render(
      <SourceList
        sources={[source({ sectionTitle: "Executive Summary" })]}
        onOpen={openHandler()}
      />,
    );
    expect(screen.getByText("Executive Summary")).toBeTruthy();
  });

  it("does not render the internal retrieval score to end users", () => {
    render(
      <SourceList
        sources={[source({ score: 0.92 })]}
        onOpen={openHandler()}
      />,
    );
    expect(screen.queryByText(/92%|0\.92/i)).toBeNull();
  });

  it("passes the full source through on open (documentId, pageNumber, text, documentTitle preserved)", () => {
    const onOpen = openHandler();
    const src = source();
    render(<SourceList sources={[src]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Vendor Management Policy 2024/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(src);
    expect(src.documentId).toBe("doc-1");
    expect(src.pageNumber).toBe(3);
    expect(src.text).toBeTruthy();
    expect(src.documentTitle).toBe("Vendor Management Policy 2024");
  });

  it("renders multiple sources without introducing duplicates", () => {
    const sources = [
      source({ chunkId: "c1", documentTitle: "Alpha Policy" }),
      source({ chunkId: "c2", documentTitle: "Beta Policy" }),
      source({ chunkId: "c3", documentTitle: "Gamma Policy" }),
    ];
    render(<SourceList sources={sources} onOpen={openHandler()} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("falls back to the localized document label when title is missing", () => {
    render(
      <SourceList
        sources={[source({ documentTitle: undefined })]}
        onOpen={openHandler()}
      />,
    );
    expect(screen.getByText("Document")).toBeTruthy();
  });

  it("provides a descriptive aria-label per source button", () => {
    render(
      <SourceList
        sources={[source({ documentTitle: "Procurement Policy" })]}
        onOpen={openHandler()}
      />,
    );
    const button = screen.getByRole("button", {
      name: /Open source, Procurement Policy, Page 3/i,
    });
    expect(button).toBeTruthy();
  });

  it("renders Arabic document and section titles safely with rtl direction", () => {
    render(
      <SourceList
        sources={[
          source({
            documentTitle: "سياسة المشتريات",
            sectionTitle: "الملخص التنفيذي",
          }),
        ]}
        onOpen={openHandler()}
      />,
    );
    const title = screen.getByText("سياسة المشتريات");
    expect(title.getAttribute("dir")).toBe("rtl");
    expect(title.getAttribute("lang")).toBe("ar");

    const section = screen.getByText("الملخص التنفيذي");
    expect(section.getAttribute("dir")).toBe("rtl");
    expect(section.getAttribute("lang")).toBe("ar");
  });

  it("renders mixed-language titles with per-part direction", () => {
    render(
      <SourceList
        sources={[
          source({
            documentTitle: "Vendor Management Policy 2024",
            sectionTitle: "الملخص التنفيذي",
          }),
        ]}
        onOpen={openHandler()}
      />,
    );
    const title = screen.getByText("Vendor Management Policy 2024");
    expect(title.getAttribute("dir")).toBe("ltr");
    expect(title.getAttribute("lang")).toBe("en");

    const section = screen.getByText("الملخص التنفيذي");
    expect(section.getAttribute("dir")).toBe("rtl");
    expect(section.getAttribute("lang")).toBe("ar");
  });

  it("exposes the source count via the localized heading", () => {
    const sources = [
      source({ chunkId: "c1" }),
      source({ chunkId: "c2" }),
    ];
    render(<SourceList sources={sources} onOpen={openHandler()} />);
    expect(screen.getByText("Sources (2)")).toBeTruthy();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("truncates long document titles and section names safely", () => {
    const longTitle = "Annual Vendor Management Policy " + "x".repeat(200);
    const longSection = "Compliance Subsection Overview " + "y".repeat(120);
    render(
      <SourceList
        sources={[source({ documentTitle: longTitle, sectionTitle: longSection })]}
        onOpen={openHandler()}
      />,
    );
    const title = screen.getByText(longTitle);
    expect(title.className).toContain("truncate");
    const section = screen.getByText(longSection);
    expect(section.className).toContain("truncate");
  });

  it("keeps Arabic document titles truncated without breaking the card layout", () => {
    const longArabic = "سياسة إدارة الموردين السنوية الخاصة بالشركة " + "ل".repeat(150);
    render(
      <SourceList
        sources={[source({ documentTitle: longArabic })]}
        onOpen={openHandler()}
      />,
    );
    const title = screen.getByText(longArabic);
    expect(title.getAttribute("dir")).toBe("rtl");
    expect(title.className).toContain("truncate");
  });
});
