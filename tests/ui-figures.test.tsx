import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, Stamp, StatusPip, Textarea } from "@/components/ui";
describe("Stamp (§7.4)", () => {
  it("frames from currentColor so setting the text color sets the frame", () => {
    render(<Stamp className="text-baked-clay">Definition recorded</Stamp>);
    const s = screen.getByText("Definition recorded");
    expect(s).toHaveClass("stamp", "text-baked-clay");
  });
});

describe("Avatar (§7.5)", () => {
  it("is square, never a circle, and bordered at 2px", () => {
    render(<Avatar initials="MA" />);
    const a = screen.getByText("MA");
    expect(a).toHaveClass("border-2", "border-deep-slate", "font-mono");
    expect(a.className).not.toMatch(/rounded/);
  });

  it("rotates the accent fill across the four specified colors", () => {
    const fills = [0, 1, 2, 3].map((i) => {
      const { container } = render(<Avatar initials="XX" index={i} />);
      return container.firstElementChild!.className;
    });
    expect(fills[0]).toContain("bg-terracotta");
    expect(fills[1]).toContain("bg-hearth-ochre");
    expect(fills[2]).toContain("bg-baked-clay");
    expect(fills[3]).toContain("bg-deep-slate");
  });

  it("flips its label to ink on the ochre fill, which is 1.74:1 against parchment", () => {
    const { container } = render(<Avatar initials="XX" index={1} />);
    expect(container.firstElementChild!.className).toContain("text-deep-slate");
  });
});

describe("StatusPip (§7.6)", () => {
  it("is always square, always bordered, and always labelled", () => {
    render(<StatusPip label="Mara: Confirmed" />);
    const p = screen.getByLabelText("Mara: Confirmed");
    expect(p).toHaveClass("border-2", "border-deep-slate", "size-3");
    expect(p.className).not.toMatch(/rounded/);
  });

  it("drops to size-2 on ink", () => {
    render(<StatusPip label="x" surface="ink" />);
    expect(screen.getByLabelText("x")).toHaveClass("size-2");
  });
});

describe("Textarea (§7.2)", () => {
  it("matches the field treatment -- drawn, not filled", () => {
    render(<Textarea aria-label="t" />);
    const t = screen.getByLabelText("t");
    expect(t).toHaveClass("bg-transparent");
    expect(t.className).not.toMatch(/\bbg-white\b/);
  });

  it("merges a caller className", () => {
    render(<Textarea aria-label="t" className="min-h-40" />);
    expect(screen.getByLabelText("t")).toHaveClass("min-h-40", "bg-transparent");
  });
});
