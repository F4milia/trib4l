import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, Card, ErrorText, Input, Label, PageHeading, Select } from "@/components/ui";

/**
 * The primitives carry Hearth & Material for 30 of 34 pages, so these assert
 * the §7 contract rather than the rendering. Class-level assertions are the
 * point here: a design system's contract IS its classes, and this is what
 * stops a later session quietly reintroducing a fill, a blur, or a radius.
 */

describe("Card (§7.3)", () => {
  it("defaults to the ink panel on paper -- the default container treatment", () => {
    const { container } = render(<Card>body</Card>);
    expect(container.firstElementChild).toHaveClass("panel-ink", "bg-parchment");
  });

  it("offers the inverted panel with its terracotta registration shadow", () => {
    const { container } = render(<Card treatment="dark">body</Card>);
    expect(container.firstElementChild).toHaveClass("panel-dark", "bg-deep-slate", "text-parchment");
  });

  it("offers the flat/quiet treatment for forms and dense lists", () => {
    const { container } = render(<Card treatment="flat">body</Card>);
    const el = container.firstElementChild!;
    expect(el).toHaveClass("shadow-none");
    expect(el.className).not.toContain("panel-ink");
  });

  it("merges a caller className over the treatment", () => {
    const { container } = render(<Card className="mt-8">body</Card>);
    expect(container.firstElementChild).toHaveClass("panel-ink", "mt-8");
  });
});

describe("Button (§7.1)", () => {
  it("renders terracotta on parchment, darkening to baked-clay on hover -- never lighter", () => {
    render(<Button>Go</Button>);
    const b = screen.getByRole("button");
    expect(b).toHaveClass("bg-terracotta", "text-parchment", "hover:bg-baked-clay");
  });

  it.each(["danger", "ghost"] as const)("keeps the existing %s variant working", (variant) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button").className.length).toBeGreaterThan(0);
  });

  it("presses down rather than easing, and never rounds", () => {
    render(<Button>Go</Button>);
    const b = screen.getByRole("button");
    expect(b).toHaveClass("active:translate-y-px", "transition-colors");
    expect(b.className).not.toMatch(/\brounded/);
  });

  it("keeps a visible focus affordance -- with zero radius it is the only one (§9)", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button").className).toMatch(/focus-visible:outline-terracotta/);
  });

  it("appends a caller className", () => {
    render(<Button className="w-full">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("w-full", "bg-terracotta");
  });
});

describe("Input (§7.2)", () => {
  it("is drawn, not filled", () => {
    render(<Input aria-label="f" />);
    const i = screen.getByLabelText("f");
    expect(i).toHaveClass("bg-transparent", "h-11");
    expect(i.className).not.toMatch(/\bbg-white\b/);
  });

  it("overrides the focus ring to solid terracotta, as forms do", () => {
    render(<Input aria-label="f" />);
    expect(screen.getByLabelText("f").className).toMatch(/focus-visible:ring-terracotta/);
  });

  it("drives error state off aria-invalid, never a separate class", () => {
    render(<Input aria-label="f" />);
    expect(screen.getByLabelText("f").className).toMatch(/aria-invalid:border-terracotta/);
  });

  /**
   * Regression. The previous implementation spread {...props} AFTER its own
   * className, so any caller passing className replaced the base styling
   * outright -- app/o/[slug]/settings/stages/page.tsx did, and rendered a
   * bare native input.
   */
  it("merges a caller className instead of being replaced by it", () => {
    render(<Input aria-label="f" className="w-24" />);
    const i = screen.getByLabelText("f");
    expect(i).toHaveClass("w-24", "bg-transparent", "h-11");
  });
});

describe("Select (§7.2)", () => {
  it("is drawn, not filled, and carries a drawn chevron", () => {
    const { container } = render(
      <Select aria-label="s">
        <option>a</option>
      </Select>,
    );
    expect(screen.getByLabelText("s")).toHaveClass("bg-transparent", "appearance-none");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("hides the chevron from assistive tech and from the pointer", () => {
    const { container } = render(
      <Select aria-label="s">
        <option>a</option>
      </Select>,
    );
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    // SVG exposes className as an SVGAnimatedString, so read the attribute.
    expect(svg.getAttribute("class")).toContain("pointer-events-none");
  });

  // Same regression as Input: three call sites pass className="max-w-56".
  it("applies a caller className without discarding its own styling", () => {
    const { container } = render(
      <Select aria-label="s" className="max-w-56">
        <option>a</option>
      </Select>,
    );
    expect(container.firstElementChild).toHaveClass("max-w-56");
    expect(screen.getByLabelText("s")).toHaveClass("bg-transparent");
  });
});

describe("Label (§7.2)", () => {
  it("is a mono micro-label at the specified tracking, dark enough to read", () => {
    render(<Label htmlFor="x">Full name</Label>);
    const l = screen.getByText("Full name");
    expect(l).toHaveClass("font-mono", "uppercase", "text-deep-slate/70");
    expect(l.className).toMatch(/tracking-\[0\.15em\]/);
    // /45 and /50 fall below 4.5:1 at 10px (§9); a field label is never
    // redundant metadata, so it may not use them.
    expect(l.className).not.toMatch(/text-deep-slate\/(45|50|55|60)\b/);
  });
});

describe("ErrorText", () => {
  it("announces itself and frames in terracotta", () => {
    render(<ErrorText>Wrong password</ErrorText>);
    const e = screen.getByRole("alert");
    expect(e).toHaveTextContent("Wrong password");
    expect(e.className).toMatch(/terracotta/);
  });
});

describe("PageHeading (§3.7)", () => {
  it("renders the display voice at the editorial page-title scale", () => {
    render(<PageHeading>The house gathers</PageHeading>);
    const h = screen.getByRole("heading", { level: 1 });
    expect(h).toHaveClass("font-serif", "text-5xl", "sm:text-7xl", "tracking-tighter");
  });

  it("renders an eyebrow above the title in baked-clay when given one", () => {
    render(<PageHeading eyebrow="01 / People">The house gathers</PageHeading>);
    const eyebrow = screen.getByText("01 / People");
    expect(eyebrow).toHaveClass("font-mono", "uppercase", "text-baked-clay");
  });

  it("omits the eyebrow entirely when not given -- no invented placeholder", () => {
    const { container } = render(<PageHeading>Only a title</PageHeading>);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});
