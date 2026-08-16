import { describe, it, expect } from "vitest";
import { mbPerGb, mbToGb } from "./storage";

describe("mbPerGb", () => {
  it("reads cleanly-divisible-by-1000 figures as decimal GB", () => {
    expect(mbPerGb(1000)).toBe(1000);
    expect(mbPerGb(5000)).toBe(1000);
    expect(mbPerGb(0)).toBe(1000);
  });

  it("reads everything else as binary GB", () => {
    expect(mbPerGb(1024)).toBe(1024);
    expect(mbPerGb(5120)).toBe(1024);
    expect(mbPerGb(2500)).toBe(1024);
  });
});

describe("mbToGb", () => {
  it("converts round decimal plan sizes to whole GB", () => {
    expect(mbToGb(1000)).toBe(1);
    expect(mbToGb(5000)).toBe(5);
  });

  it("converts binary plan sizes to whole GB", () => {
    expect(mbToGb(1024)).toBe(1);
    expect(mbToGb(5120)).toBe(5);
    expect(mbToGb(10240)).toBe(10);
  });

  /* The bug this helper exists to prevent: usage and limit rendered on
     different bases read as headroom that is not there. */
  it("keeps usage and limit on one base when a divisor is pinned", () => {
    const limit = 5000;
    const divisor = mbPerGb(limit);
    expect(mbToGb(limit, divisor)).toBe(5);
    expect(mbToGb(5000, divisor)).toBe(5); // full usage reads as full
  });

  it("pins a binary limit's base for decimal-looking usage", () => {
    const divisor = mbPerGb(5120);
    expect(mbToGb(5120, divisor)).toBe(5);
    expect(mbToGb(3000, divisor)).toBeCloseTo(2.93, 2);
  });

  it("honours an explicit divisor over the inferred one", () => {
    expect(mbToGb(1000, 1024)).toBeCloseTo(0.977, 3);
    expect(mbToGb(1024, 1000)).toBe(1.024);
  });
});
