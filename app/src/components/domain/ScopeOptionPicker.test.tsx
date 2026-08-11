// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScopeOptionPicker } from "./ScopeOptionPicker";
import type { PermissionScopes } from "@/types/api/permissions.types";
import type { RoleScopeOption } from "@/types/api/users.types";
import { t as translateKey } from "@/lib/i18n/i18n.utils";
import dictionaries from "@/lib/i18n/translations";

const en = dictionaries.en;

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({
    locale: "en",
    dir: "ltr",
    t: (key: string, params?: Record<string, string>) =>
      translateKey(en, key, params),
  }),
}));

const unrestrictedScope = (): PermissionScopes => ({
  selfOnly: false,
  departmentIds: [],
  documentCategories: [],
  documentClassifications: [],
});

const finance: RoleScopeOption = {
  id: "dept-finance",
  name: "Finance",
  normalizedName: "finance",
  status: "active",
};

const engineering: RoleScopeOption = {
  id: "dept-engineering",
  name: "Engineering",
  normalizedName: "engineering",
  status: "active",
};

const legacyDept: RoleScopeOption = {
  id: "dept-legacy",
  name: "Legacy Dept",
  normalizedName: "legacy dept",
  status: "archived",
};

const invoices: RoleScopeOption = {
  id: "cat-invoices",
  name: "Invoices",
  normalizedName: "invoices",
  status: "active",
};

describe("ScopeOptionPicker", () => {
  it("renders id-keyed selections by display name", () => {
    render(
      <ScopeOptionPicker
        label="Departments"
        options={[finance, engineering]}
        archived={[legacyDept]}
        selected={[finance.id, legacyDept.id]}
        valueKey="id"
        dimension="departmentIds"
        actorScope={unrestrictedScope()}
        loading={false}
        error={null}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("Finance")).toBeTruthy();
    expect(screen.getByText("Legacy Dept")).toBeTruthy();
    expect(screen.getByText("archived")).toBeTruthy();
    expect(screen.queryByText("unknown")).toBeNull();
  });

  it("resolves name-keyed selections case-insensitively", () => {
    render(
      <ScopeOptionPicker
        label="Document categories"
        options={[invoices]}
        archived={[]}
        selected={[" INVOICES "]}
        valueKey="name"
        dimension="documentCategories"
        actorScope={unrestrictedScope()}
        loading={false}
        error={null}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("Invoices")).toBeTruthy();
  });

  it("flags unresolved stored values as unknown", () => {
    render(
      <ScopeOptionPicker
        label="Departments"
        options={[finance]}
        archived={[]}
        selected={["missing-dept-id"]}
        valueKey="id"
        dimension="departmentIds"
        actorScope={unrestrictedScope()}
        loading={false}
        error={null}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("missing-dept-id")).toBeTruthy();
    expect(screen.getByText("unknown")).toBeTruthy();
  });

  it("marks selections outside the actor scope", () => {
    render(
      <ScopeOptionPicker
        label="Departments"
        options={[finance, engineering]}
        archived={[]}
        selected={[engineering.id]}
        valueKey="id"
        dimension="departmentIds"
        actorScope={{
          ...unrestrictedScope(),
          departmentIds: [finance.id],
        }}
        loading={false}
        error={null}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("outside your scope")).toBeTruthy();
  });

  it("only offers options within the actor scope", () => {
    render(
      <ScopeOptionPicker
        label="Departments"
        options={[finance, engineering]}
        archived={[]}
        selected={[]}
        valueKey="id"
        dimension="departmentIds"
        actorScope={{
          ...unrestrictedScope(),
          departmentIds: [finance.id],
        }}
        loading={false}
        error={null}
        onChange={() => undefined}
      />,
    );
    const addControl = screen.getByRole("combobox");
    const selectable = within(addControl).getAllByRole("option");
    expect(selectable.map((option) => option.textContent)).toEqual([
      "Select an option...",
      "Finance",
    ]);
  });

  it("appends a new value when an option is selected", async () => {
    const onChange = vi.fn();
    render(
      <ScopeOptionPicker
        label="Departments"
        options={[finance, engineering]}
        archived={[]}
        selected={[finance.id]}
        valueKey="id"
        dimension="departmentIds"
        actorScope={unrestrictedScope()}
        loading={false}
        error={null}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox"),
      engineering.id,
    );
    expect(onChange).toHaveBeenCalledWith([finance.id, engineering.id]);
  });

  it("removes a value when its chip is dismissed", async () => {
    const onChange = vi.fn();
    render(
      <ScopeOptionPicker
        label="Departments"
        options={[finance, engineering]}
        archived={[]}
        selected={[finance.id, engineering.id]}
        valueKey="id"
        dimension="departmentIds"
        actorScope={unrestrictedScope()}
        loading={false}
        error={null}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByLabelText("Remove Finance"));
    expect(onChange).toHaveBeenCalledWith([engineering.id]);
  });

  it("shows the loading message while options are pending", () => {
    render(
      <ScopeOptionPicker
        label="Departments"
        options={[]}
        archived={[]}
        selected={[]}
        valueKey="id"
        dimension="departmentIds"
        actorScope={unrestrictedScope()}
        loading
        error={null}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("Loading options...")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("surfaces the load error when options could not be fetched", () => {
    render(
      <ScopeOptionPicker
        label="Departments"
        options={[]}
        archived={[]}
        selected={[]}
        valueKey="id"
        dimension="departmentIds"
        actorScope={unrestrictedScope()}
        loading={false}
        error="boom"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("reports when every addable option is already selected", () => {
    render(
      <ScopeOptionPicker
        label="Departments"
        options={[finance]}
        archived={[]}
        selected={[finance.id]}
        valueKey="id"
        dimension="departmentIds"
        actorScope={unrestrictedScope()}
        loading={false}
        error={null}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("No more options available.")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
