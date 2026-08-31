import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "@/components/password-input";
import { copy } from "@/lib/copy";

const t = copy.auth.passwordToggle;

function field() {
  return document.querySelector("input") as HTMLInputElement;
}

describe("PasswordInput", () => {
  it("starts hidden", () => {
    render(<PasswordInput name="password" />);
    expect(field().type).toBe("password");
    expect(screen.getByRole("button", { name: t.show })).toHaveAttribute("aria-pressed", "false");
  });

  it("reveals and hides again", () => {
    render(<PasswordInput name="password" />);
    fireEvent.click(screen.getByRole("button", { name: t.show }));
    expect(field().type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: t.hide }));
    expect(field().type).toBe("password");
  });

  /**
   * Inside a <form> a button's default type is `submit`, so omitting this
   * would make revealing your password submit the form -- with, on /login,
   * whatever had been typed so far.
   */
  it("does not submit the form it sits in", () => {
    let submitted = false;
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitted = true;
        }}
      >
        <PasswordInput name="password" />
      </form>,
    );

    const toggle = screen.getByRole("button", { name: t.show });
    expect(toggle).toHaveAttribute("type", "button");
    fireEvent.click(toggle);
    expect(submitted).toBe(false);
  });

  /* ---------------------------------------------------------------------- */
  /* Accessibility — §9                                                      */
  /* ---------------------------------------------------------------------- */

  it("carries the state on aria-pressed, and a name that flips with it", () => {
    render(<PasswordInput name="password" />);
    const toggle = screen.getByRole("button", { name: t.show });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAccessibleName(t.hide);
  });

  it("points at the field it controls", () => {
    render(<PasswordInput name="password" id="password" />);
    expect(screen.getByRole("button", { name: t.show })).toHaveAttribute("aria-controls", "password");
  });

  it("generates an id when the caller gives none, so aria-controls always resolves", () => {
    render(<PasswordInput name="password" />);
    const target = screen.getByRole("button", { name: t.show }).getAttribute("aria-controls");
    expect(target).toBeTruthy();
    expect(document.getElementById(target!)).toBe(field());
  });

  it("hides the icon from assistive tech -- the button already has a name", () => {
    const { container } = render(<PasswordInput name="password" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps a visible focus affordance and a 44px target", () => {
    render(<PasswordInput name="password" />);
    const toggle = screen.getByRole("button", { name: t.show });
    expect(toggle.className).toContain("focus-visible:outline-terracotta");
    expect(toggle).toHaveClass("size-11");
  });

  /* ---------------------------------------------------------------------- */
  /* It is still the same field underneath                                   */
  /* ---------------------------------------------------------------------- */

  it("forwards the attributes the form and password managers depend on", () => {
    render(
      <PasswordInput name="password" id="password" autoComplete="new-password" required minLength={6} />,
    );
    const input = field();
    expect(input.name).toBe("password");
    expect(input.id).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("new-password");
    expect(input.required).toBe(true);
    expect(input.minLength).toBe(6);
  });

  it("keeps forwarding them after the field is revealed", () => {
    render(<PasswordInput name="password" autoComplete="current-password" required />);
    fireEvent.click(screen.getByRole("button", { name: t.show }));
    expect(field().name).toBe("password");
    expect(field().required).toBe(true);
    expect(field().getAttribute("autocomplete")).toBe("current-password");
  });

  it("keeps what was typed when toggled -- the node is not remounted", () => {
    render(<PasswordInput name="password" />);
    fireEvent.change(field(), { target: { value: "secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: t.show }));
    expect(field().value).toBe("secret-value");
  });

  it("leaves room for the button so the text does not run underneath it", () => {
    render(<PasswordInput name="password" />);
    expect(field()).toHaveClass("pr-11");
  });

  it("merges a caller className rather than dropping the base field styling", () => {
    // CLAUDE.md, 2026-08-27: Input and Select once spread {...props} after
    // their own className, so any caller passing className silently lost every
    // base style. Every primitive merges through cn().
    render(<PasswordInput name="password" className="mt-4" />);
    expect(field()).toHaveClass("mt-4", "pr-11", "h-11");
  });

  /**
   * Nothing is persisted, so every arrival starts hidden. A remembered "show
   * password" would be a shoulder-surfing hazard the person did not opt into
   * on this visit.
   */
  it("does not remember being revealed across mounts", () => {
    const first = render(<PasswordInput name="password" />);
    fireEvent.click(screen.getByRole("button", { name: t.show }));
    expect(field().type).toBe("text");
    first.unmount();

    render(<PasswordInput name="password" />);
    expect(field().type).toBe("password");
  });
});

describe("every password field in the product goes through it", () => {
  /**
   * The forms moved into components/auth/ when field-level errors landed, so
   * this points there rather than at the pages. The obligation is unchanged
   * and the tree-wide guard below is stronger than the per-file counts: it
   * catches a raw password field added anywhere, including a file nobody
   * thought to list here.
   */
  it.each([
    ["components/auth/login-form.tsx", 1],
    ["components/auth/signup-form.tsx", 1],
    ["components/auth/reset-password-form.tsx", 2],
  ])("%s renders %i", async (file, count) => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), file), "utf8");
    expect(src.match(/<PasswordInput\b/g) ?? []).toHaveLength(count);
  });

  it("leaves no raw password field anywhere in app/ or components/", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join, relative } = await import("node:path");

    function walk(dir: string, out: string[] = []): string[] {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.tsx$/.test(entry)) out.push(relative(process.cwd(), full));
      }
      return out;
    }

    const files = ["app", "components"].flatMap((r) => walk(join(process.cwd(), r)));
    expect(files.length).toBeGreaterThan(30);

    for (const file of files) {
      // The primitive is the one place allowed to name the type.
      if (file === "components/password-input.tsx") continue;
      expect(readFileSync(join(process.cwd(), file), "utf8"), `${file} builds a password field by hand`).not.toMatch(
        /type="password"/,
      );
    }
  });
});
