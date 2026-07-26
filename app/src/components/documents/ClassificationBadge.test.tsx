import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { ClassificationBadge } from "./ClassificationBadge";

function render(level?: string) { return renderToStaticMarkup(<I18nProvider><div dir="ltr"><ClassificationBadge level={level} /></div></I18nProvider>); }

describe("ClassificationBadge", () => {
  it.each([["internal", "Internal"], ["restricted", "Restricted"], ["confidential", "Confidential"], ["highly_confidential", "Highly confidential"]])("renders %s with text and an icon", (level, label) => { const html = render(level); expect(html).toContain(label); expect(html).toContain("material-symbols-outlined"); expect(html).toContain("access is not implied"); });
  it("fails safely for a missing or unknown classification", () => { expect(render("public")).toContain("Classification unavailable"); expect(render()).toContain("help"); });
  it("uses logical spacing compatible with RTL/LTR", () => { expect(render("restricted")).toContain("me-1"); expect(render("restricted")).not.toContain("ml-"); });
});
