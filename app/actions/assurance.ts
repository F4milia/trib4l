"use server";

import { redirect } from "next/navigation";
import { fieldError, formError, type AuthFormState } from "@/lib/auth/form-errors";
import { withinAuthRateLimit } from "@/lib/auth/rate-limit";
import { copy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";

/**
 * Presents a code to raise the current session from aal1 to aal2 (S2).
 *
 * This is the step that makes an enrolled authenticator mean something. GoTrue
 * hands out an aal1 session for a correct password whether or not a factor
 * exists; without this screen, "two-factor is on" would be a claim the product
 * never honours.
 *
 * Rate-limited like every other auth endpoint, and keyed on the user rather than
 * the address: this is a six-digit secret, so unlimited attempts would make the
 * factor worth a million tries. GoTrue applies its own limit too; ours is the one
 * with a number the acceptance criterion names.
 */
export async function verifyAssuranceCode(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const code = String(formData.get("code") ?? "").trim();

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    redirect("/login");
  }

  if (!code) {
    return fieldError("password", copy.assurance.errors.codeRequired);
  }

  if (!(await withinAuthRateLimit("sign-in", user.user.id))) {
    return formError(copy.auth.rateLimit.tooManyAttempts);
  }

  /**
   * The first verified factor, chosen server-side. No factor id comes from the
   * form at all here -- unlike enrollment, where one has to, because the factor
   * does not exist yet when the screen is drawn. There is nothing for a caller
   * to point at.
   */
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) {
    // No verified factor: this screen should never have been reachable. Sending
    // them to enrolment is the only honest answer.
    redirect("/settings/security");
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) {
    return formError(copy.assurance.errors.challengeFailed);
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) {
    return formError(copy.assurance.errors.wrongCode);
  }

  redirect("/");
}
