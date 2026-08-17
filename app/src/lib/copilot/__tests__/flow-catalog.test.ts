import { describe, it, expect } from "vitest";
import type { GuideFlowMeta } from "@/lib/copilot/copilot-types";
import {
  CATEGORY_ORDER,
  partitionFlows,
  groupFlowsByCategory,
} from "@/lib/copilot/flow-catalog";

function meta(flowId: string, overrides: Partial<GuideFlowMeta> = {}): GuideFlowMeta {
  return { flowId, title: flowId, category: "documents", available: true, ...overrides };
}

const flows: GuideFlowMeta[] = [
  meta("documents.upload", { audience: "employee" }),
  meta("documents.search", { audience: "employee" }),
  meta("chat.ask", { audience: "employee" }),
  meta("users.invite", { audience: "admin" }),
  meta("roles.create", { audience: "admin" }),
  meta("platform.tour", { audience: "all" }),
];

describe("flow catalog ranking", () => {
  it("partitions employee/all flows into recommended for non-admin layouts", () => {
    const { recommended, rest } = partitionFlows(flows);
    expect(recommended.map((flow) => flow.flowId)).toEqual([
      "documents.upload",
      "documents.search",
      "chat.ask",
      "platform.tour",
    ]);
    expect(rest.map((flow) => flow.flowId)).toEqual(["users.invite", "roles.create"]);
  });

  it("keeps unknown audience flows out of recommended", () => {
    const { recommended } = partitionFlows([meta("custom.flow")]);
    expect(recommended).toEqual([]);
  });

  it("groups by category in the canonical order", () => {
    const groups = groupFlowsByCategory([
      meta("chat.ask", { category: "chat" }),
      meta("documents.upload", { category: "documents" }),
      meta("billing.open", { category: "billing" }),
    ]);
    expect(groups.map((group) => group.category)).toEqual([
      "documents",
      "billing",
      "chat",
    ]);
    expect(groups[1].flows.map((flow) => flow.flowId)).toEqual(["billing.open"]);
  });

  it("orders categories deterministically and drops unknown ones", () => {
    const groups = groupFlowsByCategory([
      meta("weird.flow", { category: "mystery" as never }),
      meta("documents.upload"),
    ]);
    expect(groups.map((group) => group.category)).toEqual(["documents"]);
    expect(CATEGORY_ORDER).toContain("documents");
  });
});