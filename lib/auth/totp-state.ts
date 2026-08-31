/**
 * The shape TOTP enrollment carries between its two steps, and the value it
 * starts from.
 *
 * A module of its own rather than living beside the action, and not by
 * preference: a `"use server"` file may export **only async functions**. Putting
 * `TOTP_ENROLL_IDLE` in app/actions/mfa.ts made every page importing it fail at
 * module evaluation with `A "use server" file can only export async functions,
 * found object` -- at runtime, in the browser. `tsc --noEmit` and eslint both
 * passed on it, which is why this comment exists: the constraint is invisible to
 * both, and the next person to add a constant next to a server action will hit
 * it the same way.
 *
 * The type alone would have been fine (types are erased). The object is not.
 */
export type TotpEnrollState = {
  /** `idle` before setup starts, `scan` while a secret is on screen awaiting a
   *  code, `done` once GoTrue has accepted one. */
  step: "idle" | "scan" | "done";
  factorId?: string;
  /** A data: URI, not markup -- so it renders in an <img> with no
   *  dangerouslySetInnerHTML. Measured, see app/actions/mfa.ts. */
  qrCode?: string;
  secret?: string;
  error?: string;
};

export const TOTP_ENROLL_IDLE: TotpEnrollState = { step: "idle" };
