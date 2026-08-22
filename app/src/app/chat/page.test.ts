import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn((path: string): never => {
  throw new Error(`REDIRECT:${path}`);
}));

vi.mock("next/navigation", () => ({ redirect }));

import ChatPage from "./page";

describe("legacy chat route", () => {
  it("forwards users to the live protected assistant instead of a placeholder screen", () => {
    expect(() => ChatPage()).toThrow("REDIRECT:/dashboard/chat");
    expect(redirect).toHaveBeenCalledWith("/dashboard/chat");
  });
});
