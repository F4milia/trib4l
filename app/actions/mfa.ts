"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TotpEnrollState } from "@/lib/auth/totp-state";
import { copy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";

/**
 * TOTP enrollment, as a two-step action (S2).
 *
 * Step one enrolls and hands back the QR and the secret; step two verifies a
 * code from the authenticator and the factor becomes live. The state travels
 * through useActionState rather than through a cookie or a table, because it is
 * the client's own screen state and nothing about it needs to outlive the tab.
 *
 * WHY A FRESH FACTOR EVERY TIME SETUP STARTS. `enroll()` returns the secret
 * exactly once -- there is no API to read it back -- so a reload during setup
 * would leave an unverified factor whose QR can never be shown again. Each start
 * therefore clears any unverified factors first and enrolls a new one. Nothing
 * verified is ever touched by this path.
 *
 * The state type and its initial value live in lib/auth/totp-state.ts, not
 * here: a `"use server"` file may export ONLY async functions, and exporting
 * the initial-state object from this file broke every page importing it at
 * module evaluation. tsc and eslint both passed on it.
 *
 * Measured 2026-09-01 against the local GoTrue, and both facts matter:
 *   * listFactors().totp EXCLUDES unverified factors -- `all` is the only place
 *     they appear. Reading `.totp` to find leftovers finds nothing, every time.
 *   * totp.qr_code is a data: URI (`data:image/svg+xml;utf-8,<svg…>`), so it
 *     goes straight into an <img src> and needs no dangerouslySetInnerHTML.
 */
export async function enrollTotp(
  prev: TotpEnrollState,
  formData: FormData,
): Promise<TotpEnrollState> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    redirect("/login");
  }

  const code = String(formData.get("code") ?? "").trim();

  /* ------------------------------------------------ step two: verify a code */
  if (code) {
    const factorId = String(formData.get("factor_id") ?? "");

    /**
     * The factor id arrives from the client, so it is checked against this
     * user's own factors rather than trusted. GoTrue would refuse another
     * person's id anyway -- it scopes to the session -- but a check that costs
     * one call is cheaper than relying on someone else's scoping being right.
     */
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const owned = factors?.all?.some((factor) => factor.id === factorId);
    if (!factorId || !owned) {
      return { ...prev, error: copy.mfa.errors.setupExpired };
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError || !challenge) {
      return { ...prev, error: copy.mfa.errors.verifyFailed };
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      // The overwhelmingly common cause is a mistyped or expired code, and
      // naming that is more useful than repeating GoTrue's wording.
      return { ...prev, error: copy.mfa.errors.wrongCode };
    }

    revalidatePath("/settings/security");
    return { step: "done" };
  }

  /* ------------------------------------------------- step one: start setup */
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `authenticator-${Date.now()}`,
  });
  if (error || !data) {
    return { step: "idle", error: copy.mfa.errors.enrollFailed };
  }

  return {
    step: "scan",
    factorId: data.id,
    /**
     * `#` escaped, and this is not superstition: the value is an UNENCODED
     * `data:image/svg+xml;utf-8,<svg…>` URI, and in a URI a `#` starts a
     * fragment -- one `fill="#000"` in the generated SVG would silently truncate
     * the image at that byte, leaving a blank square and no error anywhere.
     *
     * Measured 2026-09-01: GoTrue's current QR contains no `#` at all, so this
     * is a no-op today. It is here because the failure mode if that changes is
     * invisible, and one replace is cheaper than base64-encoding 321 KB.
     */
    qrCode: data.totp.qr_code.replace(/#/g, "%23"),
    secret: data.totp.secret,
  };
}

/**
 * Removes a verified factor.
 *
 * No confirmation dialog here even though it weakens the account, because
 * GoTrue's own rule is the stronger gate: unenrolling a verified factor
 * requires an aal2 session, so the person has already proved possession of the
 * authenticator during this session. A dialog on top of that would be
 * ceremony. If GoTrue refuses, the message says what to do about it rather than
 * repeating the error.
 */
export async function unenrollTotp(formData: FormData) {
  const factorId = String(formData.get("factor_id") ?? "");
  if (!factorId) {
    redirect("/settings/security?error=" + encodeURIComponent(copy.mfa.errors.removeFailed));
  }

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    redirect("/login");
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    redirect("/settings/security?error=" + encodeURIComponent(copy.mfa.errors.removeNeedsVerify));
  }

  revalidatePath("/settings/security");
  redirect("/settings/security?removed=1");
}
