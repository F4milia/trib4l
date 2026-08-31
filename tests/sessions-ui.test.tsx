import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Session management's UI and actions (S2, PR 6).
 *
 * The page itself is a server component reading an RPC, so what is asserted
 * here is everything around it: the confirmation's contract, what each action
 * does and does not do, and that the copy does not promise more than PR 5
 * measured revocation to deliver.
 */

const rpc = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, from, auth: { getUser, signOut } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const { ConfirmSubmit } = await import("@/components/confirm-submit");
const { revokeSession, signOutEverywhere } = await import("@/app/actions/sessions");
const { copy } = await import("@/lib/copy");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
  from.mockReset();
  signOut.mockReset().mockResolvedValue({ error: null });
  getUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id: "user-1", email: "a@f4milia.test" } }, error: null });
});

describe("ConfirmSubmit", () => {
  const props = {
    action: () => {},
    trigger: "Sign out everywhere",
    title: "End every session?",
    consequences: ["Everything ends.", "Including this device."],
    confirmLabel: "End every session",
  };

  it("names every consequence, not just the first", () => {
    render(<ConfirmSubmit {...props} />);
    // CLAUDE.md: the confirm dialog names what will happen. A list, because
    // these actions have more than one effect and prose buries the second.
    expect(screen.getByText("Everything ends.")).toBeTruthy();
    expect(screen.getByText("Including this device.")).toBeTruthy();
  });

  it("keeps the dialog closed until the trigger is used", () => {
    const { container } = render(<ConfirmSubmit {...props} />);
    expect(container.querySelector("dialog")!.hasAttribute("open")).toBe(false);
  });

  /**
   * The trigger must not be a submit. If it were, a browser with JS disabled --
   * or one that renders before hydration -- would perform the destructive action
   * on the first click with no confirmation at all.
   */
  it("opens with a button that cannot submit the form", () => {
    render(<ConfirmSubmit {...props} />);
    expect(screen.getByRole("button", { name: props.trigger }).getAttribute("type")).toBe("button");
  });

  it("confirms with a real submit inside the form, so no script re-posts anything", () => {
    const { container } = render(<ConfirmSubmit {...props} />);
    const dialog = container.querySelector("dialog")!;
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === props.confirmLabel,
    )!;
    expect(confirm.getAttribute("type")).toBe("submit");
    expect(container.querySelector("form")!.contains(dialog)).toBe(true);
  });

  it("is labelled for a screen reader", () => {
    const { container } = render(<ConfirmSubmit {...props} />);
    const dialog = container.querySelector("dialog")!;
    const labelledBy = dialog.getAttribute("aria-labelledby")!;
    expect(dialog.querySelector(`#${labelledBy}`)!.textContent).toBe(props.title);
  });

  it("passes hidden fields through to the action", () => {
    const { container } = render(<ConfirmSubmit {...props} hidden={{ session_id: "abc" }} />);
    const input = container.querySelector('input[name="session_id"]') as HTMLInputElement;
    expect(input.value).toBe("abc");
  });
});

describe("revokeSession", () => {
  it("passes the id to the database and reports success", async () => {
    await expect(revokeSession(form({ session_id: "s-1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/settings/sessions?revoked=1",
    );
    expect(rpc).toHaveBeenCalledWith("revoke_my_session", { p_session_id: "s-1" });
  });

  /**
   * `false` means the row was already gone -- expired, or signed out on that
   * device a moment ago. The person asked for it to be gone and it is gone, so
   * this is not an error. It is also indistinguishable from "not yours", which
   * the database function makes deliberate.
   */
  it("treats an already-ended session as done, not as a failure", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(revokeSession(form({ session_id: "s-1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/settings/sessions?revoked=already",
    );
  });

  it("refuses a request that names no session", async () => {
    await expect(revokeSession(form({}))).rejects.toThrow(/error=/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends a signed-out caller to sign in", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(revokeSession(form({ session_id: "s-1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  /**
   * The action touches no table directly -- the RPC is its only database call.
   * Ownership is enforced inside revoke_my_session by `user_id = auth.uid()`,
   * and the audit row is written in that same transaction; a second copy of
   * either here would be the app-layer check invariant 5 warns about.
   *
   * Asserted behaviourally. My first version grepped the source for `user_id`
   * and failed on the comment explaining why it is not there -- the same
   * false-positive trap surface-migration.test.ts already documents.
   */
  it("reaches the database only through the RPC", async () => {
    await expect(revokeSession(form({ session_id: "s-1" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("signOutEverywhere", () => {
  it("ends every session through the database, in one transaction", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    await expect(signOutEverywhere()).rejects.toThrow("NEXT_REDIRECT:/login?signed_out=all");
    expect(rpc).toHaveBeenCalledWith("revoke_all_my_sessions");
  });

  /**
   * The reason this action does not use supabase.auth.signOut({ scope: "global"
   * }) -- which is what it did first. GoTrue would delete the rows itself, so
   * the audit row would have to be written from here: an app-layer audit call
   * outside the mutation's transaction, which invariant 5 rules out.
   */
  it("writes no audit row from the app layer", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    await expect(signOutEverywhere()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(from).not.toHaveBeenCalled();
  });

  it("clears only this browser's cookies afterwards, never a second global call", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    await expect(signOutEverywhere()).rejects.toThrow(/NEXT_REDIRECT/);
    // The sessions are already gone server-side; a global scope here would be a
    // second revoke against rows that no longer exist.
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps the person on the page if the revoke failed", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(signOutEverywhere()).rejects.toThrow(/\/settings\/sessions\?error=/);
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("the copy does not over-promise", () => {
  /**
   * PR 5 measured what revocation actually does: GoTrue refuses the old token,
   * so pages and actions stop working -- but a raw access token can still read
   * the Data API until it expires. So the dialog must not claim instant,
   * total sign-out.
   */
  const consequences = copy.sessions.signOutAll.consequences.join(" ").toLowerCase();

  it("says this device is included", () => {
    expect(consequences).toContain("including this one");
  });

  it("says when other devices actually lose access, rather than claiming instantly", () => {
    expect(consequences).toContain("next time they load a page");
    expect(consequences).not.toContain("immediately");
    expect(consequences).not.toContain("instantly");
  });

  it("says what is NOT affected, so ending sessions is not confused with deleting", () => {
    expect(consequences).toContain("nothing else changes");
  });
});
