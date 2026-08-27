import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/lib/copy";
import { orgNav } from "@/lib/org-nav";

const PATH = "/o/caregiver-circle/members";
vi.mock("next/navigation", () => ({ usePathname: () => PATH }));

const { OrgNav, NAV_ICONS } = await import("@/app/o/[slug]/org-nav");
const sections = orgNav("caregiver-circle", "org_owner");
const renderNav = () => render(<OrgNav sections={sections} />);

describe("OrgNav (§7.7)", () => {
  it("renders every item it is handed and nothing else", () => {
    renderNav();
    const expected = sections.flatMap((s) => s.items).length;
    expect(screen.getAllByRole("link")).toHaveLength(expected);
  });

  it("is a labelled landmark (§9)", () => {
    renderNav();
    expect(screen.getByRole("navigation", { name: copy.orgNav.landmark })).toBeInTheDocument();
  });

  it("marks exactly one item as the current page", () => {
    renderNav();
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", PATH);
  });

  it("inverts the active item to an ink fill behind a terracotta rule", () => {
    renderNav();
    const active = screen.getByRole("link", { current: "page" });
    expect(active).toHaveClass("border-terracotta", "bg-deep-slate", "text-parchment");
  });

  it("gives inactive items the ochre hover rule, not a fill", () => {
    renderNav();
    const inactive = screen.getAllByRole("link").find((l) => !l.getAttribute("aria-current"))!;
    expect(inactive).toHaveClass("border-transparent", "hover:border-hearth-ochre");
    expect(inactive.className).not.toContain("bg-deep-slate");
  });

  /**
   * §7.7's own example sets the description to text-deep-slate/45, which
   * measures 2.83:1 on parchment. CLAUDE.md requires WCAG AA verified at
   * rendered size, so this ships at /70 (6.18:1) instead. Asserted so the
   * doc's literal value cannot be restored by a later session reading §7.7.
   */
  it("keeps the description above AA rather than at the value §7.7 prints", () => {
    renderNav();
    const description = screen.getByText(copy.orgNav.items.home.description);
    expect(description.className).toMatch(/text-deep-slate\/70/);
    expect(description.className).not.toMatch(/text-deep-slate\/(45|50|55|60)\b/);
  });

  it("heads the manage section and leaves the primary section unheaded", () => {
    renderNav();
    expect(screen.getByText(copy.orgNav.sections.manage)).toBeInTheDocument();
    expect(screen.queryByText(copy.orgNav.sections.community)).not.toBeInTheDocument();
  });

  it("renders label and description as separate lines per item", () => {
    renderNav();
    const home = screen.getByRole("link", { name: /Home/ });
    expect(home).toHaveTextContent(copy.orgNav.items.home.label);
    expect(home).toHaveTextContent(copy.orgNav.items.home.description);
  });
});

/**
 * §10.1. The icon depicts the item's own title, so a reader who covers the
 * label still knows where the row goes.
 */
describe("navigation icons (§10.1)", () => {
  it("resolves an icon for every item in the map", () => {
    for (const item of sections.flatMap((s) => s.items)) {
      // lucide icons are forwardRef objects, not plain functions.
      expect(NAV_ICONS[item.icon], `no icon for ${item.label}`).toBeDefined();
    }
  });

  it("renders one icon per nav row", () => {
    const { container } = renderNav();
    const rows = sections.flatMap((s) => s.items).length;
    expect(container.querySelectorAll("a svg")).toHaveLength(rows);
  });

  it("keeps every icon decorative -- the label carries the meaning", () => {
    const { container } = renderNav();
    for (const svg of container.querySelectorAll("a svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg.getAttribute("class")).toContain("size-5");
    }
  });

  it("reuses the subject's icon for its Manage counterpart", () => {
    const all = sections.flatMap((s) => s.items);
    const pairs: [string, string][] = [
      ["/mentorship", "/settings/mentorship"],
      ["/meetups", "/settings/meetups"],
      ["/videos", "/settings/videos"],
      ["/live", "/settings/live"],
    ];
    for (const [publicPath, settingsPath] of pairs) {
      const subject = all.find((i) => i.href.endsWith(publicPath))!;
      const setting = all.find((i) => i.href.endsWith(settingsPath))!;
      expect(setting.icon).toBe(subject.icon);
    }
  });

  it("draws icons in currentColor, so they inherit the row state", () => {
    const { container } = renderNav();
    for (const svg of container.querySelectorAll("a svg")) {
      expect(svg.getAttribute("class")).not.toMatch(/\btext-(terracotta|hearth-ochre|baked-clay)\b/);
    }
  });
});

/**
 * Nested routes exist under four nav hrefs -- videos/upload,
 * videos/[videoAssetId], live/[liveStreamId], members/report -- and a strict
 * pathname equality check left every one of them with nothing highlighted.
 */
describe("active state on nested routes", () => {
  const renderAt = async (path: string) => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({ usePathname: () => path }));
    const mod = await import("@/app/o/[slug]/org-nav");
    return render(<mod.OrgNav sections={orgNav("caregiver-circle", "org_owner")} />);
  };

  it.each([
    ["/o/caregiver-circle/videos/upload", "Videos"],
    ["/o/caregiver-circle/videos/abc123", "Videos"],
    ["/o/caregiver-circle/members/report", "Members"],
  ])("%s keeps %s lit", async (path, label) => {
    const { container } = await renderAt(path);
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(label);
  });

  it("keeps the org home exact -- it must not match every page in the org", async () => {
    const { container } = await renderAt("/o/caregiver-circle/members");
    const current = container.querySelector('[aria-current="page"]')!;
    expect(current).toHaveTextContent("Members");
    expect(current).not.toHaveTextContent("The shared feed");
  });

  it("does not let /settings/members swallow /settings/member-reports", async () => {
    const { container } = await renderAt("/o/caregiver-circle/settings/member-reports");
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Member reports");
  });
});
