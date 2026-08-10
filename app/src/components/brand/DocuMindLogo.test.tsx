// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocuMindLogo } from "./DocuMindLogo";

describe("DocuMindLogo", () => {
  it("renders the readable full wordmark with an internal SVG", () => {
    const { container } = render(<DocuMindLogo />);

    expect(screen.getByText("DocuMind")).toBeTruthy();
    expect(screen.getByText("AI")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelectorAll("circle")).toHaveLength(6);
    expect(container.querySelectorAll("path")).toHaveLength(4);
    expect(container.querySelector('img[src^="http"]')).toBeNull();
  });

  it("renders the icon variant with an accessible brand label", () => {
    render(<DocuMindLogo variant="icon" />);

    expect(screen.getByRole("img", { name: "DocuMind AI" })).toBeTruthy();
    expect(screen.getByRole("img").querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("img").querySelectorAll("circle")).toHaveLength(6);
  });

  it("keeps the document and network geometry at compact mark sizes", () => {
    for (const size of ["h-6 w-6", "h-7 w-7", "h-8 w-8", "h-10 w-10"]) {
      const { container } = render(
        <DocuMindLogo variant="icon" className={size} />,
      );
      const svg = container.querySelector("svg");

      expect(svg?.getAttribute("viewBox")).toBe("0 0 48 48");
      expect(svg?.querySelectorAll("circle")).toHaveLength(6);
      expect(svg?.querySelectorAll("path")).toHaveLength(4);
    }
  });

  it("keeps outer network nodes beyond the document edge", () => {
    const { container } = render(<DocuMindLogo variant="icon" />);
    const circles = [...container.querySelectorAll("circle")];

    expect(circles.some((circle) => circle.getAttribute("cx") === "37")).toBe(true);
  });
});
