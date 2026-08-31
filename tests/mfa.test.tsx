import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TOTP enrollment's action and component (S2, PR 7).
 *
 * The happy path is proven against a real GoTrue in tests/e2e/mfa.spec.ts,
 * which derives a genuine code from the displayed secret. What is asserted here
 * is everything that would be tedious or impossible to reach in a browser: the
 * cleanup of abandoned setups, an unowned factor id, and the shape of each step.
 */

const mfa = vi.hoisted(() => ({
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  listFactors: vi.fn(),
  unenroll: vi.fn(),
}));
const getUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser, mfa } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const { enrollTotp, unenrollTotp } = await import("@/app/actions/mfa");
const { TOTP_ENROLL_IDLE } = await import("@/lib/auth/totp-state");
const { TotpEnrollment } = await import("@/components/auth/totp-enrollment");
const { copy } = await import("@/lib/copy");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const QR = "data:image/svg+xml;utf-8,<svg></svg>";

beforeEach(() => {
  getUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mfa.listFactors.mockReset().mockResolvedValue({ data: { all: [], totp: [] }, error: null });
  mfa.enroll
    .mockReset()
    .mockResolvedValue({
      data: { id: "factor-1", totp: { qr_code: QR, secret: "SECRET", uri: "otpauth://x" } },
      error: null,
    });
  mfa.challenge.mockReset().mockResolvedValue({ data: { id: "challenge-1" }, error: null });
  mfa.verify.mockReset().mockResolvedValue({ data: {}, error: null });
  mfa.unenroll.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe("starting setup", () => {
  it("enrolls and hands back the QR and the setup key", async () => {
    const state = await enrollTotp(TOTP_ENROLL_IDLE, form({}));
    expect(state.step).toBe("scan");
    expect(state.factorId).toBe("factor-1");
    expect(state.secret).toBe("SECRET");
    expect(mfa.enroll).toHaveBeenCalledWith(
      expect.objectContaining({ factorType: "totp" }),
    );
  });

  /**
   * enroll() returns the secret exactly once, so an abandoned setup leaves a
   * factor whose QR can never be shown again. Each start therefore clears the
   * unverified leftovers -- and reads `all`, because `.totp` excludes them
   * entirely (measured against a real GoTrue).
   */
  it("clears an abandoned setup before enrolling a fresh one", async () => {
    mfa.listFactors.mockResolvedValue({
      data: {
        all: [
          { id: "stale", status: "unverified" },
          { id: "live", status: "verified" },
        ],
        totp: [{ id: "live", status: "verified" }],
      },
      error: null,
    });

    await enrollTotp(TOTP_ENROLL_IDLE, form({}));

    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "stale" });
    // And never the verified one: that would silently disarm the account.
    expect(mfa.unenroll).not.toHaveBeenCalledWith({ factorId: "live" });
  });

  /**
   * The value is an unencoded `data:...,<svg>` URI, and a `#` in it would start
   * a URI fragment -- truncating the image to a blank square with no error. No
   * `#` appears today; this keeps it that way if GoTrue's generator changes.
   */
  it("escapes a # in the data URI so the image cannot be truncated", async () => {
    mfa.enroll.mockResolvedValue({
      data: {
        id: "factor-1",
        totp: { qr_code: 'data:image/svg+xml;utf-8,<svg fill="#000"/>', secret: "S", uri: "x" },
      },
      error: null,
    });
    const state = await enrollTotp(TOTP_ENROLL_IDLE, form({}));
    expect(state.qrCode).not.toContain("#");
    expect(state.qrCode).toContain("%23000");
  });

  it("reports a failed enrollment without pretending setup started", async () => {
    mfa.enroll.mockResolvedValue({ data: null, error: { message: "nope" } });
    const state = await enrollTotp(TOTP_ENROLL_IDLE, form({}));
    expect(state.step).toBe("idle");
    expect(state.error).toBe(copy.mfa.errors.enrollFailed);
  });
});

describe("verifying a code", () => {
  const scanning = {
    step: "scan" as const,
    factorId: "factor-1",
    qrCode: QR,
    secret: "SECRET",
  };

  it("challenges then verifies, and reports success", async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [{ id: "factor-1", status: "unverified" }], totp: [] },
      error: null,
    });
    const state = await enrollTotp(scanning, form({ code: "123456", factor_id: "factor-1" }));
    expect(mfa.challenge).toHaveBeenCalledWith({ factorId: "factor-1" });
    expect(mfa.verify).toHaveBeenCalledWith({
      factorId: "factor-1",
      challengeId: "challenge-1",
      code: "123456",
    });
    expect(state.step).toBe("done");
  });

  /**
   * The factor id comes from a form field, so it is checked against this user's
   * own factors. GoTrue scopes to the session anyway, but one extra call is
   * cheaper than depending on somebody else's scoping being right.
   */
  it("refuses a factor id the caller does not own, without asking GoTrue to verify", async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [{ id: "mine", status: "unverified" }], totp: [] },
      error: null,
    });
    const state = await enrollTotp(scanning, form({ code: "123456", factor_id: "someone-elses" }));
    expect(state.error).toBe(copy.mfa.errors.setupExpired);
    expect(mfa.verify).not.toHaveBeenCalled();
  });

  /**
   * A wrong code must keep the person on the scan step WITH the secret intact.
   * Dropping back to idle would discard a secret that cannot be shown again and
   * force the whole setup to restart over one mistyped digit.
   */
  it("keeps the setup key on screen when the code is wrong", async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [{ id: "factor-1", status: "unverified" }], totp: [] },
      error: null,
    });
    mfa.verify.mockResolvedValue({ data: null, error: { message: "invalid" } });

    const state = await enrollTotp(scanning, form({ code: "000000", factor_id: "factor-1" }));
    expect(state.step).toBe("scan");
    expect(state.secret).toBe("SECRET");
    expect(state.error).toBe(copy.mfa.errors.wrongCode);
  });

  it("sends a signed-out caller to sign in", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(enrollTotp(TOTP_ENROLL_IDLE, form({}))).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});

describe("removing an authenticator", () => {
  it("removes the named factor", async () => {
    await expect(unenrollTotp(form({ factor_id: "factor-1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/settings/security?removed=1",
    );
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "factor-1" });
  });

  /**
   * GoTrue requires an aal2 session to remove a verified factor, so the refusal
   * is expected rather than exceptional -- and the message has to say what to do
   * about it, since "unenroll failed" leaves someone stuck.
   */
  it("explains what to do when GoTrue wants a verified sign-in first", async () => {
    mfa.unenroll.mockResolvedValue({ data: null, error: { message: "aal2 required" } });
    await expect(unenrollTotp(form({ factor_id: "factor-1" }))).rejects.toThrow(
      new RegExp(encodeURIComponent("Sign out, sign in with a code").slice(0, 30)),
    );
  });

  it("refuses a request that names no factor", async () => {
    await expect(unenrollTotp(form({}))).rejects.toThrow(/error=/);
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });
});

describe("the enrollment component", () => {
  it("offers only a start button before setup begins", () => {
    render(<TotpEnrollment />);
    expect(screen.getByRole("button", { name: copy.mfa.start })).toBeTruthy();
    expect(screen.queryByLabelText(copy.mfa.scan.secretLabel)).toBeNull();
  });

});
