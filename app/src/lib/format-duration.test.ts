import { describe, expect, it } from "vitest";
import { formatDurationMs } from "./format-duration";

describe("formatDurationMs", () => {
  it("renders short durations compactly", () => {
    expect(formatDurationMs(0)).toBe("0s");
    expect(formatDurationMs(4_200)).toBe("4s");
    expect(formatDurationMs(65_000)).toBe("1m 5s");
  });

  it("renders longer durations in day-hour-minute form", () => {
    expect(
      formatDurationMs(2 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000),
    ).toBe("2d 4h 12m");
  });
});
