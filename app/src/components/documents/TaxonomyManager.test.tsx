// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaxonomyManager } from "./TaxonomyManager";

const api = vi.hoisted(() => ({
  listTaxonomy: vi.fn(),
  createTaxonomy: vi.fn(),
  updateTaxonomy: vi.fn(),
  changeTaxonomyStatus: vi.fn(),
  classifyPolicyError: vi.fn(),
}));

vi.mock("@/services/document-policy.service", () => api);
vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
  useIntlLocale: () => "en-US",
}));
vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => ({ can: () => true }),
}));

describe("TaxonomyManager duplicate handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listTaxonomy.mockResolvedValue({ data: { categories: [], pagination: { totalPages: 1 } } });
    api.classifyPolicyError.mockReturnValue("taxonomy_duplicate");
  });

  it("keeps a duplicate error visible and actionable inside the active dialog", async () => {
    const user = userEvent.setup();
    api.createTaxonomy.mockRejectedValueOnce(new Error("duplicate"));
    api.createTaxonomy.mockResolvedValueOnce({});

    render(<TaxonomyManager />);
    await waitFor(() => expect(api.listTaxonomy).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /taxonomy\.create/i }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByRole("textbox", { name: /taxonomy\.name/i });
    await user.type(name, "Human Resources");
    await user.click(within(dialog).getByRole("button", { name: /common\.save/i }));

    const error = (await within(dialog).findAllByRole("alert"))[0];
    expect(error.textContent).toContain("taxonomy.duplicateError");
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.clear(name);
    await user.type(name, "People Operations");
    await user.click(within(dialog).getByRole("button", { name: /common\.save/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.createTaxonomy).toHaveBeenCalledTimes(2);
  });
});
