import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PermissionStatus } from "@/components/auth/permission-boundary";
import { I18nProvider } from "@/providers/i18n-provider";

function render(kind: "loading" | "denied" | "failed") {
  return renderToStaticMarkup(
    <I18nProvider>
      <PermissionStatus kind={kind} />
    </I18nProvider>,
  );
}

describe("permission access states", () => {
  it("announces loading without rendering privileged children", () => {
    const html = render("loading");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("Checking access");
  });

  it("renders a stable access-denied message", () => {
    const html = render("denied");
    expect(html).toContain("Access denied");
    expect(html).toContain("You do not have permission");
  });

  it("renders fail-closed feedback and a retry control", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <PermissionStatus kind="failed" onRetry={() => undefined} />
      </I18nProvider>,
    );
    expect(html).toContain("Unable to verify access");
    expect(html).toContain("<button");
    expect(html).toContain("Retry");
  });
});
