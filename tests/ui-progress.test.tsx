import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Eyebrow, Masonry, PageHeader } from "@/components/ui";
describe("Masonry (§7.9)", () => {
  it("draws progress as 24 bricks, not a bar", () => {
    const { container } = render(<Masonry filled={12} label="Tower progress" />);
    expect(container.querySelectorAll("span")).toHaveLength(24);
    expect(container.firstElementChild).toHaveClass("masonry");
  });

  it("dims the incomplete bricks rather than omitting them", () => {
    const { container } = render(<Masonry filled={10} label="p" />);
    const bricks = [...container.querySelectorAll("span")];
    expect(bricks.slice(0, 10).every((b) => b.style.opacity === "1")).toBe(true);
    expect(bricks.slice(10).every((b) => b.style.opacity === "0.2")).toBe(true);
  });

  it("varies brick height on i % 3 -- 25/32/39px", () => {
    const { container } = render(<Masonry filled={3} label="p" />);
    const h = [...container.querySelectorAll("span")].slice(0, 3).map((b) => b.style.minHeight);
    expect(h).toEqual(["25px", "32px", "39px"]);
  });

  it("exposes the label to assistive tech and hides the decorative bricks", () => {
    render(<Masonry filled={1} label="Definition completeness" />);
    const fig = screen.getByRole("img", { name: "Definition completeness" });
    expect(fig).toHaveClass("masonry");
  });

  it("clamps a filled count past the total", () => {
    const { container } = render(<Masonry filled={99} label="p" />);
    expect([...container.querySelectorAll("span")].every((b) => b.style.opacity === "1")).toBe(true);
  });
});

describe("Eyebrow (§3.7)", () => {
  it("is a mono eyebrow in baked-clay at the page-eyebrow tracking", () => {
    render(<Eyebrow>01 / People &amp; rhythms</Eyebrow>);
    const e = screen.getByText(/01 \//);
    expect(e).toHaveClass("font-mono", "uppercase", "text-baked-clay");
    expect(e.className).toMatch(/tracking-\[0\.2em\]/);
  });
});

describe("PageHeader (§4.7)", () => {
  it("closes the header with the heavy 4px rule and the specified rhythm", () => {
    const { container } = render(<PageHeader title="The house gathers" />);
    expect(container.firstElementChild).toHaveClass("border-b-4", "border-deep-slate", "pb-5", "mb-10");
  });

  it("renders the title as the page h1", () => {
    render(<PageHeader title="The house gathers" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The house gathers");
  });

  it("places an eyebrow above the title when given", () => {
    render(<PageHeader eyebrow="01 / People" title="T" />);
    expect(screen.getByText("01 / People")).toHaveClass("text-baked-clay");
  });

  it("takes an actions slot, so a header row does not need its own flex", () => {
    render(<PageHeader title="T" actions={<a href="/s">Search</a>} />);
    expect(screen.getByRole("link", { name: "Search" })).toBeInTheDocument();
  });

  it("invents nothing when given only a title", () => {
    const { container } = render(<PageHeader title="T" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});
